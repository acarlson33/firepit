import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { isDocumentNotFoundError } from "@/lib/appwrite-admin";
import { listPages } from "@/lib/appwrite-pagination";
import { deleteServer } from "@/lib/appwrite-servers";
import { recordAudit } from "@/lib/appwrite-audit";
import { getServerClient } from "@/lib/appwrite-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { getActualMemberCount } from "@/lib/membership-count";
import {
    mapServerDocument,
    normalizeServerDescription,
    normalizeServerFileId,
} from "@/lib/server-metadata";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";
import { logger } from "@/lib/newrelic-utils";

const MAX_SERVER_NAME_LENGTH = 100;
const MAX_SERVER_DESCRIPTION_LENGTH = 500;

const defaultOnSignupMutexState = {
    locked: false,
    waiters: [] as Array<() => void>,
};

async function withDefaultOnSignupMutex<T>(task: () => Promise<T>): Promise<T> {
    if (defaultOnSignupMutexState.locked) {
        await new Promise<void>((resolve) => {
            defaultOnSignupMutexState.waiters.push(resolve);
        });
    }

    defaultOnSignupMutexState.locked = true;

    try {
        return await task();
    } finally {
        const next = defaultOnSignupMutexState.waiters.shift();
        if (next) {
            next();
        } else {
            defaultOnSignupMutexState.locked = false;
        }
    }
}

type RouteContext = {
    params: Promise<{ serverId: string }>;
};

