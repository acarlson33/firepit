import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";

type CustomEmoji = {
  fileId: string;
  url: string;
  name: string;
};

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

    return NextResponse.json(emojis);
  } catch (error) {
    console.error("Error fetching custom emojis:", error);
    return NextResponse.json(
      { error: "Failed to fetch custom emojis" },
      { status: 500 }
    );
  }
}
