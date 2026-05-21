"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "../../lib/appwrite-audit";
import {
    adminDeleteMessage,
    getAdminMessageAuditContext,
    adminRestoreMessage,
    adminSoftDeleteMessage,
} from "../../lib/appwrite-admin";
import { requireModerator } from "../../lib/auth-server";
import { recordMetric, recordTiming } from "../../lib/monitoring";

// Simple in-memory rate limiting (best effort, per runtime instance)
const ACTION_WINDOW_MS = 5000;
const ACTION_MAX = 10;
const DEDUPE_MS = 1200;
const actionLog: Record<string, number[]> = {};
const lastActionKey: Record<string, number> = {};

function checkRate(userId: string, action: string, messageId: string) {
    const now = Date.now();
    const key = `${userId}:${action}:${messageId}`;
    const list = actionLog[userId] || [];
    const cutoff = now - ACTION_WINDOW_MS;
    const pruned = list.filter((t) => t >= cutoff);
    pruned.push(now);
    actionLog[userId] = pruned;
    if (pruned.length > ACTION_MAX) {
        throw new Error("Rate limit exceeded");
    }
    const last = lastActionKey[key];
    if (last && now - last < DEDUPE_MS) {
        throw new Error("Duplicate action suppressed");
    }
    lastActionKey[key] = now;
}

async function assertModerator() {
    const { user } = await requireModerator();
    return { userId: user.$id };
}

function trimMessagePreview(text?: string) {
    if (!text) {
        return;
    }

    const normalized = text.trim();
    if (!normalized) {
        return;
    }

    const maxLength = 80;
    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}...`;
}

function buildMessageAuditMeta(
    action: "soft_delete" | "restore" | "hard_delete",
    message: Awaited<ReturnType<typeof getAdminMessageAuditContext>>,
    extra: Record<string, unknown>,
) {
    const actionDetails = {
        soft_delete: "Message removed by moderator",
        restore: "Message restored by moderator",
        hard_delete: "Message permanently deleted by admin",
    } as const;

    const preview = trimMessagePreview(message?.text);
    return {
        ...extra,
        serverId: message?.serverId,
        targetUserId: message?.userId,
        channelId: message?.channelId,
        messagePreview: preview,
        details: preview
            ? `${actionDetails[action]}: ${preview}`
            : actionDetails[action],
    };
}

export async function actionSoftDelete(messageId: string) {
    const { userId } = await assertModerator();
    checkRate(userId, "soft_delete", messageId);
    const start = Date.now();
    const message = await getAdminMessageAuditContext(messageId);
    await adminSoftDeleteMessage(messageId, userId);
    await recordAudit(
        "soft_delete",
        messageId,
        userId,
        buildMessageAuditMeta("soft_delete", message, {
            removedAt: new Date().toISOString(),
        }),
    );
    recordMetric("moderation.soft_delete.count");
    recordTiming("moderation.soft_delete.ms", start, { userId });
}

export async function actionRestore(messageId: string) {
    const { userId } = await assertModerator();
    checkRate(userId, "restore", messageId);
    const start = Date.now();
    const message = await getAdminMessageAuditContext(messageId);
    await adminRestoreMessage(messageId);
    await recordAudit(
        "restore",
        messageId,
        userId,
        buildMessageAuditMeta("restore", message, {
            restoredAt: new Date().toISOString(),
        }),
    );
    recordMetric("moderation.restore.count");
    recordTiming("moderation.restore.ms", start, { userId });
}

export async function actionHardDelete(messageId: string) {
    const { user, roles } = await requireModerator();
    if (!roles.isAdmin) {
        throw new Error(
            "Forbidden: Only admins can permanently delete messages",
        );
    }
    const userId = user.$id;
    checkRate(userId, "hard_delete", messageId);
    const start = Date.now();
    const message = await getAdminMessageAuditContext(messageId);
    await adminDeleteMessage(messageId);
    await recordAudit(
        "hard_delete",
        messageId,
        userId,
        buildMessageAuditMeta("hard_delete", message, {
            deletedAt: new Date().toISOString(),
        }),
    );
    recordMetric("moderation.hard_delete.count");
    recordTiming("moderation.hard_delete.ms", start, { userId });
}

// Wrapper actions for form binding
export async function actionSoftDeleteBound(formData: FormData) {
    const messageId = formData.get("messageId") as string;
    if (!messageId) {
        throw new Error("Missing messageId");
    }
    await actionSoftDelete(messageId);
    revalidatePath("/moderation");
}

export async function actionRestoreBound(formData: FormData) {
    const messageId = formData.get("messageId") as string;
    if (!messageId) {
        throw new Error("Missing messageId");
    }
    await actionRestore(messageId);
    revalidatePath("/moderation");
}

export async function actionHardDeleteBound(formData: FormData) {
    const messageId = formData.get("messageId") as string;
    if (!messageId) {
        throw new Error("Missing messageId");
    }
    await actionHardDelete(messageId);
    revalidatePath("/moderation");
}
