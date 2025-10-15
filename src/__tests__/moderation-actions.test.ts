import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	actionHardDelete,
	actionRestore,
	actionSoftDelete,
} from "../app/moderation/actions";

// Setup environment before any imports
const env = process.env as Record<string, string>;
env.APPWRITE_ENDPOINT = "http://localhost";
env.APPWRITE_PROJECT_ID = "test-project";
env.APPWRITE_API_KEY = "test-api-key";

vi.mock("../lib/appwrite-roles", () => ({ getUserRoles: vi.fn() }));
vi.mock("../lib/appwrite-audit", () => ({ recordAudit: vi.fn() }));
vi.mock("../lib/appwrite-admin", () => ({
	adminSoftDeleteMessage: vi.fn(),
	adminRestoreMessage: vi.fn(),
	adminDeleteMessage: vi.fn(),
}));
vi.mock("../lib/monitoring", () => ({
	recordMetric: vi.fn(),
	recordTiming: vi.fn(),
}));
vi.mock("next/headers", () => ({
	cookies: async () => ({ get: () => ({ value: "session" }) }),
}));

// Mock auth-server helper
vi.mock("../lib/auth-server", () => ({
	requireModerator: vi.fn(),
}));

// Mock Appwrite SDK for getServerSession
vi.mock("appwrite", () => {
	class MockClient {
		setEndpoint() {
			return this;
		}
		setProject() {
			return this;
		}
	}
	class MockAccount {
		get() {
			return Promise.resolve({
				$id: "moderatorUser",
				name: "Mod",
				email: "mod@example.com",
			});
		}
	}
	const mod: Record<string, unknown> = {};
	Object.defineProperty(mod, "Client", { get: () => MockClient });
	Object.defineProperty(mod, "Account", { get: () => MockAccount });
	return mod;
});

const { getUserRoles } = await import("../lib/appwrite-roles");
const {
	adminSoftDeleteMessage,
	adminRestoreMessage,
	adminDeleteMessage,
} = await import("../lib/appwrite-admin");
const { recordAudit } = await import("../lib/appwrite-audit");
const { requireModerator } = await import("../lib/auth-server");

function setRole(mod: boolean, admin: boolean) {
	(getUserRoles as any).mockResolvedValue({ isModerator: mod, isAdmin: admin });
	(requireModerator as any).mockResolvedValue({
		user: { $id: "moderatorUser", name: "Mod", email: "mod@example.com" },
		roles: { isModerator: mod, isAdmin: admin },
	});
}

beforeEach(async () => {
	vi.clearAllMocks();
	setRole(true, true);
});

describe("moderation actions", () => {
	it("soft delete records audit + metrics", async () => {
		await actionSoftDelete("m1");
		expect(adminSoftDeleteMessage).toHaveBeenCalledWith("m1", "moderatorUser");
		expect(recordAudit).toHaveBeenCalled();
	});
	it("restore records audit", async () => {
		await actionRestore("m2");
		expect(adminRestoreMessage).toHaveBeenCalledWith("m2");
		expect(recordAudit).toHaveBeenCalled();
	});
	it("hard delete requires admin", async () => {
		setRole(true, true);
		await actionHardDelete("m3");
		expect(adminDeleteMessage).toHaveBeenCalledWith("m3");
	});
	it("hard delete forbidden for non-admin", async () => {
		setRole(true, false);
		await expect(actionHardDelete("m4")).rejects.toThrow("Forbidden");
	});
});
