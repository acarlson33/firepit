import { ID, Permission, Query, Role } from "node-appwrite";
import { randomUUID } from "node:crypto";

import { getEnvConfig } from "@/lib/appwrite-core";
import { listPages } from "@/lib/appwrite-pagination";
import { logger } from "@/lib/newrelic-utils";
import { getServerClient } from "@/lib/appwrite-server";
import type {
    Announcement,
    AnnouncementCreateMode,
    AnnouncementDelivery,
    AnnouncementPriority,
    AnnouncementStatus,
    AnnouncementUrgentBypass,
} from "@/lib/types";

const DEFAULT_ANNOUNCEMENTS_COLLECTION = "announcements";
const DEFAULT_ANNOUNCEMENT_DELIVERIES_COLLECTION =
    "announcement_deliveries";
const MAX_ANNOUNCEMENT_BODY_LENGTH = 65_000;
const MAX_ANNOUNCEMENT_TITLE_LENGTH = 255;
const MAX_DELIVERY_ATTEMPTS = 6;
const MAX_ANNOUNCEMENT_DISPATCH_ATTEMPTS = 10;
const ANNOUNCEMENT_DELIVERY_CONCURRENCY = 10;
const DELIVERY_BACKOFF_BASE_MS = 60_000;
const DELIVERY_BACKOFF_MAX_MS = 30 * 60_000;
type DeliveryOutcome =
    | {
          outcome: "already_delivered";
      }
    | {
          outcome: "deferred_retry";
      }
    | {
          outcome: "delivered";
      }
    | {
          outcome: "failed";
      };

type DeliveryStatusRollup = {
    delivered: number;
    failed: number;
    pending: number;
    total: number;
};

type DeliveryUpdatePayload = {
    attemptCount?: number;
    conversationId?: string;
    deliveredAt?: string;
    failedAt?: string;
    failureReason?: string;
    messageId?: string;
    nextAttemptAt?: string;
    status: "pending" | "delivered" | "failed";
};

type CreateAnnouncementInput = {
    actorId: string;
    body: string;
    title?: string;
    mode?: AnnouncementCreateMode;
    scheduledFor?: string;
    priority?: AnnouncementPriority;
    idempotencyKey?: string;
};

type ListAnnouncementsOptions = {
    cursorAfter?: string;
    limit?: number;
    statuses?: AnnouncementStatus[];
};

type ListAnnouncementsResult = {
    items: Announcement[];
    nextCursor?: string;
};

type DispatchScheduledAnnouncementsResult = {
    dueCount: number;
    announcementIds: string[];
};

function getAnnouncementsCollectionId(): string {
    return (
        process.env.APPWRITE_ANNOUNCEMENTS_COLLECTION_ID?.trim() ||
        DEFAULT_ANNOUNCEMENTS_COLLECTION
    );
}

function getAnnouncementDeliveriesCollectionId(): string {
    return (
        process.env.APPWRITE_ANNOUNCEMENT_DELIVERIES_COLLECTION_ID?.trim() ||
        DEFAULT_ANNOUNCEMENT_DELIVERIES_COLLECTION
    );
}

function getAnnouncementThreadKey(systemSenderUserId: string, recipientId: string) {
    return `${systemSenderUserId}:${recipientId}`;
}

export class ClientError extends Error {}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function isDuplicateConstraintError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as {
        code?: unknown;
        message?: unknown;
        type?: unknown;
    };
    const message =
        typeof candidate.message === "string"
            ? candidate.message.toLowerCase()
            : "";
    const type =
        typeof candidate.type === "string"
            ? candidate.type.toLowerCase()
            : "";

    return (
        candidate.code === 409 ||
        message.includes("duplicate") ||
        message.includes("already exists") ||
        message.includes("unique") ||
        type.includes("conflict") ||
        type.includes("duplicate")
    );
}

function getNextDeliveryRetryIso(attemptCount: number): string {
    const backoffMs = Math.min(
        DELIVERY_BACKOFF_BASE_MS * 2 ** Math.max(attemptCount - 1, 0),
        DELIVERY_BACKOFF_MAX_MS,
    );

    return new Date(Date.now() + backoffMs).toISOString();
}

