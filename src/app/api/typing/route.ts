import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";

// Helper function to create a deterministic, short document ID for typing status
function hashTypingKey(userId: string, channelId: string): string {
	// Use Node.js crypto to create a consistent hash that's exactly 36 characters
	// This ensures the document ID stays within Appwrite's limit
	const input = `${userId}_${channelId}`;

	// Simple hash function that works in both Node and browser
	// Using a djb2-like hash algorithm for deterministic results
	let hash = 5381;
	for (let i = 0; i < input.length; i++) {
		const char = input.charCodeAt(i);
		hash = ((hash << 5) + hash) + char; // hash * 33 + char
	}

	// Convert to positive number and then to hex
	const hashHex = (hash >>> 0).toString(16).padStart(8, '0');

	// Create a deterministic 36-character ID using parts of the input and the hash
	// Format: typing_<userPrefix>_<channelPrefix>_<hash>
	const userPrefix = userId.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '');
	const channelPrefix = channelId.substring(0, 8).replace(/[^a-zA-Z0-9]/g, '');
	const combined = `typ_${userPrefix}_${channelPrefix}_${hashHex}`;

	// Ensure it's exactly 36 characters or less
	return combined.padEnd(36, '0').substring(0, 36);
}

/**
 * POST /api/typing
 * Creates or updates typing status for a user in a channel
 */
export async function POST(request: NextRequest) {
	try {
		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const env = getEnvConfig();
		const typingCollectionId = env.collections.typing;

		if (!typingCollectionId) {
			return NextResponse.json(
				{ error: "Typing collection not configured" },
				{ status: 503 }
			);
		}

		const body = await request.json();
		const { channelId, userName } = body;

		if (!channelId) {
			return NextResponse.json(
				{ error: "channelId is required" },
				{ status: 400 }
			);
		}

		const userId = user.$id;
		const key = hashTypingKey(userId, channelId);

		const { databases } = getServerClient();

		const payload = {
			userId,
			userName: userName || user.name,
			channelId,
		};

		// Emulate upsert: try update, fallback create.
		try {
			const result = await databases.updateDocument(
				env.databaseId,
				typingCollectionId,
				key,
				payload
			);

			return NextResponse.json({ success: true, document: result });
		} catch {
			try {
				// Document doesn't exist, create it
				// Use server admin client - no need for explicit permissions
				const result = await databases.createDocument(
					env.databaseId,
					typingCollectionId,
					key,
					payload
				);

				return NextResponse.json({ success: true, document: result });
			} catch (error) {
				return NextResponse.json(
					{
						error: error instanceof Error ? error.message : "Failed to create typing status",
					},
					{ status: 500 }
				);
			}
		}
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to set typing status",
			},
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/typing?channelId=CHANNEL_ID
 * Deletes typing status for the authenticated user in a channel
 */
export async function DELETE(request: NextRequest) {
	try {
		// Verify user is authenticated
		const user = await getServerSession();
		if (!user) {
			return NextResponse.json(
				{ error: "Authentication required" },
				{ status: 401 }
			);
		}

		const env = getEnvConfig();
		const typingCollectionId = env.collections.typing;

		if (!typingCollectionId) {
			return NextResponse.json(
				{ error: "Typing collection not configured" },
				{ status: 503 }
			);
		}

		const { searchParams } = new URL(request.url);
		const channelId = searchParams.get("channelId");

		if (!channelId) {
			return NextResponse.json(
				{ error: "channelId is required" },
				{ status: 400 }
			);
		}

		const userId = user.$id;
		const key = hashTypingKey(userId, channelId);

		const { databases } = getServerClient();

		try {
			await databases.deleteDocument(
				env.databaseId,
				typingCollectionId,
				key
			);

			return NextResponse.json({ success: true });
		} catch (error) {
			// Document might not exist, which is fine
			return NextResponse.json({ success: true });
		}
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to delete typing status",
			},
			{ status: 500 }
		);
	}
}
