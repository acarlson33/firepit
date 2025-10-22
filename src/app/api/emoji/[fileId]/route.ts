import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

/**
 * GET /api/emoji/[fileId]
 * Serve emoji file from Appwrite Storage using admin client
 * This avoids 401 errors from direct bucket access
 */
export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { fileId } = await context.params;
    
    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 }
      );
    }

    const { storage } = getAdminClient();
    const env = getEnvConfig();

    // Get file from storage
    const fileBuffer = await storage.getFileView(
      env.buckets.emojis,
      fileId
    );

    // Get file metadata to determine content type
    const file = await storage.getFile(env.buckets.emojis, fileId);
    
    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": file.mimeType || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error fetching emoji:", error);
    return NextResponse.json(
      { error: "Failed to fetch emoji" },
      { status: 500 }
    );
  }
}