function toAnnouncementDelivery(
    document: Record<string, unknown>,
): AnnouncementDelivery {
    return {
        $id: String(document.$id),
        announcementId: String(document.announcementId),
        attemptCount:
            typeof document.attemptCount === "number" ? document.attemptCount : 0,
        conversationId:
            typeof document.conversationId === "string"
                ? document.conversationId
                : undefined,
        deliveredAt:
            typeof document.deliveredAt === "string"
                ? document.deliveredAt
                : undefined,
        failedAt:
            typeof document.failedAt === "string" ? document.failedAt : undefined,
        failureReason:
            typeof document.failureReason === "string"
                ? document.failureReason
                : undefined,
        messageId:
            typeof document.messageId === "string" ? document.messageId : undefined,
        nextAttemptAt:
            typeof document.nextAttemptAt === "string"
                ? document.nextAttemptAt
                : undefined,
        recipientUserId: String(document.recipientUserId),
        status:
            document.status === "delivered" || document.status === "failed"
                ? document.status
                : "pending",
        $createdAt:
            typeof document.$createdAt === "string" ? document.$createdAt : undefined,
        $updatedAt:
            typeof document.$updatedAt === "string" ? document.$updatedAt : undefined,
    };
}

function parseAnnouncementStatus(value: unknown): AnnouncementStatus {
    switch (value) {
        case "draft":
        case "scheduled":
        case "dispatching":
        case "sent":
        case "failed":
        case "archived":
            return value;
        default:
            return "draft";
    }
}

function normalizeTitle(value?: string): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }

    const trimmedTitle = value.trim();
    if (!trimmedTitle) {
        return undefined;
    }

    if (trimmedTitle.length > MAX_ANNOUNCEMENT_TITLE_LENGTH) {
        throw new ClientError(
            `Announcement title must be ${MAX_ANNOUNCEMENT_TITLE_LENGTH} characters or fewer`,
        );
    }

    return trimmedTitle;
}

function normalizeBody(value: string): string {
    const trimmedBody = value.trim();
    if (!trimmedBody) {
        throw new ClientError("Announcement body is required");
    }

    if (trimmedBody.length > MAX_ANNOUNCEMENT_BODY_LENGTH) {
        throw new ClientError(
            `Announcement body must be ${MAX_ANNOUNCEMENT_BODY_LENGTH} characters or fewer`,
        );
    }

    return trimmedBody;
}

function normalizeMode(mode?: AnnouncementCreateMode): AnnouncementCreateMode {
    return mode ?? "draft";
}

function resolvePriority(priority?: AnnouncementPriority): AnnouncementPriority {
    return priority === "urgent" ? "urgent" : "normal";
}

function parseIsoTimestamp(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new ClientError("Invalid scheduledFor timestamp");
    }

    return parsed.toISOString();
}

function resolveScheduledFor(params: {
    mode: AnnouncementCreateMode;
    scheduledFor?: string;
}): string | undefined {
    const { mode, scheduledFor } = params;

    if (mode === "draft") {
        return undefined;
    }

    if (mode === "send_now") {
        return new Date().toISOString();
    }

    if (typeof scheduledFor !== "string" || !scheduledFor.trim()) {
        throw new ClientError("scheduledFor is required when mode is schedule");
    }

    return parseIsoTimestamp(scheduledFor);
}

function resolveStatusForMode(mode: AnnouncementCreateMode): AnnouncementStatus {
    if (mode === "draft") {
        return "draft";
    }

    return "scheduled";
}

function defaultUrgentBypass(
    priority: AnnouncementPriority,
): AnnouncementUrgentBypass {
    const isUrgent = priority === "urgent";

    return {
        quietHours: isUrgent,
        globalNotifications: isUrgent,
        directMessagePrivacy: isUrgent,
    };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object";
}

function isAnnouncementUrgentBypass(
    value: unknown,
): value is AnnouncementUrgentBypass {
    if (!isRecordValue(value)) {
        return false;
    }

    return (
        typeof value.quietHours === "boolean" &&
        typeof value.globalNotifications === "boolean" &&
        typeof value.directMessagePrivacy === "boolean"
    );
}

