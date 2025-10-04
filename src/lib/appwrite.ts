// Deprecated thin wrappers kept for compatibility; prefer appwrite-core exports.
export {
	getBrowserAccount as getAccount,
	getBrowserClient,
} from "./appwrite-core";

import { ensureSession } from "./appwrite-core";

export async function ensureBrowserSession(): Promise<
	{ ok: true; userId: string } | { ok: false; error: string }
> {
	const res = await ensureSession();
	if ("error" in res) {
		return { ok: false, error: res.error };
	}
	return { ok: true, userId: res.userId };
}
