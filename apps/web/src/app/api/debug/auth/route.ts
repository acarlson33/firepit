import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { headers } from "next/headers";

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
		const headerStore = await headers();
		const authHeader =
			headerStore.get("Authorization") ?? headerStore.get("authorization");
		const trimmedHeader = authHeader?.trim();
		const token = trimmedHeader
			? trimmedHeader.split(/\s+/, 2)[1] ?? trimmedHeader
			: null;

		const tokenParts = token ? token.split(".") : null;
		const isLikelyJwt = tokenParts
			? tokenParts.length === 3 &&
				tokenParts.every((s: string) => s.length > 0)
			: null;

		const user = await getServerSession();

		return NextResponse.json({
			authenticated: Boolean(user),
			userId: user?.$id ?? null,
			hasAuthHeader: Boolean(authHeader),
			tokenPresent: Boolean(token),
			tokenLength: token?.length ?? 0,
			isLikelyJwt,
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
