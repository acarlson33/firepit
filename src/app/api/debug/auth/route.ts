import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";

/**
 * GET /api/debug/auth
 * Debug endpoint to check authentication status
 */
export async function GET() {
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
