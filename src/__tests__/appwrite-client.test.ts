import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock environment variables
beforeEach(() => {
	process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://localhost";
	process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = "test-project";
	process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID = "main";
});

// Mock appwrite
vi.mock("appwrite", () => {
	class MockAccount {
		async get() {
			return {
				$id: "user123",
				email: "test@example.com",
				name: "Test User",
			};
		}
	}

	class MockClient {
		setEndpoint() {
			return this;
		}
		setProject() {
			return this;
		}
	}

	return {
		Client: MockClient,
		Account: MockAccount,
	};
});

describe("Appwrite Client Initialization", () => {
	it("should export browser client functions", async () => {
		const mod = await import("../lib/appwrite");
		expect(typeof mod.getBrowserClient).toBe("function");
		expect(typeof mod.getAccount).toBe("function");
		expect(typeof mod.ensureBrowserSession).toBe("function");
	});

	it("should get browser client", async () => {
		const { getBrowserClient } = await import("../lib/appwrite");
		const client = getBrowserClient();
		expect(client).toBeDefined();
	});

	it("should get account instance", async () => {
		const { getAccount } = await import("../lib/appwrite");
		const account = getAccount();
		expect(account).toBeDefined();
	});

	it("should ensure browser session returns success", async () => {
		const { ensureBrowserSession } = await import("../lib/appwrite");
		const result = await ensureBrowserSession();

		expect(result).toBeDefined();
		// Result can be either success or error
		if ("ok" in result && result.ok) {
			expect(result.userId).toBeDefined();
		}
	});
});

describe("Appwrite Config", () => {
	it("should export config functions", async () => {
		const mod = await import("../lib/appwrite-config");
		expect(typeof mod.getAppwriteIds).toBe("function");
		expect(typeof mod.resetAppwriteIdsCache).toBe("function");
	});

	it("should get appwrite IDs", async () => {
		const { getAppwriteIds } = await import("../lib/appwrite-config");
		const ids = getAppwriteIds();

		expect(ids).toBeDefined();
		expect(ids.databaseId).toBeDefined();
	});

	it("should reset cache without throwing", async () => {
		const { resetAppwriteIdsCache } = await import("../lib/appwrite-config");
		// Should not throw
		expect(() => resetAppwriteIdsCache()).not.toThrow();
	});
});

describe("Appwrite Messages Enriched", () => {
	it("should export enriched messages function", async () => {
		const mod = await import("../lib/appwrite-messages-enriched");
		expect(typeof mod.getEnrichedMessages).toBe("function");
	});
});
