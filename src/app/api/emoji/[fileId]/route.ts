import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { logger } from "@/lib/posthog-utils";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

/**
 * GET /api/emoji/[fileId]
 * Serve emoji file from Appwrite Storage using admin client
 * This avoids 401 errors from direct bucket access
 */
export async function GET(
  _request: NextRequest,
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
    const responseHeaders = new Headers({
      "Content-Type": file.mimeType || "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    
    // Use secure CORS validation
    const { setCorsHeaders } = await import("@/lib/api-middleware");
    setCorsHeaders(_request, responseHeaders);
    
    return new NextResponse(fileBuffer, {
      headers: responseHeaders,
    });
  } catch (error) {
    logger.error("Error fetching emoji:", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { error: "Failed to fetch emoji" },
      { status: 500 }
    );
  }
}