type PatchPayload = {
    name?: unknown;
    description?: unknown;
    iconFileId?: unknown;
    bannerFileId?: unknown;
    isPublic?: unknown;
    defaultOnSignup?: unknown;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    let payload: PatchPayload;
    try {
        payload = (await request.json()) as PatchPayload;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON payload" },
            { status: 400 },
        );
    }
    const env = getEnvConfig();
    const { databases, storage } = getServerClient();
    const { serverId } = await context.params;

    let serverDocument: Record<string, unknown>;
    try {
        const response = await databases.getDocument(
            env.databaseId,
            env.collections.servers,
            serverId,
        );
        serverDocument = response as unknown as Record<string, unknown>;
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return NextResponse.json(
                { error: "Server not found" },
                { status: 404 },
            );
        }

        logger.error("Failed to load server during PATCH", {
            error: error instanceof Error ? error.message : String(error),
            serverId,
            userId: session.$id,
        });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }

    const isOwner = String(serverDocument.ownerId) === session.$id;
    if (!isOwner) {
        const access = await getServerPermissionsForUser(
            databases,
            env,
            serverId,
            session.$id,
        );

        if (!access.isMember || !access.permissions.manageServer) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    const updates: Record<string, unknown> = {};
    const changedFields: string[] = [];
    let defaultServersToClear: Array<{ $id: string }> = [];
    if (Object.hasOwn(payload, "name")) {
        if (typeof payload.name !== "string") {
            return NextResponse.json(
                { error: "name must be a string" },
                { status: 400 },
            );
        }

        const trimmedName = payload.name.trim();
        if (!trimmedName) {
            return NextResponse.json(
                { error: "Server name is required" },
                { status: 400 },
            );
        }
        if (trimmedName.length > MAX_SERVER_NAME_LENGTH) {
            return NextResponse.json(
                {
                    error: `Server name must be ${MAX_SERVER_NAME_LENGTH} characters or fewer`,
                },
                { status: 400 },
            );
        }

        updates.name = trimmedName;
        changedFields.push("name");
    }

    if (Object.hasOwn(payload, "description")) {
        if (payload.description === null || payload.description === "") {
            updates.description = null;
            changedFields.push("description");
        } else if (typeof payload.description === "string") {
            const normalizedDescription = normalizeServerDescription(
                payload.description,
            );

            if (
                normalizedDescription &&
                normalizedDescription.length > MAX_SERVER_DESCRIPTION_LENGTH
            ) {
                return NextResponse.json(
                    {
                        error: `Description must be ${MAX_SERVER_DESCRIPTION_LENGTH} characters or fewer`,
                    },
                    { status: 400 },
                );
            }

            updates.description = normalizedDescription ?? null;
            changedFields.push("description");
        } else {
            return NextResponse.json(
                { error: "description must be a string or null" },
                { status: 400 },
            );
        }
    }

    if (Object.hasOwn(payload, "isPublic")) {
        if (typeof payload.isPublic !== "boolean") {
            return NextResponse.json(
                { error: "isPublic must be a boolean" },
                { status: 400 },
            );
        }

        updates.isPublic = payload.isPublic;
        changedFields.push("isPublic");
    }

    if (Object.hasOwn(payload, "defaultOnSignup")) {
        if (typeof payload.defaultOnSignup !== "boolean") {
            return NextResponse.json(
                { error: "defaultOnSignup must be a boolean" },
                { status: 400 },
            );
        }

        const roles = await getUserRoles(session.$id);
        if (!roles.isAdmin) {
            return NextResponse.json(
                {
                    error: "Only instance administrators can update defaultOnSignup",
                },
                { status: 403 },
            );
        }

        updates.defaultOnSignup = payload.defaultOnSignup;
        changedFields.push("defaultOnSignup");
    }

    if (Object.hasOwn(payload, "iconFileId")) {
        if (payload.iconFileId === null || payload.iconFileId === "") {
            updates.iconFileId = null;
            changedFields.push("iconFileId");
        } else {
            const iconFileId = normalizeServerFileId(payload.iconFileId);
            if (!iconFileId) {
                return NextResponse.json(
                    { error: "iconFileId must be a valid Appwrite file ID" },
                    { status: 400 },
                );
            }

            updates.iconFileId = iconFileId;
            changedFields.push("iconFileId");
        }
    }

    if (Object.hasOwn(payload, "bannerFileId")) {
        if (payload.bannerFileId === null || payload.bannerFileId === "") {
            updates.bannerFileId = null;
            changedFields.push("bannerFileId");
        } else {
            const bannerFileId = normalizeServerFileId(payload.bannerFileId);
            if (!bannerFileId) {
                return NextResponse.json(
                    { error: "bannerFileId must be a valid Appwrite file ID" },
                    { status: 400 },
                );
            }

            updates.bannerFileId = bannerFileId;
            changedFields.push("bannerFileId");
        }
    }

    if (changedFields.length === 0) {
        return NextResponse.json(
            { error: "No valid fields provided for update" },
            { status: 400 },
        );
    }

    const previousIconFileId = normalizeServerFileId(serverDocument.iconFileId);
    const previousBannerFileId = normalizeServerFileId(
        serverDocument.bannerFileId,
    );
    const previousDefaultOnSignup = serverDocument.defaultOnSignup === true;

    let updatedServerDocument: Record<string, unknown> | undefined;

    if (payload.defaultOnSignup === true) {
        const lockResult = await withDefaultOnSignupMutex(async () => {
            const pageSize = 100;
            const existingDefaultServers: Array<{ $id: string }> = [];

            try {
                const baseQueries: string[] = [];
                const q = Query as unknown as { select?: (attrs: string[]) => unknown };
                if (typeof q.select === "function") {
                    baseQueries.push(q.select(["$id"]) as string);
                }
                baseQueries.push(Query.equal("defaultOnSignup", true));

                const { documents, truncated } = await listPages({
                    databases,
                    databaseId: env.databaseId,
                    collectionId: env.collections.servers,
                    baseQueries,
                    pageSize,
                    warningContext: "listDefaultSignupServersPATCH",
                });

                if (truncated) {
                    throw new Error("listDefaultSignupServersPATCH truncated");
                }

                for (const document of documents) {
                    if (typeof document.$id === "string") {
                        existingDefaultServers.push({ $id: document.$id });
                    }
                }
            } catch (error) {
                logger.error("Failed to list default signup servers during PATCH", {
                    error: error instanceof Error ? error.message : String(error),
                    serverId,
                    userId: session.$id,
                });
                return NextResponse.json(
                    { error: "Internal server error" },
                    { status: 500 },
                );
            }

            defaultServersToClear = existingDefaultServers.filter(
                (defaultServer) => defaultServer.$id !== serverId,
            );

            try {
                updatedServerDocument = (await databases.updateDocument(
                    env.databaseId,
                    env.collections.servers,
                    serverId,
                    updates,
                )) as unknown as Record<string, unknown>;
            } catch (error) {
                logger.error("Failed to update server document", {
                    collectionId: env.collections.servers,
                    error: error instanceof Error ? error.message : String(error),
                    serverId,
                    userId: session.$id,
                });

                return NextResponse.json(
                    { error: "Failed to update server" },
                    { status: 500 },
                );
            }

            if (defaultServersToClear.length > 0) {
                const resetResults = await Promise.allSettled(
                    defaultServersToClear.map((defaultServer) =>
                        databases.updateDocument(
                            env.databaseId,
                            env.collections.servers,
                            defaultServer.$id,
                            { defaultOnSignup: false },
                        ),
                    ),
                );

                const hasResetFailure = resetResults.some(
                    (result) => result.status === "rejected",
                );

                for (const [index, result] of resetResults.entries()) {
                    if (result.status === "rejected") {
                        logger.error("Failed to unset previous default signup server", {
                            defaultServerId: defaultServersToClear[index]?.$id,
                            error:
                                result.reason instanceof Error
                                    ? result.reason.message
                                    : String(result.reason),
                            serverId,
                            userId: session.$id,
                        });
                    }
                }

                if (hasResetFailure) {
                    try {
                        await databases.updateDocument(
                            env.databaseId,
                            env.collections.servers,
                            serverId,
                            { defaultOnSignup: previousDefaultOnSignup },
                        );
                    } catch (rollbackError) {
                        logger.error("Failed to rollback current server defaultOnSignup", {
                            serverId,
                            userId: session.$id,
                            error:
                                rollbackError instanceof Error
                                    ? rollbackError.message
                                    : String(rollbackError),
                        });
                    }

                    const restoreItems = resetResults.flatMap((result, index) => {
                        if (result.status !== "fulfilled") {
                            return [];
                        }

                        const restoredServerId = defaultServersToClear[index].$id;
                        return [
                            {
                                serverId: restoredServerId,
                                promise: databases.updateDocument(
                                    env.databaseId,
                                    env.collections.servers,
                                    restoredServerId,
                                    { defaultOnSignup: true },
                                ),
                            },
                        ];
                    });

                    const restoreResults = await Promise.allSettled(
                        restoreItems.map((item) => item.promise),
                    );

                    for (const [index, result] of restoreResults.entries()) {
                        if (result.status === "rejected") {
                            const failedId = restoreItems[index]?.serverId;
                            logger.error(
                                "Failed to rollback cleared default signup server",
                                {
                                    failedServerId: failedId,
                                    serverId,
                                    userId: session.$id,
                                    error:
                                        result.reason instanceof Error
                                            ? result.reason.message
                                            : String(result.reason),
                                },
                            );
                        }
                    }

                    return NextResponse.json(
                        { error: "Failed to clear existing default signup server" },
                        { status: 500 },
                    );
                }
            }

            return null;
        });

        if (lockResult) {
            return lockResult;
        }
    } else {
        try {
            updatedServerDocument = (await databases.updateDocument(
                env.databaseId,
                env.collections.servers,
                serverId,
                updates,
            )) as unknown as Record<string, unknown>;
        } catch (error) {
            logger.error("Failed to update server document", {
                collectionId: env.collections.servers,
                error: error instanceof Error ? error.message : String(error),
                serverId,
                userId: session.$id,
            });

            return NextResponse.json(
                { error: "Failed to update server" },
                { status: 500 },
            );
        }
    }

    if (!updatedServerDocument) {
        return NextResponse.json(
            { error: "Failed to update server" },
            { status: 500 },
        );
    }

    const staleFileIds = new Set<string>();
    const updatedIconFileId = normalizeServerFileId(
        updatedServerDocument.iconFileId,
    );
    const updatedBannerFileId = normalizeServerFileId(
        updatedServerDocument.bannerFileId,
    );

    if (
        Object.hasOwn(payload, "iconFileId") &&
        previousIconFileId &&
        previousIconFileId !== updatedIconFileId
    ) {
        staleFileIds.add(previousIconFileId);
    }
    if (
        Object.hasOwn(payload, "bannerFileId") &&
        previousBannerFileId &&
        previousBannerFileId !== updatedBannerFileId
    ) {
        staleFileIds.add(previousBannerFileId);
    }

    const staleFileIdList = Array.from(staleFileIds);
    const staleFileDeletionResults = await Promise.allSettled(
        staleFileIdList.map((fileId) =>
            storage.deleteFile(env.buckets.images, fileId),
        ),
    );
    for (const [index, result] of staleFileDeletionResults.entries()) {
        if (result.status !== "rejected") {
            continue;
        }

        logger.error("Failed to delete stale file", {
            bucketId: env.buckets.images,
            fileId: staleFileIdList[index],
            reason:
                result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason),
            serverId,
            userId: session.$id,
        });
    }

    try {
        await recordAudit("server_settings_updated", serverId, session.$id, {
            changedFields,
            details: "Updated server customization settings",
            serverId,
            userId: session.$id,
        });
    } catch (error) {
        logger.error("Failed to record server settings audit entry", {
            error: error instanceof Error ? error.message : String(error),
            serverId,
            userId: session.$id,
        });
    }

    const memberCount = await getActualMemberCount(databases, serverId);
    const nextServerDocument = {
        ...serverDocument,
        ...updatedServerDocument,
        serverId,
    };

    return NextResponse.json({
        server: mapServerDocument(nextServerDocument, memberCount),
    });
}

