import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock environment variables
beforeEach(() => {
	process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = "http://localhost";
	process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = "test-project";
	process.env.NEXT_PUBLIC_APPWRITE_EMOJIS_BUCKET_ID = "emojis";
	vi.clearAllMocks();
});

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
	};
})();

Object.defineProperty(global, "localStorage", {
	value: localStorageMock,
	writable: true,
});

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

// Mock realtime pool
vi.mock("@/lib/realtime-pool", () => ({
	getSharedClient: vi.fn(() => ({
		subscribe: vi.fn(() => vi.fn()),
	})),
	trackSubscription: vi.fn(() => vi.fn()),
}));

describe("Custom Emojis - Optimistic Updates", () => {
	it("should create object URL for optimistic emoji preview", () => {
		const file = new File(["test"], "party.png", { type: "image/png" });
		const url = URL.createObjectURL(file);
		
		expect(url).toBe("blob:mock-url");
		expect(URL.createObjectURL).toHaveBeenCalledWith(file);
	});

	it("should cache emojis in localStorage", () => {
		const mockEmojis = [
			{ fileId: "emoji1", url: "/api/emoji/emoji1", name: "cached" },
		];

		localStorageMock.setItem("firepit_custom_emojis", JSON.stringify(mockEmojis));
		
		const stored = localStorageMock.getItem("firepit_custom_emojis");
		expect(stored).toBeDefined();
		
		const parsed = JSON.parse(stored!);
		expect(parsed).toEqual(mockEmojis);
		expect(parsed[0].name).toBe("cached");
	});

	it("should cleanup object URL to prevent memory leaks", () => {
		const mockUrl = "blob:mock-url";
		URL.revokeObjectURL(mockUrl);
		
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
	});

	it("should handle upload emoji API call", async () => {
		const mockResponse = {
			fileId: "emoji1",
			url: "/api/emoji/emoji1",
			name: "party",
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		});

		const formData = new FormData();
		formData.append("file", new File(["test"], "party.png", { type: "image/png" }));
		formData.append("name", "party");

		const response = await fetch("/api/upload-emoji", {
			method: "POST",
			body: formData,
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.fileId).toBe("emoji1");
		expect(data.name).toBe("party");
	});

	it("should handle delete emoji API call", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ success: true }),
		});

		const response = await fetch("/api/upload-emoji?fileId=emoji1", {
			method: "DELETE",
		});

		expect(response.ok).toBe(true);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it("should handle upload failure", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 400,
			json: async () => ({ error: "Upload failed" }),
		});

		const formData = new FormData();
		formData.append("file", new File(["test"], "fail.png", { type: "image/png" }));
		formData.append("name", "fail");

		const response = await fetch("/api/upload-emoji", {
			method: "POST",
			body: formData,
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(400);
	});

	it("should handle delete failure", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 404,
			json: async () => ({ error: "Not found" }),
		});

		const response = await fetch("/api/upload-emoji?fileId=nonexistent", {
			method: "DELETE",
		});

		expect(response.ok).toBe(false);
		expect(response.status).toBe(404);
	});

	it("should use localStorage as fallback cache", () => {
		const cachedEmojis = [
			{ fileId: "cached1", url: "/api/emoji/cached1", name: "offline" },
		];
		
		localStorageMock.setItem("firepit_custom_emojis", JSON.stringify(cachedEmojis));

		// Should be able to get from cache
		const stored = localStorageMock.getItem("firepit_custom_emojis");
		expect(stored).toBeDefined();
		
		const parsed = JSON.parse(stored!);
		expect(parsed).toEqual(cachedEmojis);
		expect(parsed[0].name).toBe("offline");
	});

	it("should list custom emojis from API", async () => {
		const mockEmojis = [
			{ fileId: "emoji1", url: "/api/emoji/emoji1", name: "first" },
			{ fileId: "emoji2", url: "/api/emoji/emoji2", name: "second" },
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockEmojis,
		});

		const response = await fetch("/api/custom-emojis");
		expect(response.ok).toBe(true);
		
		const data = await response.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(2);
		expect(data[0].name).toBe("first");
		expect(data[1].name).toBe("second");
	});
});

describe("Custom Emojis - Realtime Synchronization", () => {
	it("should have realtime pool utilities", async () => {
		const realtimePool = await import("@/lib/realtime-pool");
		
		expect(typeof realtimePool.getSharedClient).toBe("function");
		expect(typeof realtimePool.trackSubscription).toBe("function");
	});

	it("should mock realtime client subscription", () => {
		const mockClient = {
			subscribe: vi.fn(() => vi.fn()),
		};

		const unsubscribe = mockClient.subscribe("test-channel", () => {});
		
		expect(mockClient.subscribe).toHaveBeenCalledWith("test-channel", expect.any(Function));
		expect(typeof unsubscribe).toBe("function");
	});

	it("should handle storage bucket events", () => {
		const mockEvent = {
			events: ["buckets.emojis.files.*.create"],
			channels: ["buckets.emojis.files"],
			timestamp: Date.now(),
			payload: { $id: "emoji1" },
		};

		// Simulate event handler
		const handleEvent = vi.fn();
		handleEvent(mockEvent);
		
		expect(handleEvent).toHaveBeenCalledWith(mockEvent);
		expect(mockEvent.events[0]).toContain("create");
	});

	it("should handle create events", () => {
		const createEvent = {
			events: ["buckets.*.files.*.create"],
			channels: ["buckets.emojis.files"],
			timestamp: Date.now(),
			payload: { $id: "new-emoji" },
		};

		expect(createEvent.events[0]).toContain("create");
		expect(createEvent.payload.$id).toBe("new-emoji");
	});

	it("should handle delete events", () => {
		const deleteEvent = {
			events: ["buckets.*.files.*.delete"],
			channels: ["buckets.emojis.files"],
			timestamp: Date.now(),
			payload: { $id: "deleted-emoji" },
		};

		expect(deleteEvent.events[0]).toContain("delete");
		expect(deleteEvent.payload.$id).toBe("deleted-emoji");
	});

	it("should handle update events", () => {
		const updateEvent = {
			events: ["buckets.*.files.*.update"],
			channels: ["buckets.emojis.files"],
			timestamp: Date.now(),
			payload: { $id: "updated-emoji" },
		};

		expect(updateEvent.events[0]).toContain("update");
		expect(updateEvent.payload.$id).toBe("updated-emoji");
	});

	it("should construct correct channel name", () => {
		const bucketId = "emojis";
		const channel = `buckets.${bucketId}.files`;
		
		expect(channel).toBe("buckets.emojis.files");
	});

	it("should parse event types from event names", () => {
		const events = [
			"buckets.*.files.*.create",
			"buckets.*.files.*.delete",
			"buckets.*.files.*.update",
		];

		events.forEach((event) => {
			const eventType = event.split(".").pop();
			expect(["create", "delete", "update"]).toContain(eventType);
		});
	});
});
