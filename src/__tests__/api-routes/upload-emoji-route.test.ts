import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { NextRequest as RealNextRequest } from "next/server";

const {
  mockSession,
  mockGetEnv,
  mockCreateFile,
  mockDeleteFile,
} = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockGetEnv: vi.fn(),
  mockCreateFile: vi.fn(),
  mockDeleteFile: vi.fn(),
}));

vi.mock("node-appwrite", () => ({
  ID: { unique: () => "file-unique" },
  Permission: {
    read: vi.fn((role: string) => `read-${role}`),
    update: vi.fn((role: string) => `update-${role}`),
    delete: vi.fn((role: string) => `delete-${role}`),
  },
  Role: {
    any: vi.fn(() => "any"),
    user: vi.fn((id: string) => `user-${id}`),
  },
}));

vi.mock("@/lib/auth-server", () => ({ getServerSession: mockSession }));
vi.mock("@/lib/appwrite-core", () => ({ getEnvConfig: mockGetEnv }));
vi.mock("@/lib/appwrite-server", () => ({
  getServerClient: vi.fn(() => ({
    storage: {
      createFile: mockCreateFile,
      deleteFile: mockDeleteFile,
    },
  })),
}));

const { POST, DELETE, OPTIONS } = await import("../../app/api/upload-emoji/route");

describe("upload-emoji route", () => {
  beforeEach(() => {
    mockSession.mockReset();
    mockGetEnv.mockReset();
    mockCreateFile.mockReset();
    mockDeleteFile.mockReset();
  });

  it("allows OPTIONS preflight", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(200);
  });

  it("rejects unauthorized upload", async () => {
    mockSession.mockResolvedValue(null);

    const request = new RealNextRequest("http://localhost/api/upload-emoji", {
      method: "POST",
      body: new FormData(),
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("requires a file", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetEnv.mockReturnValue({ buckets: { emojis: "bucket" } });

    const formData = new FormData();
    formData.set("name", "smile");

    const request = new RealNextRequest("http://localhost/api/upload-emoji", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No file provided");
  });

  it("rejects invalid emoji names", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetEnv.mockReturnValue({ buckets: { emojis: "bucket" } });

    const formData = new FormData();
    const file = new File(["data"], "smile.png", { type: "image/png" });
    formData.set("file", file);
    formData.set("name", "bad name!");

    const request = new RealNextRequest("http://localhost/api/upload-emoji", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Emoji name can only contain letters");
  });

  it("rejects non-image files", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetEnv.mockReturnValue({ buckets: { emojis: "bucket" } });

    const formData = new FormData();
    const file = new File(["data"], "notes.txt", { type: "text/plain" });
    formData.set("file", file);
    formData.set("name", "notes");

    const request = new RealNextRequest("http://localhost/api/upload-emoji", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Only image files are allowed");
  });

  it("uploads an emoji when payload is valid", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetEnv.mockReturnValue({ buckets: { emojis: "bucket" } });
    mockCreateFile.mockResolvedValue({ $id: "file-123" });

    const formData = new FormData();
    const file = new File(["data"], "smile.png", { type: "image/png" });
    formData.set("file", file);
    formData.set("name", "smile");

    const request = new RealNextRequest("http://localhost/api/upload-emoji", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateFile).toHaveBeenCalledWith(
      "bucket",
      "file-unique",
      expect.any(File),
      expect.any(Array)
    );
    expect(data.fileId).toBe("file-123");
    expect(data.url).toBe("/api/emoji/file-123");
  });

  it("deletes an emoji when fileId is provided", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetEnv.mockReturnValue({ buckets: { emojis: "bucket" } });

    const request = new RealNextRequest("http://localhost/api/upload-emoji?fileId=file-1", {
      method: "DELETE",
    });

    const response = await DELETE(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeleteFile).toHaveBeenCalledWith("bucket", "file-1");
    expect(data.success).toBe(true);
  });

  it("requires fileId on delete", async () => {
    mockSession.mockResolvedValue({ $id: "user-1" });
    mockGetEnv.mockReturnValue({ buckets: { emojis: "bucket" } });

    const request = new RealNextRequest("http://localhost/api/upload-emoji", {
      method: "DELETE",
    });

    const response = await DELETE(request as unknown as NextRequest);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No fileId provided");
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });
});
