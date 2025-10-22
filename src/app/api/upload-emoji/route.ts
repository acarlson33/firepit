import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Permission, Role } from "node-appwrite";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  return NextResponse.json(data, {
    ...init,
    headers,
  });
}

// Handle preflight requests
export async function OPTIONS() {
  return jsonResponse({});
}

/**
 * POST /api/upload-emoji
 * Upload a custom emoji to Appwrite Storage
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.$id) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getEnvConfig();

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const name = formData.get("name") as string;

    if (!file) {
      return jsonResponse({ error: "No file provided" }, { status: 400 });
    }

    if (!name || name.trim().length === 0) {
      return jsonResponse({ error: "Emoji name is required" }, { status: 400 });
    }

    // Validate name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return jsonResponse(
        { error: "Emoji name can only contain letters, numbers, hyphens, and underscores" },
        { status: 400 }
      );
    }

    // Validate file type (images only)
    if (!file.type.startsWith("image/")) {
      return jsonResponse(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return jsonResponse(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      );
    }

    const { storage } = getServerClient();

    // Convert File to buffer and recreate as File for node-appwrite
    // Use emoji name as file name to preserve the name in storage
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });
    const fileExtension = file.name.split(".").pop() || "png";
    const fileName = `${name}.${fileExtension}`;
    const uploadFile = new File([blob], fileName, { type: file.type });

    // Upload to Appwrite Storage
    const uploadedFile = await storage.createFile(
      env.buckets.emojis,
      ID.unique(),
      uploadFile,
      [
        Permission.read(Role.any()),
        Permission.update(Role.user(session.$id)),
        Permission.delete(Role.user(session.$id)),
      ]
    );

    // Generate URL for the emoji
    const emojiUrl = `${env.endpoint}/storage/buckets/${env.buckets.emojis}/files/${uploadedFile.$id}/view?project=${env.project}`;

    return jsonResponse({
      fileId: uploadedFile.$id,
      url: emojiUrl,
      name,
    });
  } catch (error) {
    console.error("Error uploading emoji:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to upload emoji";
    return jsonResponse(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload-emoji?fileId=xxx
 * Delete a custom emoji from Appwrite Storage
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.$id) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getEnvConfig();

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return jsonResponse({ error: "No fileId provided" }, { status: 400 });
    }

    const { storage } = getServerClient();

    await storage.deleteFile(env.buckets.emojis, fileId);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Error deleting emoji:", error);
    return jsonResponse(
      { error: "Failed to delete emoji" },
      { status: 500 }
    );
  }
}
