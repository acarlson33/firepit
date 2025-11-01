import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, DELETE } from "@/app/api/upload-file/route";

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
	ID: { unique: () => "mock-file-id" },
	Permission: {
		read: vi.fn((role) => `read(${role})`),
		update: vi.fn((role) => `update(${role})`),
		delete: vi.fn((role) => `delete(${role})`),
	},
	Role: {
		any: vi.fn(() => "any"),
		user: vi.fn((id) => `user:${id}`),
	},
}));

// Create persistent mocks using vi.hoisted
const { mockGetServerSession, mockCreateFile, mockDeleteFile } = vi.hoisted(() => ({
	mockGetServerSession: vi.fn(),
	mockCreateFile: vi.fn(),
	mockDeleteFile: vi.fn(),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
	getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
	getServerClient: vi.fn(() => ({
		storage: {
			createFile: mockCreateFile,
			deleteFile: mockDeleteFile,
		},
	})),
}));

vi.mock("@/lib/appwrite-core", () => ({
	getEnvConfig: vi.fn(() => ({
		endpoint: "https://cloud.appwrite.io/v1",
		project: "test-project",
		databaseId: "main",
		collections: {
			servers: "servers",
			channels: "channels",
			messages: "messages",
			audit: "audit",
			typing: "typing",
			memberships: "memberships",
			profiles: "profiles",
			conversations: "conversations",
			directMessages: "direct_messages",
			statuses: "statuses",
		},
		buckets: {
			files: "files",
			avatars: "avatars",
			images: "images",
			emojis: "emojis",
		},
		teams: {
			adminTeamId: null,
			moderatorTeamId: null,
		},
	})),
}));

vi.mock("@/lib/newrelic-utils", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
	recordError: vi.fn(),
	setTransactionName: vi.fn(),
	trackApiCall: vi.fn(),
	addTransactionAttributes: vi.fn(),
	recordEvent: vi.fn(),
}));

describe("POST /api/upload-file", () => {
	beforeEach(() => {
		mockGetServerSession.mockClear();
		mockCreateFile.mockClear();
		mockDeleteFile.mockClear();
	});

	it("should reject unauthorized requests", async () => {
		mockGetServerSession.mockResolvedValue(null);

		const formData = new FormData();
		formData.append("file", new File(["test"], "test.pdf", { type: "application/pdf" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(401);

		const data = await response.json();
		expect(data).toEqual({ error: "Unauthorized" });
	});

	it("should reject requests without a file", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });

		const formData = new FormData();

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data).toEqual({ error: "No file provided" });
	});

	it("should reject unsupported file types", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });

		const formData = new FormData();
		formData.append("file", new File(["test"], "test.exe", { type: "application/x-msdownload" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(400);

	const data = await response.json();
	expect(data.error).toBe("File type not supported");
});

it(
	"should reject files that are too large",
	async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });

		const formData = new FormData();
		// Create a 60MB file (exceeds 50MB video limit)
		const largeContent = new Uint8Array(60 * 1024 * 1024);
		formData.append("file", new File([largeContent], "large.mp4", { type: "video/mp4" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toContain("File size exceeds maximum");
	},
	10000,
);	it("should accept valid PDF files", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });
		mockCreateFile.mockResolvedValue({
			$id: "file123",
		});

		const formData = new FormData();
		formData.append("file", new File(["test content"], "test.pdf", { type: "application/pdf" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.fileId).toBe("file123");
		expect(data.fileName).toBe("test.pdf");
		expect(data.fileType).toBe("application/pdf");
		expect(data.category).toBe("documents");
		expect(mockCreateFile).toHaveBeenCalled();
	});

	it("should accept valid video files", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });
		mockCreateFile.mockResolvedValue({
			$id: "video123",
		});

		const formData = new FormData();
		formData.append("file", new File(["video content"], "test.mp4", { type: "video/mp4" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.fileId).toBe("video123");
		expect(data.category).toBe("videos");
	});

	it("should accept valid audio files", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });
		mockCreateFile.mockResolvedValue({
			$id: "audio123",
		});

		const formData = new FormData();
		formData.append("file", new File(["audio content"], "test.mp3", { type: "audio/mpeg" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.fileId).toBe("audio123");
		expect(data.category).toBe("audio");
	});

	it("should handle upload errors gracefully", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });
		mockCreateFile.mockRejectedValue(new Error("Storage error"));

		const formData = new FormData();
		formData.append("file", new File(["test"], "test.pdf", { type: "application/pdf" }));

		const request = new Request("http://localhost/api/upload-file", {
			method: "POST",
			body: formData,
		});

		const response = await POST(request);
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data.error).toBe("Storage error");
	});
});

describe("DELETE /api/upload-file", () => {
	beforeEach(() => {
		mockGetServerSession.mockClear();
		mockCreateFile.mockClear();
		mockDeleteFile.mockClear();
	});

	it("should reject unauthorized requests", async () => {
		mockGetServerSession.mockResolvedValue(null);

		const request = new Request("http://localhost/api/upload-file?fileId=file123", {
			method: "DELETE",
		});

		const response = await DELETE(request);
		expect(response.status).toBe(401);

		const data = await response.json();
		expect(data).toEqual({ error: "Unauthorized" });
	});

	it("should reject requests without fileId", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });

		const request = new Request("http://localhost/api/upload-file", {
			method: "DELETE",
		});

		const response = await DELETE(request);
		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data).toEqual({ error: "No fileId provided" });
	});

	it("should delete a file successfully", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });
		mockDeleteFile.mockResolvedValue(undefined);

		const request = new Request("http://localhost/api/upload-file?fileId=file123", {
			method: "DELETE",
		});

		const response = await DELETE(request);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data).toEqual({ success: true });
		expect(mockDeleteFile).toHaveBeenCalledWith("files", "file123");
	});

	it("should handle delete errors gracefully", async () => {
		mockGetServerSession.mockResolvedValue({ $id: "user123" });
		mockDeleteFile.mockRejectedValue(new Error("Delete failed"));

		const request = new Request("http://localhost/api/upload-file?fileId=file123", {
			method: "DELETE",
		});

		const response = await DELETE(request);
		expect(response.status).toBe(500);

		const data = await response.json();
		expect(data).toEqual({ error: "Failed to delete file" });
	});
});
