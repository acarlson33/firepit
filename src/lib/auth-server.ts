import { Account, Client } from "node-appwrite";
import { cookies } from "next/headers";

import { getUserRoles } from "./appwrite-roles";

/**
 * Server-side auth helper for RSC and server actions.
 * Returns null if no valid session exists.
 */
export async function getServerSession() {
	const endpoint = process.env.APPWRITE_ENDPOINT;
	const project = process.env.APPWRITE_PROJECT_ID;

	if (!(endpoint && project)) {
		return null;
	}

	try {
		const cookieStore = await cookies();
		const sessionCookie = cookieStore.get(`a_session_${project}`);

		if (!sessionCookie?.value) {
			return null;
		}

		// Set the session on the client so Appwrite knows which user to retrieve
		const client = new Client()
			.setEndpoint(endpoint)
			.setProject(project)
			.setSession(sessionCookie.value);

		const account = new Account(client);
		const user = await account.get().catch(() => null);

		return user && "$id" in user
			? (user as { $id: string; name: string; email: string })
			: null;
	} catch {
		return null;
	}
}

/**
 * Check if the current user has specific roles.
 */
export async function checkUserRoles(userId: string) {
	return getUserRoles(userId);
}

/**
 * Require authentication - throws if no session.
 */
export async function requireAuth() {
	const user = await getServerSession();
	if (!user) {
		throw new Error("Unauthorized");
	}
	return user;
}

/**
 * Require admin role - throws if not admin.
 */
export async function requireAdmin() {
	const user = await requireAuth();
	const roles = await checkUserRoles(user.$id);
	if (!roles.isAdmin) {
		throw new Error("Forbidden: Admin access required");
	}
	return { user, roles };
}

/**
 * Require moderator or admin role - throws if neither.
 */
export async function requireModerator() {
	const user = await requireAuth();
	const roles = await checkUserRoles(user.$id);
	if (!roles.isModerator && !roles.isAdmin) {
		throw new Error("Forbidden: Moderator access required");
	}
	return { user, roles };
}
