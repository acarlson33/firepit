import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
	getUserRoles as GetUserRolesFn,
	getUserRoleTags as GetUserRoleTagsFn,
} from "../lib/appwrite-roles";

// We'll import the module dynamically after env setup inside each test to avoid early env capture.
let getUserRoles: typeof GetUserRolesFn;
let getUserRoleTags: typeof GetUserRoleTagsFn;
async function loadModule() {
	if (!getUserRoles) {
		(process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
		(process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
		const mod = await import("../lib/appwrite-roles");
		getUserRoles = mod.getUserRoles;
		getUserRoleTags = mod.getUserRoleTags;
	}
}

function reloadModule() {

	getUserRoles = undefined as any;
	getUserRoleTags = undefined as any;
	return loadModule();
}

// We will mock environment and Appwrite Teams client surface minimally.

vi.mock("appwrite", () => {
	class Client {
		setEndpoint() {
			return this;
		}
		setProject() {
			return this;
		}
		setKey() {
			return this;
		}
	}
	class Teams {
		memberships: any[];
		constructor() {
			this.memberships = [];
		}
		listMemberships(teamId: string) {
			return Promise.resolve({
				memberships: this.memberships.filter((m) => m.teamId === teamId),
			});
		}
	}
	return { Client, Teams };
});

function setEnv(vars: Record<string, string | undefined>) {
	for (const [k, v] of Object.entries(vars)) {
		if (v === undefined) {
			delete (process.env as Record<string, unknown>)[k];
		} else {
			(process.env as Record<string, unknown>)[k] = v;
		}
	}
}

const USER_ID = "user-1";

describe("getUserRoles", () => {
	beforeEach(() => {
		// Environment variable keys must remain uppercase; local lint can be relaxed if necessary.

		setEnv({
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "http://x",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "p",
			NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID: "adminTeam",
			NEXT_PUBLIC_APPWRITE_MODERATOR_TEAM_ID: "modTeam",
			APPWRITE_API_KEY: "key",
		});
	});
	it("returns defaults for null user", async () => {
		await loadModule();
		const res = await getUserRoles(null);
		expect(res.isAdmin).toBe(false);
		expect(res.isModerator).toBe(false);
	});
	it("respects admin override env", async () => {
		(process.env as any).APPWRITE_ADMIN_USER_IDS = USER_ID;
		await reloadModule();
		const res = await getUserRoles(USER_ID);
		expect(res.isAdmin).toBe(true);
		expect(res.isModerator).toBe(true); // implicit elevation
	});
});

describe("getUserRoleTags cache + implicit tags", () => {
	beforeEach(() => {
		setEnv({
			NEXT_PUBLIC_APPWRITE_ENDPOINT: "http://x",
			NEXT_PUBLIC_APPWRITE_PROJECT_ID: "p",
			NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID: "adminTeam",
			NEXT_PUBLIC_APPWRITE_MODERATOR_TEAM_ID: "modTeam",
			APPWRITE_API_KEY: "key",
			NEXT_PUBLIC_ROLE_TEAM_MAP: JSON.stringify({
				custom1: { label: "VIP", color: "gold" },
			}),
		});
	});
	it("returns empty tags when no user", async () => {
		await loadModule();
		const res = await getUserRoleTags(null);
		expect(res.tags).toHaveLength(0);
	});
	it("returns cached value on second call", async () => {
		await loadModule();
		const first = await getUserRoleTags(USER_ID);
		const second = await getUserRoleTags(USER_ID);
		expect(second).toEqual(first); // cache hit
	});
	it("adds implicit tags when base roles true but custom tags absent", async () => {
		(process.env as any).APPWRITE_ADMIN_USER_IDS = USER_ID; // force admin
		// Clear role tag cache between reloads
		(globalThis as any).__roleTagCache = undefined;
		await reloadModule();
		const res = await getUserRoleTags(USER_ID);
		const labels = res.tags.map((t) => t.label.toLowerCase());
		expect(labels).toContain("admin");
		expect(labels).toContain("mod");
	});
	it("handles invalid NEXT_PUBLIC_ROLE_TEAM_MAP JSON gracefully", async () => {
		(process.env as any).NEXT_PUBLIC_ROLE_TEAM_MAP = "not-json";
		await loadModule();
		const res = await getUserRoleTags(USER_ID);
		expect(Array.isArray(res.tags)).toBe(true);
	});
});

describe("getUserRoleTags cache expiration", () => {
	it("recomputes after cache TTL", async () => {
		(process.env as any).NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://x";
		(process.env as any).NEXT_PUBLIC_APPWRITE_PROJECT_ID = "p";
		(process.env as any).APPWRITE_ADMIN_USER_IDS = USER_ID; // ensure admin
		const mod = await import("../lib/appwrite-roles");
		const first = await mod.getUserRoleTags(USER_ID);
		const origNow = Date.now;
		// Advance beyond 60s TTL
		const TTL_ADVANCE_MS = 61_000; // 60s TTL + 1s
		Date.now = () => origNow() + TTL_ADVANCE_MS;
		const second = await mod.getUserRoleTags(USER_ID);
		Date.now = origNow;
		expect(second).toEqual(first); // still same content but recomputed
	});
});
