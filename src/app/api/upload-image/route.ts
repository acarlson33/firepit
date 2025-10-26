import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Permission, Role } from "node-appwrite";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
  logger,
  recordError,
  setTransactionName,
  trackApiCall,
  addTransactionAttributes,
  recordEvent,
} from "@/lib/newrelic-utils";

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
  const startTime = Date.now();
  
  try {
    setTransactionName("POST /api/upload-image");
    
    logger.info("Starting image upload");
    const session = await getServerSession();
    if (!session?.$id) {
      logger.warn("Unauthorized upload attempt");
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }
    logger.info("Session verified", { userId: session.$id });
    
    addTransactionAttributes({ userId: session.$id });

    const env = getEnvConfig() as {
      endpoint: string;
      buckets: { images: string };
      project: string;
    };
    logger.info("Using bucket", { bucketId: env.buckets.images });

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      logger.warn("No file in upload request");
      return jsonResponse({ error: "No file provided" }, { status: 400 });
    }
    logger.info("File received", { 
      name: file.name, 
      type: file.type, 
      size: file.size 
    });

    // Validate file type (images only)
    if (!file.type.startsWith("image/")) {
      logger.warn("Invalid file type", { type: file.type });
      return jsonResponse(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      logger.warn("File too large", { size: file.size, maxSize });
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

    logger.info("Uploading to Appwrite storage");
    const uploadStartTime = Date.now();
    
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
    
    const uploadDuration = Date.now() - uploadStartTime;
    trackApiCall(
      "/api/upload-image",
      "POST",
      200,
      uploadDuration,
      { 
        operation: "uploadFile",
        fileSize: file.size,
        fileType: file.type,
      }
    );
    
    logger.info("Upload successful", { 
      fileId: uploadedFile.$id,
      size: file.size,
      duration: uploadDuration,
    });
    
    // Track upload event
    recordEvent("ImageUpload", {
      fileId: uploadedFile.$id,
      userId: session.$id,
      fileSize: file.size,
      fileType: file.type,
      duration: uploadDuration,
    });

    // Generate URL for the image
    const imageUrl = `${env.endpoint}/storage/buckets/${env.buckets.images}/files/${uploadedFile.$id}/view?project=${env.project}`;

    logger.info("Image URL generated", { url: imageUrl });
    return jsonResponse({
      fileId: uploadedFile.$id,
      url: imageUrl,
    });
  } catch (error) {
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "POST /api/upload-image",
        endpoint: "/api/upload-image",
        userId: request.headers.get("x-user-id"),
      }
    );
    
    logger.error("Image upload failed", {
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    });
    
    const errorMessage = error instanceof Error ? error.message : "Failed to upload image";
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
  const startTime = Date.now();
  
  try {
    setTransactionName("DELETE /api/upload-image");
    
    const session = await getServerSession();
    if (!session?.$id) {
      logger.warn("Unauthorized delete attempt");
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }
    
    addTransactionAttributes({ userId: session.$id });

    const env = getEnvConfig();

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      logger.warn("No fileId provided for delete");
      return jsonResponse({ error: "No fileId provided" }, { status: 400 });
    }
    
    addTransactionAttributes({ fileId });

    const { storage } = getServerClient();
    
    const deleteStartTime = Date.now();
    await storage.deleteFile(env.buckets.images, fileId);
    
    trackApiCall(
      "/api/upload-image",
      "DELETE",
      200,
      Date.now() - deleteStartTime,
      { operation: "deleteFile", fileId }
    );
    
    recordEvent("ImageDelete", {
      fileId,
      userId: session.$id,
    });
    
    logger.info("Image deleted", { 
      fileId,
      userId: session.$id,
      duration: Date.now() - startTime,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    recordError(
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "DELETE /api/upload-image",
        endpoint: "/api/upload-image",
      }
    );
    
    logger.error("Image delete failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return jsonResponse(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