function isDeliverySummary(
    value: unknown,
): value is Announcement["deliverySummary"] {
    if (!isRecordValue(value)) {
        return false;
    }

    return (
        typeof value.attempted === "number" &&
        Number.isFinite(value.attempted) &&
        value.attempted >= 0 &&
        typeof value.delivered === "number" &&
        Number.isFinite(value.delivered) &&
        value.delivered >= 0 &&
        typeof value.failed === "number" &&
        Number.isFinite(value.failed) &&
        value.failed >= 0
    );
}

function describeParsedValue(value: unknown): Record<string, unknown> {
    if (Array.isArray(value)) {
        return {
            kind: "array",
            length: value.length,
        };
    }

    if (isRecordValue(value)) {
        return {
            kind: "object",
            keys: Object.keys(value),
        };
    }

    return {
        kind: typeof value,
        value,
    };
}

function parseSerializedObject<T>(
    source: unknown,
    fallback: T,
    params: {
        errorContext: string;
        validatorName: string;
        validate: (value: unknown) => value is T;
    },
): T {
    const { errorContext, validate, validatorName } = params;

    if (typeof source !== "string" || !source.trim()) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(source) as unknown;
        if (!validate(parsed)) {
            logger.warn("Invalid announcement metadata shape", {
                errorContext,
                validatorName,
                parsed: describeParsedValue(parsed),
            });
            return fallback;
        }

        return parsed;
    } catch (error) {
        logger.warn("Failed to parse announcement metadata", {
            error:
                error instanceof Error ? error.message : String(error),
            errorContext,
        });
        return fallback;
    }
}

function toAnnouncement(document: Record<string, unknown>): Announcement {
    const urgentBypass = parseSerializedObject<AnnouncementUrgentBypass>(
        document.urgentBypass,
        {
            directMessagePrivacy: false,
            globalNotifications: false,
            quietHours: false,
        },
        {
            errorContext: "urgentBypass",
            validate: isAnnouncementUrgentBypass,
            validatorName: "isAnnouncementUrgentBypass",
        },
    );

    const deliverySummary = parseSerializedObject<
        Announcement["deliverySummary"]
    >(
        document.deliverySummary,
        {
            attempted: 0,
            delivered: 0,
            failed: 0,
        },
        {
            errorContext: "deliverySummary",
            validate: isDeliverySummary,
            validatorName: "isDeliverySummary",
        },
    );

    return {
        $id: String(document.$id),
        body: typeof document.body === "string" ? document.body : "",
        bodyFormat:
            document.bodyFormat === "markdown" ? document.bodyFormat : "markdown",
        createdBy:
            typeof document.createdBy === "string" ? document.createdBy : "",
        dispatchAttempts:
            typeof document.dispatchAttempts === "number"
                ? document.dispatchAttempts
                : 0,
        errorDetails:
            typeof document.errorDetails === "string"
                ? document.errorDetails
                : undefined,
        idempotencyKey:
            typeof document.idempotencyKey === "string"
                ? document.idempotencyKey
                : undefined,
        lastDispatchAt:
            typeof document.lastDispatchAt === "string"
                ? document.lastDispatchAt
                : undefined,
        priority: document.priority === "urgent" ? "urgent" : "normal",
        publishedAt:
            typeof document.publishedAt === "string"
                ? document.publishedAt
                : undefined,
        recipientScope: "all_profiles",
        scheduledFor:
            typeof document.scheduledFor === "string"
                ? document.scheduledFor
                : undefined,
        status:
            typeof document.status === "string"
                ? parseAnnouncementStatus(document.status)
                : "draft",
        title: typeof document.title === "string" ? document.title : undefined,
        urgentBypass,
        deliverySummary,
        $createdAt:
            typeof document.$createdAt === "string"
                ? document.$createdAt
                : undefined,
        $updatedAt:
            typeof document.$updatedAt === "string"
                ? document.$updatedAt
                : undefined,
    };
}

export function getAnnouncementRuntimeSettings() {
    const systemSenderUserId = process.env.SYSTEM_SENDER_USER_ID?.trim() || null;
    const dispatcherSecret =
        process.env.ANNOUNCEMENTS_DISPATCHER_SECRET?.trim() || null;

    return {
        dispatcherSecret,
        systemSenderUserId,
    };
}

