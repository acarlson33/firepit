import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Permission, Role } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/newrelic-utils";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

function getAllowedOrigin(request?: Request) {
    const origin = request?.headers.get("origin");
    if (!origin) {
        return undefined;
    }

    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}

function isSameOrigin(request: Request, originHeader: string): boolean {
    try {
        return new URL(request.url).origin === originHeader;
    } catch {
        return false;
    }
}

function ensureAllowedRequestOrigin(request?: Request): string | null {
    if (!request) {
        return null;
    }

    const origin = request.headers.get("origin");
    if (!origin) {
        return null;
    }

    if (isSameOrigin(request, origin)) {
        return null;
    }

    return ALLOWED_ORIGINS.includes(origin) ? null : origin;
}

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit, request?: Request) {
    const headers = new Headers(init?.headers);
    headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    const allowedOrigin = getAllowedOrigin(request);
    if (allowedOrigin) {
        headers.set("Access-Control-Allow-Origin", allowedOrigin);
        headers.set("Access-Control-Allow-Credentials", "true");
    }

    return NextResponse.json(data, {
        ...init,
        headers,
    });
}

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
    const disallowedOrigin = ensureAllowedRequestOrigin(request);
    if (disallowedOrigin) {
        return jsonResponse(
            { error: "Origin is not allowed" },
            { status: 403 },
            request,
        );
    }

    return jsonResponse({}, undefined, request);
}

/**
 * POST /api/upload-emoji
 * Upload a custom emoji to Appwrite Storage
 */
export async function POST(request: NextRequest) {
    const respond = (data: unknown, init?: ResponseInit) =>
        jsonResponse(data, init, request);

    try {
        const disallowedOrigin = ensureAllowedRequestOrigin(request);
        if (disallowedOrigin) {
            return respond({ error: "Origin is not allowed" }, { status: 403 });
        }

        const session = await getServerSession();
        if (!session?.$id) {
            return respond({ error: "Authentication required" }, { status: 401 });
        }

        const rateLimitResult = checkRateLimit(`upload-emoji:${session.$id}`, {
            maxRequests: 10,
            windowMs: 5 * 60 * 1000, // 5 minutes
        });
        if (!rateLimitResult.allowed) {
            return respond(
                { error: "Too many upload requests. Please try again later." },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter || 60),
                    },
                },
            );
        }

        const env = getEnvConfig();

        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");

        if (!(file instanceof File)) {
            return respond({ error: "No file provided" }, { status: 400 });
        }

        if (typeof name !== "string" || name.trim().length === 0) {
            return respond(
                { error: "Emoji name is required" },
                { status: 400 },
            );
        }

        // Validate name (alphanumeric, hyphens, underscores only)
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            return respond(
                {
                    error: "Emoji name can only contain letters, numbers, hyphens, and underscores",
                },
                { status: 400 },
            );
        }

        // Validate file type (images only)
        if (!file.type.startsWith("image/")) {
            return respond({ error: "Only image files are allowed" }, { status: 400 });
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            return respond(
                { error: "File size must be less than 10MB" },
                { status: 400 },
            );
        }

        const { storage } = getServerClient();

        // Convert File to InputFile for node-appwrite
        const arrayBuffer = await file.arrayBuffer();
        const fileExtension = file.name.includes(".")
            ? file.name.split(".").pop() || "png"
            : "png";
        const fileName = `${name}.${fileExtension}`;
        const uploadFile = InputFile.fromBuffer(
            Buffer.from(arrayBuffer),
            fileName,
        );

        // Upload to Appwrite Storage
        const uploadedFile = await storage.createFile(
            env.buckets.emojis,
            ID.unique(),
            uploadFile,
            [
                Permission.read(Role.any()),
                Permission.update(Role.user(session.$id)),
                Permission.delete(Role.user(session.$id)),
            ],
        );

        // Generate URL for the emoji
        const emojiUrl = `/api/emoji/${uploadedFile.$id}`;

        return respond({
            fileId: uploadedFile.$id,
            url: emojiUrl,
            name,
        });
    } catch (error) {
        logger.error("Error uploading emoji", {
            error: error instanceof Error ? error.message : String(error),
        });
        return respond({ error: "Failed to upload emoji" }, { status: 500 });
    }
}

/**
 * DELETE /api/upload-emoji?fileId=xxx
 * Delete a custom emoji from Appwrite Storage
 */
export async function DELETE(request: NextRequest) {
    const respond = (data: unknown, init?: ResponseInit) =>
        jsonResponse(data, init, request);

    try {
        const disallowedOrigin = ensureAllowedRequestOrigin(request);
        if (disallowedOrigin) {
            return respond({ error: "Origin is not allowed" }, { status: 403 });
        }

        const session = await getServerSession();
        if (!session?.$id) {
            return respond({ error: "Authentication required" }, { status: 401 });
        }

        const env = getEnvConfig();

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get("fileId");

        if (!fileId) {
            return respond({ error: "No fileId provided" }, { status: 400 });
        }

        const rateLimitResult = checkRateLimit(`upload-emoji-delete:${session.$id}`, {
            maxRequests: 20,
            windowMs: 5 * 60 * 1000,
        });
        if (!rateLimitResult.allowed) {
            return respond(
                { error: "Too many delete requests. Please try again later." },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rateLimitResult.retryAfter || 60),
                    },
                },
            );
        }

        const { storage } = getServerClient();

        await storage.deleteFile(env.buckets.emojis, fileId);

        return respond({ success: true });
    } catch (error) {
        logger.error("Error deleting emoji", {
            error: error instanceof Error ? error.message : String(error),
        });
        return respond({ error: "Failed to delete emoji" }, { status: 500 });
    }
}
