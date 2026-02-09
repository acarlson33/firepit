import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * Diagnostic endpoint to see your user ID and current roles.
 * Visit /api/me after logging in to get your user ID for bootstrap.
 */
export async function GET() {
	const user = await getServerSession();

	if (!user) {
		const env = getEnvConfig();
		const cookieName = `a_session_${env.project}`;
		const res = NextResponse.json(
			{ error: "Not authenticated" },
			{ status: 401 },
		);
		res.cookies.delete(cookieName);
		return res;
	}

	const roles = await getUserRoles(user.$id);

	return NextResponse.json({
		userId: user.$id,
		name: user.name,
		email: user.email,
		roles: {
			isAdmin: roles.isAdmin,
			isModerator: roles.isModerator,
		},
		message:
			"Copy your userId above and add it to .env.local as APPWRITE_ADMIN_USER_IDS",
	});
}