export async function createAnnouncement(
    input: CreateAnnouncementInput,
): Promise<Announcement> {
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();

    const mode = normalizeMode(input.mode);
    const priority = resolvePriority(input.priority);
    const title = normalizeTitle(input.title);
    const body = normalizeBody(input.body);
    const scheduledFor = resolveScheduledFor({
        mode,
        scheduledFor: input.scheduledFor,
    });
    const idempotencyKey =
        typeof input.idempotencyKey === "string"
            ? input.idempotencyKey.trim()
            : "";
    const resolvedIdempotencyKey =
        idempotencyKey.length > 0
            ? idempotencyKey
            : `auto:${randomUUID()}`;
    const status = resolveStatusForMode(mode);
    const now = new Date().toISOString();

    if (idempotencyKey.length > 0) {
        const existing = await databases.listDocuments(
            databaseId,
            getAnnouncementsCollectionId(),
            [
                Query.equal("idempotencyKey", idempotencyKey),
                Query.equal("createdBy", input.actorId),
                Query.limit(1),
            ],
        );

        const existingDocument = existing.documents.at(0);
        if (existingDocument) {
            return toAnnouncement(
                existingDocument as unknown as Record<string, unknown>,
            );
        }
    }

    try {
        const document = await databases.createDocument(
            databaseId,
            getAnnouncementsCollectionId(),
            ID.unique(),
            {
                body,
                bodyFormat: "markdown",
                createdBy: input.actorId,
                deliverySummary: JSON.stringify({
                    attempted: 0,
                    delivered: 0,
                    failed: 0,
                }),
                dispatchAttempts: 0,
                idempotencyKey: resolvedIdempotencyKey,
                lastDispatchAt: undefined,
                priority,
                publishedAt: mode === "send_now" ? now : undefined,
                recipientScope: "all_profiles",
                scheduledFor,
                status,
                title,
                urgentBypass: JSON.stringify(defaultUrgentBypass(priority)),
            },
        );

        return toAnnouncement(document as unknown as Record<string, unknown>);
    } catch (error) {
        if (
            idempotencyKey.length > 0 &&
            isDuplicateConstraintError(error)
        ) {
            const existing = await databases.listDocuments(
                databaseId,
                getAnnouncementsCollectionId(),
                [
                    Query.equal("idempotencyKey", idempotencyKey),
                    Query.equal("createdBy", input.actorId),
                    Query.limit(1),
                ],
            );

            const existingDocument = existing.documents.at(0);
            if (existingDocument) {
                return toAnnouncement(
                    existingDocument as unknown as Record<string, unknown>,
                );
            }
        }

        throw error;
    }
}

async function listAllProfileUserIds(excludeUserId?: string): Promise<string[]> {
    const { databases } = getServerClient();
    const env = getEnvConfig();

    const { documents } = await listPages({
        databases,
        databaseId: env.databaseId,
        collectionId: env.collections.profiles,
        baseQueries: [Query.orderAsc("$id")],
        pageSize: 100,
        warningContext: "listAllProfileUserIds",
    });

    const recipientIds: string[] = [];
    for (const document of documents) {
        const userId = typeof document.userId === "string" ? document.userId.trim() : "";
        if (!userId || userId === excludeUserId) {
            continue;
        }
        recipientIds.push(userId);
    }

    return Array.from(new Set(recipientIds));
}

async function getDeliveryRecord(
    announcementId: string,
    recipientUserId: string,
): Promise<AnnouncementDelivery | null> {
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();

    const response = await databases.listDocuments(
        databaseId,
        getAnnouncementDeliveriesCollectionId(),
        [
            Query.equal("announcementId", announcementId),
            Query.equal("recipientUserId", recipientUserId),
            Query.limit(1),
        ],
    );

    if (response.documents.length === 0) {
        return null;
    }

    return toAnnouncementDelivery(
        response.documents[0] as unknown as Record<string, unknown>,
    );
}

