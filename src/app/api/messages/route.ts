import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ID } from "node-appwrite";

import { getServerClient } from "@/lib/appwrite-server";
import { getEnvConfig, perms } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import type { Message } from "@/lib/types";

/**
 * POST /api/messages
 * Sends a message to a channel
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
		const body = await request.json();
		const { text, channelId, serverId, imageFileId, imageUrl, replyToId } = body;

		if ((!text && !imageFileId) || !channelId) {
			return NextResponse.json(
				{ error: "text or imageFileId, and channelId are required" },
				{ status: 400 }
			);
		}

		const userId = user.$id;
		const userName = user.name;

		// Create message permissions
		const permissions = perms.message(userId, {
			mod: env.teams.moderatorTeamId,
			admin: env.teams.adminTeamId,
		});

		const { databases } = getServerClient();

		const messageData: Record<string, unknown> = {
			userId,
			text: text || "",
			userName,
			channelId,
			serverId,
		};

		// Add image fields if provided
		if (imageFileId) {
			messageData.imageFileId = imageFileId;
		}
		if (imageUrl) {
			messageData.imageUrl = imageUrl;
		}
		// Add reply field if provided
		if (replyToId) {
			messageData.replyToId = replyToId;
		}

		const res = await databases.createDocument(
			env.databaseId,
			env.collections.messages,
			ID.unique(),
			messageData,
			permissions
		);

		const doc = res as unknown as Record<string, unknown>;
		const message: Message = {
			$id: String(doc.$id),
			userId: String(doc.userId),
			userName: doc.userName as string | undefined,
			text: String(doc.text),
			$createdAt: String(doc.$createdAt ?? ""),
			channelId: doc.channelId as string | undefined,
			removedAt: doc.removedAt as string | undefined,
			removedBy: doc.removedBy as string | undefined,
			serverId: doc.serverId as string | undefined,
			imageFileId: doc.imageFileId as string | undefined,
			imageUrl: doc.imageUrl as string | undefined,
			replyToId: doc.replyToId as string | undefined,
		};

		return NextResponse.json({ message });
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to send message",
			},
			{ status: 500 }
		);
	}
}

/**
 * PATCH /api/messages?id=MESSAGE_ID
 * Edits a message (user must own the message)
 */
export async function PATCH(request: NextRequest) {
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
		const { searchParams } = new URL(request.url);
		const messageId = searchParams.get("id");
		const body = await request.json();
		const { text } = body;

		if (!messageId || !text) {
			return NextResponse.json(
				{ error: "id and text are required" },
				{ status: 400 }
			);
		}

		const { databases } = getServerClient();

		// Update the message with new text and editedAt timestamp
		const editedAt = new Date().toISOString();
		const res = await databases.updateDocument(
			env.databaseId,
			env.collections.messages,
			messageId,
			{ text, editedAt }
		);

		const doc = res as unknown as Record<string, unknown>;
		const message: Message = {
			$id: String(doc.$id),
			userId: String(doc.userId),
			userName: doc.userName as string | undefined,
			text: String(doc.text),
			$createdAt: String(doc.$createdAt ?? ""),
			channelId: doc.channelId as string | undefined,
			editedAt: doc.editedAt as string | undefined,
			removedAt: doc.removedAt as string | undefined,
			removedBy: doc.removedBy as string | undefined,
			serverId: doc.serverId as string | undefined,
			imageFileId: doc.imageFileId as string | undefined,
			imageUrl: doc.imageUrl as string | undefined,
			replyToId: doc.replyToId as string | undefined,
		};

		return NextResponse.json({ message });
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to edit message",
			},
			{ status: 500 }
		);
	}
}

/**
 * DELETE /api/messages?id=MESSAGE_ID
 * Deletes a message (user must own the message)
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
		const { searchParams } = new URL(request.url);
		const messageId = searchParams.get("id");

		if (!messageId) {
			return NextResponse.json(
				{ error: "id is required" },
				{ status: 400 }
			);
		}

		const { databases } = getServerClient();

		// Delete the message
		await databases.deleteDocument(
			env.databaseId,
			env.collections.messages,
			messageId
		);

		return NextResponse.json({ success: true });
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Failed to delete message",
			},
			{ status: 500 }
		);
	}
}
