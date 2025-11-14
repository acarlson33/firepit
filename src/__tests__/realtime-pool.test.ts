import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock Appwrite Client
vi.mock("appwrite", () => ({
	Client: vi.fn().mockImplementation(() => ({
		setEndpoint: vi.fn().mockReturnThis(),
		setProject: vi.fn().mockReturnThis(),
	})),
}));

describe("Realtime Pool", () => {
	let getSharedClient: () => unknown;
	let trackSubscription: (channel: string) => () => void;
	let hasActiveSubscriptions: (channel: string) => boolean;

	beforeEach(async () => {
		// Reset environment variables
		process.env.APPWRITE_ENDPOINT = "https://cloud.appwrite.io/v1";
		process.env.APPWRITE_PROJECT_ID = "test-project";
		
		vi.clearAllMocks();
		vi.resetModules();

		// Re-import the module to get fresh state
		const module = await import("@/lib/realtime-pool");
		getSharedClient = module.getSharedClient;
		trackSubscription = module.trackSubscription;
		hasActiveSubscriptions = module.hasActiveSubscriptions;
	});

	afterEach(() => {
		vi.resetModules();
	});

	describe("getSharedClient", () => {
		it("should create a new client when none exists", () => {
			const client = getSharedClient();
			expect(client).toBeDefined();
			expect(typeof client).toBe("object");
		});

		it("should return the same client on subsequent calls", () => {
			const client1 = getSharedClient();
			const client2 = getSharedClient();
			expect(client1).toBe(client2);
		});

		it("should throw error when APPWRITE_ENDPOINT is missing", async () => {
			delete process.env.APPWRITE_ENDPOINT;
			vi.resetModules();
			
			const module = await import("@/lib/realtime-pool");
			expect(() => module.getSharedClient()).toThrow("Missing Appwrite configuration");
		});

		it("should throw error when APPWRITE_PROJECT_ID is missing", async () => {
			delete process.env.APPWRITE_PROJECT_ID;
			vi.resetModules();
			
			const module = await import("@/lib/realtime-pool");
			expect(() => module.getSharedClient()).toThrow("Missing Appwrite configuration");
		});
	});

	describe("trackSubscription", () => {
		it("should track a new subscription", () => {
			const cleanup = trackSubscription("channel-1");
			
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			expect(typeof cleanup).toBe("function");
		});

		it("should increment subscription count for same channel", () => {
			const cleanup1 = trackSubscription("channel-1");
			const cleanup2 = trackSubscription("channel-1");
			
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			
			cleanup1();
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			
			cleanup2();
			expect(hasActiveSubscriptions("channel-1")).toBe(false);
		});

		it("should handle multiple channels independently", () => {
			trackSubscription("channel-1");
			trackSubscription("channel-2");
			
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			expect(hasActiveSubscriptions("channel-2")).toBe(true);
		});

		it("should cleanup subscription when cleanup function is called", () => {
			const cleanup = trackSubscription("channel-1");
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			
			cleanup();
			expect(hasActiveSubscriptions("channel-1")).toBe(false);
		});

		it("should handle cleanup called multiple times safely", () => {
			const cleanup = trackSubscription("channel-1");
			
			cleanup();
			cleanup();
			cleanup();
			
			expect(hasActiveSubscriptions("channel-1")).toBe(false);
		});

		it("should track multiple subscriptions and cleanup correctly", () => {
			const cleanup1 = trackSubscription("channel-1");
			const cleanup2 = trackSubscription("channel-1");
			const cleanup3 = trackSubscription("channel-1");
			
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			
			cleanup1();
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			
			cleanup2();
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
			
			cleanup3();
			expect(hasActiveSubscriptions("channel-1")).toBe(false);
		});
	});

	describe("hasActiveSubscriptions", () => {
		it("should return false for untracked channel", () => {
			expect(hasActiveSubscriptions("unknown-channel")).toBe(false);
		});

		it("should return true for tracked channel", () => {
			trackSubscription("channel-1");
			expect(hasActiveSubscriptions("channel-1")).toBe(true);
		});

		it("should return false after all subscriptions are cleaned up", () => {
			const cleanup1 = trackSubscription("channel-1");
			const cleanup2 = trackSubscription("channel-1");
			
			cleanup1();
			cleanup2();
			
			expect(hasActiveSubscriptions("channel-1")).toBe(false);
		});

		it("should handle empty string channel", () => {
			expect(hasActiveSubscriptions("")).toBe(false);
			
			const cleanup = trackSubscription("");
			expect(hasActiveSubscriptions("")).toBe(true);
			
			cleanup();
			expect(hasActiveSubscriptions("")).toBe(false);
		});
	});
});