async function upsertDeliveryRecord(params: {
    announcementId: string;
    delivery: DeliveryUpdatePayload;
    existing?: AnnouncementDelivery | null;
    recipientUserId: string;
}): Promise<AnnouncementDelivery> {
    const { announcementId, delivery, existing, recipientUserId } = params;
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();
    const payload: Record<string, unknown> = {
        announcementId,
        recipientUserId,
        ...delivery,
    };

    if (existing) {
        const updated = await databases.updateDocument(
            databaseId,
            getAnnouncementDeliveriesCollectionId(),
            existing.$id,
            payload,
        );
        return toAnnouncementDelivery(updated as unknown as Record<string, unknown>);
    }

    const created = await databases.createDocument(
        databaseId,
        getAnnouncementDeliveriesCollectionId(),
        ID.unique(),
        payload,
    );
    return toAnnouncementDelivery(created as unknown as Record<string, unknown>);
}

async function ensureAnnouncementThreadConversation(params: {
    recipientUserId: string;
    systemSenderUserId: string;
}): Promise<string> {
    const { recipientUserId, systemSenderUserId } = params;
    const { databases } = getServerClient();
    const { databaseId, collections } = getEnvConfig();
    const announcementThreadKey = getAnnouncementThreadKey(
        systemSenderUserId,
        recipientUserId,
    );
    const existing = await databases.listDocuments(
        databaseId,
        collections.conversations,
        [
            Query.equal("isSystemAnnouncementThread", true),
            Query.equal("announcementThreadKey", announcementThreadKey),
            Query.limit(1),
        ],
    );

    if (existing.documents.length > 0) {
        return String(existing.documents[0].$id);
    }

    const participants = [recipientUserId, systemSenderUserId].sort((a, b) =>
        a.localeCompare(b),
    );
    const permissions = [
        Permission.read(Role.user(systemSenderUserId)),
        Permission.read(Role.user(recipientUserId)),
        Permission.update(Role.user(systemSenderUserId)),
        Permission.delete(Role.user(systemSenderUserId)),
    ];

    const conversation = await databases.createDocument(
        databaseId,
        collections.conversations,
        ID.unique(),
        {
            announcementThreadKey,
            createdBy: systemSenderUserId,
            isGroup: false,
            isSystemAnnouncementThread: true,
            lastMessageAt: new Date().toISOString(),
            name: "System Announcements",
            participants,
        },
        permissions,
    );

    return String(conversation.$id);
}

async function sendSystemAnnouncementMessage(params: {
    announcement: Announcement;
    conversationId: string;
    recipientUserId: string;
    systemSenderUserId: string;
}): Promise<string> {
    const { announcement, conversationId, recipientUserId, systemSenderUserId } =
        params;
    const { databases } = getServerClient();
    const { databaseId, collections } = getEnvConfig();

    const messagePermissions = [
        Permission.read(Role.user(systemSenderUserId)),
        Permission.read(Role.user(recipientUserId)),
        Permission.update(Role.user(systemSenderUserId)),
        Permission.delete(Role.user(systemSenderUserId)),
    ];

    const message = await databases.createDocument(
        databaseId,
        collections.directMessages,
        ID.unique(),
        {
            announcementId: announcement.$id,
            conversationId,
            isSystemAnnouncement: true,
            priorityTag: announcement.priority,
            receiverId: recipientUserId,
            senderId: systemSenderUserId,
            text: announcement.body,
        },
        messagePermissions,
    );

    await databases.updateDocument(
        databaseId,
        collections.conversations,
        conversationId,
        {
            lastMessageAt: new Date().toISOString(),
        },
    );

    return String(message.$id);
}

