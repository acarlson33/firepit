import { NextResponse } from "next/server";

import { createServer } from "@/lib/appwrite-servers";
import { getServerSession } from "@/lib/auth-server";

export async function POST(request: Request) {
	try {
		// Get authenticated user
		const session = await getServerSession();
		if (!session) {
			return NextResponse.json(
				{ success: false, error: "Unauthorized" },
				{ status: 401 }
			);
		}

		const { name } = (await request.json()) as { name: string };

		if (!name?.trim()) {
			return NextResponse.json(
				{ success: false, error: "Server name is required" },
				{ status: 400 }
			);
		}

		// createServer will check the feature flag internally
		// and throw an error if server creation is disabled
		const server = await createServer(name.trim());

		return NextResponse.json({
			success: true,
			server: {
				$id: server.$id,
				name: server.name,
				ownerId: server.ownerId,
				memberCount: server.memberCount,
			},
		});
	} catch (error) {
		console.error("Server creation error:", error);
		
		// Return user-friendly error message
		const message =
			error instanceof Error
				? error.message
				: "Failed to create server";

		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 }
		);
	}
}
