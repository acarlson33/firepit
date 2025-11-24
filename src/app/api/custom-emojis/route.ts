import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { logger } from "@/lib/posthog-utils";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import type { CustomEmoji } from "@/lib/types";

/**
 * GET /api/custom-emojis
 * List all custom emojis from Appwrite Storage using admin client
 */
export async function GET() {
  try {
    const { storage } = getAdminClient();
    const env = getEnvConfig();
    
    // List all files in the emojis bucket
    const files = await storage.listFiles(
      env.buckets.emojis,
      [Query.orderDesc("$createdAt"), Query.limit(100)]
    );

    const emojis: CustomEmoji[] = files.files.map((file) => {
      // Extract emoji name from file name or use file name as fallback
      const emojiName = file.name.replace(/\.[^.]+$/, ""); // Remove file extension
      
      return {
        fileId: file.$id,
        url: `/api/emoji/${file.$id}`,
        name: emojiName,
      };
    });

    const response = NextResponse.json(emojis);

    // Cache custom emojis for 5 minutes (rarely change)
    // Allow stale data for 30 minutes while revalidating
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=1800"
    );

    return response;
  } catch (error) {
    logger.error("Error fetching custom emojis:", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { error: "Failed to fetch custom emojis" },
      { status: 500 }
    );
  }
}
