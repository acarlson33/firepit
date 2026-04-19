import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Query } from "node-appwrite";

import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
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

type ListDocumentsResponse = Awaited<
    ReturnType<ReturnType<typeof getServerClient>["databases"]["listDocuments"]>
>;

function isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = "code" in error ? Number(error.code) : Number.NaN;
    if (code === 404) {
        return true;
    }

    const type = "type" in error ? String(error.type).toLowerCase() : "";
    if (type.includes("not_found") || type.includes("document_not_found")) {
        return true;
    }

    const message =
        "message" in error ? String(error.message).toLowerCase() : "";
    return (
        message.includes("not found") ||
        message.includes("document with the requested id could not be found")
    );
}

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
        if (isNotFoundError(error)) {
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

        if (payload.defaultOnSignup === true) {
            const pageSize = 100;
            const existingDefaultServers: Array<{ $id: string }> = [];
            let cursorAfter: string | null = null;

            while (true) {
                const page: ListDocumentsResponse = await databases.listDocuments(
                    env.databaseId,
                    env.collections.servers,
                    [
                        Query.equal("defaultOnSignup", true),
                        Query.select(["$id"]),
                        Query.limit(pageSize),
                        ...(cursorAfter ? [Query.cursorAfter(cursorAfter)] : []),
                    ],
                );

                for (const document of page.documents) {
                    if (typeof document.$id === "string") {
                        existingDefaultServers.push({ $id: document.$id });
                    }
                }

                if (page.documents.length < pageSize) {
                    break;
                }

                const lastDocument = page.documents.at(-1);
                cursorAfter =
                    lastDocument && typeof lastDocument.$id === "string"
                        ? lastDocument.$id
                        : null;

                if (!cursorAfter) {
                    break;
                }
            }

            const defaultServersToClear = existingDefaultServers.filter(
                (defaultServer) => defaultServer.$id !== serverId,
            );
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

            let hadResetFailure = false;
            for (const [index, result] of resetResults.entries()) {
                if (result.status !== "rejected") {
                    continue;
                }

                hadResetFailure = true;
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

            if (hadResetFailure) {
                return NextResponse.json(
                    { error: "Failed to clear existing default signup server" },
                    { status: 500 },
                );
            }
        }
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

    const updatedServerDocument = (await databases.updateDocument(
        env.databaseId,
        env.collections.servers,
        serverId,
        updates,
    )) as unknown as Record<string, unknown>;

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

        logger.error("failed to delete stale file", {
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

    await recordAudit("server_settings_updated", serverId, session.$id, {
        changedFields,
        details: "Updated server customization settings",
        serverId,
        userId: session.$id,
    });

    const memberCount = await getActualMemberCount(databases, serverId);

    return NextResponse.json({
        server: mapServerDocument(updatedServerDocument, memberCount),
    });
}
