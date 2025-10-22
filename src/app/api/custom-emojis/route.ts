import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { getAdminClient } from "@/lib/appwrite-admin";

const EMOJIS_BUCKET_ID = process.env.APPWRITE_EMOJIS_BUCKET_ID || "emojis";

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
    
    // List all files in the emojis bucket
    const files = await storage.listFiles(
      EMOJIS_BUCKET_ID,
      [Query.orderDesc("$createdAt"), Query.limit(100)]
    );

    // Generate URLs for each emoji
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "";
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "";

    const emojis: CustomEmoji[] = files.files.map((file) => {
      // Extract emoji name from file name or use file name as fallback
      const emojiName = file.name.replace(/\.[^.]+$/, ""); // Remove file extension
      
      return {
        fileId: file.$id,
        url: `${endpoint}/storage/buckets/${EMOJIS_BUCKET_ID}/files/${file.$id}/view?project=${projectId}`,
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