async function dispatchToRecipient(params: {
    announcement: Announcement;
    recipientUserId: string;
    systemSenderUserId: string;
}): Promise<DeliveryOutcome> {
    const { announcement, recipientUserId, systemSenderUserId } = params;
    const existingDelivery = await getDeliveryRecord(
        announcement.$id,
        recipientUserId,
    );

    if (existingDelivery?.status === "delivered") {
        return { outcome: "already_delivered" };
    }

    if (
        existingDelivery?.status === "failed" &&
        existingDelivery.nextAttemptAt &&
        Date.parse(existingDelivery.nextAttemptAt) > Date.now()
    ) {
        return { outcome: "deferred_retry" };
    }

    const attemptCount = (existingDelivery?.attemptCount ?? 0) + 1;

    try {
        const conversationId = await ensureAnnouncementThreadConversation({
            recipientUserId,
            systemSenderUserId,
        });
        const messageId = await sendSystemAnnouncementMessage({
            announcement,
            conversationId,
            recipientUserId,
            systemSenderUserId,
        });

        await upsertDeliveryRecord({
            announcementId: announcement.$id,
            delivery: {
                attemptCount,
                conversationId,
                deliveredAt: new Date().toISOString(),
                failureReason: undefined,
                failedAt: undefined,
                messageId,
                nextAttemptAt: undefined,
                status: "delivered",
            },
            existing: existingDelivery,
            recipientUserId,
        });

        return { outcome: "delivered" };
    } catch (error) {
        const exhaustedAttempts = attemptCount >= MAX_DELIVERY_ATTEMPTS;

        await upsertDeliveryRecord({
            announcementId: announcement.$id,
            delivery: {
                attemptCount,
                failedAt: new Date().toISOString(),
                failureReason: toErrorMessage(error).slice(0, 2_000),
                nextAttemptAt: exhaustedAttempts
                    ? undefined
                    : getNextDeliveryRetryIso(attemptCount),
                status: "failed",
            },
            existing: existingDelivery,
            recipientUserId,
        });

        logger.warn("Announcement delivery failed", {
            announcementId: announcement.$id,
            attemptCount,
            error: toErrorMessage(error),
            exhaustedAttempts,
            recipientUserId,
        });

        return { outcome: "failed" };
    }
}

async function runWithConcurrency<T>(params: {
    items: T[];
    concurrency: number;
    worker: (item: T) => Promise<void>;
}): Promise<void> {
    const { items, concurrency, worker } = params;
    const workerCount = Math.min(Math.max(1, concurrency), items.length);

    if (workerCount === 0) {
        return;
    }

    let nextIndex = 0;
    const runners = Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            const item = items.at(currentIndex);
            if (item === undefined) {
                continue;
            }

            await worker(item);
        }
    });

    await Promise.all(runners);
}

async function rollupDeliveryStatus(
    announcementId: string,
): Promise<DeliveryStatusRollup> {
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();
    let delivered = 0;
    let failed = 0;
    let pending = 0;
    let total = 0;
    const { documents } = await listPages({
        databases,
        databaseId,
        collectionId: getAnnouncementDeliveriesCollectionId(),
        baseQueries: [Query.equal("announcementId", announcementId), Query.orderAsc("$id")],
        pageSize: 100,
        warningContext: "rollupDeliveryStatus",
    });

    for (const document of documents) {
        total += 1;
        if (document.status === "delivered") {
            delivered += 1;
            continue;
        }

        if (document.status === "pending") {
            pending += 1;
            continue;
        }

        failed += 1;
    }

    return {
        delivered,
        failed,
        pending,
        total,
    };
}

async function finalizeAnnouncementDispatch(params: {
    announcement: Announcement;
    dispatchAttempts: number;
    rollup: DeliveryStatusRollup;
}): Promise<void> {
    const { announcement, dispatchAttempts, rollup } = params;
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();

    let status: AnnouncementStatus = "dispatching";
    if (rollup.total === 0 || rollup.delivered === rollup.total) {
        status = "sent";
    } else if (dispatchAttempts >= MAX_ANNOUNCEMENT_DISPATCH_ATTEMPTS) {
        status = "failed";
    }

    const updatePayload: Record<string, unknown> = {
        deliverySummary: JSON.stringify({
            attempted: rollup.total,
            delivered: rollup.delivered,
            failed: rollup.failed,
        }),
        dispatchAttempts,
        lastDispatchAt: new Date().toISOString(),
        publishedAt: announcement.publishedAt ?? new Date().toISOString(),
        status,
    };

    await databases.updateDocument(
        databaseId,
        getAnnouncementsCollectionId(),
        announcement.$id,
        updatePayload,
    );
}

