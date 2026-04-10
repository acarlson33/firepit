import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, DELETE } from "@/app/api/upload-file/route";
import { AppwriteException } from "node-appwrite";

// Mock node-appwrite
vi.mock("node-appwrite", () => ({
    ID: { unique: () => "mock-file-id" },
    AppwriteException: class AppwriteException extends Error {
        code: number;
        type: string;
        constructor(message: string, code = 500, type = "unknown") {
            super(message);
            this.code = code;
            this.type = type;
        }
    },
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
const {
    mockGetServerSession,
    mockCreateFile,
    mockGetFile,
    mockDeleteFile,
    mockCheckRateLimit,
} = vi.hoisted(() => ({
    mockGetServerSession: vi.fn(),
    mockCreateFile: vi.fn(),
    mockGetFile: vi.fn().mockResolvedValue({
        $id: "file123",
        $permissions: ['delete("user:user123")', 'read("user:user123")'],
    }),
    mockDeleteFile: vi.fn(),
    mockCheckRateLimit: vi.fn(() => ({
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 300_000,
        retryAfter: 60,
    })),
}));

// Mock dependencies
vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/appwrite-server", () => ({
    getServerClient: vi.fn(() => ({
        storage: {
            createFile: mockCreateFile,
            getFile: mockGetFile,
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

vi.mock("@/lib/rate-limiter", () => ({
    checkRateLimit: mockCheckRateLimit,
}));

function createFileFromBytes(
    bytes: number[],
    fileName: string,
    type: string,
): File {
    return new File([new Uint8Array(bytes)], fileName, { type });
}

describe("POST /api/upload-file", () => {
    beforeEach(() => {
        mockGetServerSession.mockClear();
        mockCreateFile.mockClear();
        mockDeleteFile.mockClear();
        mockCheckRateLimit.mockClear();
        mockCheckRateLimit.mockReturnValue({
            allowed: true,
            remaining: 9,
            resetAt: Date.now() + 300_000,
            retryAfter: 60,
        });
    });

    it("should reject unauthorized requests", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const formData = new FormData();
        formData.append(
            "file",
            new File(["test"], "test.pdf", { type: "application/pdf" }),
        );

        const request = new Request("http://localhost/api/upload-file", {
            method: "POST",
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(401);

        const data = await response.json();
        expect(data).toEqual({ error: "Unauthorized" });
    });

    it("should return 429 when upload rate limit is exceeded", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });
        mockCheckRateLimit.mockReturnValueOnce({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60_000,
            retryAfter: 60,
        });

        const formData = new FormData();
        formData.append(
            "file",
            createFileFromBytes(
                [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31],
                "test.pdf",
                "application/pdf",
            ),
        );

        const request = new Request("http://localhost/api/upload-file", {
            method: "POST",
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(429);

        const data = await response.json();
        expect(data.error).toContain("Too many upload requests");
        expect(mockCreateFile).not.toHaveBeenCalled();
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
        formData.append(
            "file",
            new File(["test"], "test.exe", {
                type: "application/x-msdownload",
            }),
        );

        const request = new Request("http://localhost/api/upload-file", {
            method: "POST",
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toBe("File type not supported");
    });

    it("should reject files that are too large", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });

        const formData = new FormData();
        // Create a buffer that simulates a 60MB file (just create a 60MB buffer for validation)
        const largeBuffer = new ArrayBuffer(60 * 1024 * 1024);
        const largeFile = new File([largeBuffer], "large.mp4", {
            type: "video/mp4",
        });
        formData.append("file", largeFile);

        const request = new Request("http://localhost/api/upload-file", {
            method: "POST",
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toContain("File size exceeds maximum");
    }, 30000); // Increase timeout to 30 seconds for large file handling

    it("should accept valid PDF files", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });
        mockCreateFile.mockResolvedValue({
            $id: "file123",
        });

        const formData = new FormData();
        formData.append(
            "file",
            createFileFromBytes(
                [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
                "test.pdf",
                "application/pdf",
            ),
        );

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
        formData.append(
            "file",
            createFileFromBytes(
                [
                    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73,
                    0x6f, 0x6d,
                ],
                "test.mp4",
                "video/mp4",
            ),
        );

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
        formData.append(
            "file",
            createFileFromBytes(
                [0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00],
                "test.mp3",
                "audio/mpeg",
            ),
        );

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
        formData.append(
            "file",
            createFileFromBytes(
                [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
                "test.pdf",
                "application/pdf",
            ),
        );

        const request = new Request("http://localhost/api/upload-file", {
            method: "POST",
            body: formData,
        });

        const response = await POST(request);
        expect(response.status).toBe(500);

        const data = await response.json();
        expect(data.error).toBe("Internal server error");
    });
});

describe("DELETE /api/upload-file", () => {
    beforeEach(() => {
        mockGetServerSession.mockClear();
        mockDeleteFile.mockClear();
        mockCheckRateLimit.mockClear();
        mockCheckRateLimit.mockReturnValue({
            allowed: true,
            remaining: 19,
            resetAt: Date.now() + 300_000,
            retryAfter: 60,
        });
    });

    it("should reject unauthorized requests", async () => {
        mockGetServerSession.mockResolvedValue(null);

        const request = new Request(
            "http://localhost/api/upload-file?fileId=file123",
            {
                method: "DELETE",
            },
        );

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

    it("should return 429 when delete rate limit is exceeded", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });
        mockCheckRateLimit.mockReturnValueOnce({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60_000,
            retryAfter: 60,
        });

        const request = new Request(
            "http://localhost/api/upload-file?fileId=file123",
            {
                method: "DELETE",
            },
        );

        const response = await DELETE(request);
        expect(response.status).toBe(429);

        const data = await response.json();
        expect(data.error).toContain("Too many delete requests");
        expect(mockDeleteFile).not.toHaveBeenCalled();
    });

    it("should delete a file successfully", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });
        mockDeleteFile.mockResolvedValue(undefined);

        const request = new Request(
            "http://localhost/api/upload-file?fileId=file123",
            {
                method: "DELETE",
            },
        );

        const response = await DELETE(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data).toEqual({ success: true });
        expect(mockDeleteFile).toHaveBeenCalledWith("files", "file123");
    });

    it("should return 403 when Appwrite rejects with forbidden", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "differentUser" });
        mockDeleteFile.mockRejectedValue(
            new AppwriteException("Forbidden", 403, "user_unauthorized"),
        );

        const request = new Request(
            "http://localhost/api/upload-file?fileId=file123",
            { method: "DELETE" },
        );

        const response = await DELETE(request);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data).toEqual({ error: "Forbidden" });
        expect(mockDeleteFile).toHaveBeenCalledWith("files", "file123");
    });

    it("should return 404 when file does not exist", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });
        mockDeleteFile.mockRejectedValue(
            new AppwriteException("Not found", 404, "document_not_found"),
        );

        const request = new Request(
            "http://localhost/api/upload-file?fileId=missing-file",
            { method: "DELETE" },
        );

        const response = await DELETE(request);
        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data).toEqual({ error: "File not found" });
    });

    it("should handle delete errors gracefully", async () => {
        mockGetServerSession.mockResolvedValue({ $id: "user123" });
        mockDeleteFile.mockRejectedValue(new Error("Delete failed"));

        const request = new Request(
            "http://localhost/api/upload-file?fileId=file123",
            {
                method: "DELETE",
            },
        );

        const response = await DELETE(request);
        expect(response.status).toBe(500);

        const data = await response.json();
        expect(data).toEqual({ error: "Failed to delete file" });
    });
});
