/**
 * Reaction utilities for parsing and handling message reactions
 */

export type Reaction = {
	emoji: string;
	userIds: string[];
	count: number;
};

/**
 * Parse reactions data from Appwrite (can be JSON string or array)
 * @param reactionsData - The reactions data from the database (string, array, or undefined)
 * @returns Parsed array of reactions
 */
export function parseReactions(
	reactionsData: string | Reaction[] | undefined
): Reaction[] {
	if (!reactionsData) {
		return [];
	}

	if (typeof reactionsData === "string") {
		try {
			const parsed = JSON.parse(reactionsData);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	if (Array.isArray(reactionsData)) {
		return reactionsData;
	}

	return [];
}
