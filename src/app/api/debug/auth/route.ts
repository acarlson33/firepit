import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";

/**
 * GET /api/debug/auth
 * Debug endpoint to check authentication status
 * Only available in development mode
 */
export async function GET() {
	// Only allow in development
	if (process.env.NODE_ENV !== "development") {
		return NextResponse.json(
			{ error: "Debug endpoints not available in production" },
			{ status: 404 }
		);
	}

	try {
		const user = await getServerSession();

		if (!user) {
			return NextResponse.json({
				authenticated: false,
				message: "No session found",
			});
		}

		return NextResponse.json({
			authenticated: true,
			userId: user.$id,
			email: user.email,
			name: user.name,
		});
	} catch (error) {
		return NextResponse.json(
			{
				authenticated: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