// DELETE: Delete a server (must be server owner or have manageServer permission)
export async function DELETE(_request: NextRequest, context: RouteContext) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { databases } = getServerClient();
    const env = getEnvConfig();
    const { serverId } = await context.params;

    // Verify server exists
    let serverDocument: Record<string, unknown>;
    try {
        serverDocument = (await databases.getDocument(env.databaseId, env.collections.servers, serverId)) as unknown as Record<string, unknown>;
    } catch (error) {
        if (isDocumentNotFoundError(error)) {
            return NextResponse.json({ error: "Server not found" }, { status: 404 });
        }

        logger.error("Failed to load server during DELETE", {
            error: error instanceof Error ? error.message : String(error),
            serverId,
            userId: session.$id,
        });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }

    const isOwner = String(serverDocument.ownerId) === session.$id;
    if (!isOwner) {
        const access = await getServerPermissionsForUser(databases, env, serverId, session.$id);
        if (!access.isMember || !access.permissions.manageServer) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    try {
        // Best-effort cleanup performed in lib.deleteServer; reuse logic by calling it server-side
        await deleteServer(serverId);
    } catch (error) {
        logger.error("Failed to delete server", {
            error: error instanceof Error ? error.message : String(error),
            serverId,
            userId: session.$id,
        });
        return NextResponse.json(
            { error: "Failed to delete server" },
            { status: 500 },
        );
    }

    try {
        await recordAudit("server_deleted", serverId, session.$id, {
            serverId,
            userId: session.$id,
        });
    } catch (error) {
        logger.error("Failed to record server deleted audit entry", {
            error: error instanceof Error ? error.message : String(error),
            serverId,
            userId: session.$id,
        });
    }

    return NextResponse.json({ success: true });
}
