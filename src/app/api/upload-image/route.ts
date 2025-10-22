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
 * POST /api/upload-image
 * Upload an image to Appwrite Storage
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[upload-image] Starting upload...");
    const session = await getServerSession();
    if (!session?.$id) {
      console.error("[upload-image] No session found");
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("[upload-image] Session found:", session.$id);

    const env = getEnvConfig();
    console.log("[upload-image] Bucket ID:", env.buckets.images);

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("[upload-image] No file in formData");
      return jsonResponse({ error: "No file provided" }, { status: 400 });
    }
    console.log("[upload-image] File received:", file.name, file.type, file.size);

    // Validate file type (images only)
    if (!file.type.startsWith("image/")) {
      return jsonResponse(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return jsonResponse(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    const { storage } = getServerClient();

    // Convert File to buffer and recreate as File for node-appwrite
    const arrayBuffer = await file.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: file.type });
    const uploadFile = new File([blob], file.name, { type: file.type });

    console.log("[upload-image] Uploading to Appwrite...");
    // Upload to Appwrite Storage
    const uploadedFile = await storage.createFile(
      env.buckets.images,
      ID.unique(),
      uploadFile,
      [
        Permission.read(Role.any()),
        Permission.update(Role.user(session.$id)),
        Permission.delete(Role.user(session.$id)),
      ]
    );
    console.log("[upload-image] Upload successful, file ID:", uploadedFile.$id);

    // Generate URL for the image
    const imageUrl = `${env.endpoint}/storage/buckets/${env.buckets.images}/files/${uploadedFile.$id}/view?project=${env.project}`;

    console.log("[upload-image] Image URL:", imageUrl);
    return jsonResponse({
      fileId: uploadedFile.$id,
      url: imageUrl,
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to upload image";
    console.error("Detailed error:", errorMessage);
    return jsonResponse(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/upload-image?fileId=xxx
 * Delete an image from Appwrite Storage
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

    await storage.deleteFile(env.buckets.images, fileId);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    return jsonResponse(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