export async function listAnnouncements(
    options: ListAnnouncementsOptions = {},
): Promise<ListAnnouncementsResult> {
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();

    const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
    const queries = [Query.orderDesc("$createdAt"), Query.limit(limit)];

    if (options.cursorAfter) {
        queries.push(Query.cursorAfter(options.cursorAfter));
    }

    if (options.statuses && options.statuses.length > 0) {
        queries.push(Query.equal("status", options.statuses));
    }

    const response = await databases.listDocuments(
        databaseId,
        getAnnouncementsCollectionId(),
        queries,
    );

    const items = response.documents.map((document) =>
        toAnnouncement(document as unknown as Record<string, unknown>),
    );

    const nextCursor =
        items.length === limit ? items.at(-1)?.$id : undefined;

    return {
        items,
        nextCursor,
    };
}

export async function dispatchScheduledAnnouncements(
    limit = 25,
): Promise<DispatchScheduledAnnouncementsResult> {
    const { databases } = getServerClient();
    const { databaseId } = getEnvConfig();
    const { systemSenderUserId } = getAnnouncementRuntimeSettings();

    if (!systemSenderUserId) {
        throw new Error("SYSTEM_SENDER_USER_ID is required to dispatch announcements");
    }

    const now = new Date().toISOString();
    const clampedLimit = Math.max(1, Math.min(limit, 100));

    const due = await databases.listDocuments(
        databaseId,
        getAnnouncementsCollectionId(),
        [
            Query.equal("status", ["scheduled", "dispatching"]),
            Query.lessThanEqual("scheduledFor", now),
            Query.orderAsc("$createdAt"),
            Query.limit(clampedLimit),
        ],
    );

    const updatedIds: string[] = [];

    for (const document of due.documents) {
        const announcement = toAnnouncement(
            document as unknown as Record<string, unknown>,
        );
        const dispatchAttempts =
            typeof document.dispatchAttempts === "number"
                ? document.dispatchAttempts
                : 0;
        const nextDispatchAttempts = dispatchAttempts + 1;

        try {
            await databases.updateDocument(
                databaseId,
                getAnnouncementsCollectionId(),
                announcement.$id,
                {
                    dispatchAttempts: nextDispatchAttempts,
                    lastDispatchAt: now,
                    status: "dispatching",
                },
            );

            const recipientIds = await listAllProfileUserIds(systemSenderUserId);

            await runWithConcurrency({
                items: recipientIds,
                concurrency: ANNOUNCEMENT_DELIVERY_CONCURRENCY,
                worker: async (recipientUserId) => {
                    try {
                        await dispatchToRecipient({
                            announcement,
                            recipientUserId,
                            systemSenderUserId,
                        });
                    } catch (error) {
                        logger.error("Announcement delivery worker crashed", {
                            announcementId: announcement.$id,
                            error: toErrorMessage(error),
                            recipientUserId,
                        });
                    }
                },
            });

            // Mark this announcement as updated (dispatch succeeded)
            updatedIds.push(announcement.$id);
        } catch (error) {
            logger.error("Announcement dispatch failed", {
                announcementId: announcement.$id,
                error: toErrorMessage(error),
            });

            try {
                const failedStatus: AnnouncementStatus =
                    nextDispatchAttempts >= MAX_ANNOUNCEMENT_DISPATCH_ATTEMPTS
                        ? "failed"
                        : "dispatching";

                await databases.updateDocument(
                    databaseId,
                    getAnnouncementsCollectionId(),
                    announcement.$id,
                    {
                        dispatchAttempts: nextDispatchAttempts,
                        lastDispatchAt: now,
                        status: failedStatus,
                    },
                );
            } catch (updateError) {
                logger.error("Failed to persist announcement failure state", {
                    announcementId: announcement.$id,
                    error: toErrorMessage(updateError),
                });
            }

            continue;
        }

        // Perform post-dispatch bookkeeping separately so failures here do not
        // consume retry budget or change dispatchAttempts/status.
        try {
            const rollup = await rollupDeliveryStatus(announcement.$id);
            await finalizeAnnouncementDispatch({
                announcement,
                dispatchAttempts: nextDispatchAttempts,
                rollup,
            });
        } catch (finalizeError) {
            logger.error("Post-dispatch finalization failed", {
                announcementId: announcement.$id,
                error: toErrorMessage(finalizeError),
            });
            // Intentionally do not update dispatchAttempts or status here.
            continue;
        }
    }

    return {
        announcementIds: updatedIds,
        dueCount: updatedIds.length,
    };
}
