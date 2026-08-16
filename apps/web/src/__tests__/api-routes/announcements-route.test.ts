import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    mockCreateAnnouncement,
    mockDispatchScheduledAnnouncements,
    mockGetAnnouncementRuntimeSettings,
    mockListAnnouncements,
    mockLoggerError,
    mockRequireAdmin,
} = vi.hoisted(() => ({
    mockCreateAnnouncement: vi.fn(),
    mockDispatchScheduledAnnouncements: vi.fn(),
    mockGetAnnouncementRuntimeSettings: vi.fn(),
    mockListAnnouncements: vi.fn(),
    mockLoggerError: vi.fn(),
    mockRequireAdmin: vi.fn(),
}));

vi.mock("@/lib/appwrite-announcements", () => ({
    createAnnouncement: mockCreateAnnouncement,
    dispatchScheduledAnnouncements: mockDispatchScheduledAnnouncements,
    getAnnouncementRuntimeSettings: mockGetAnnouncementRuntimeSettings,
    listAnnouncements: mockListAnnouncements,
}));

vi.mock("@/lib/auth-server", () => {
    class AuthError extends Error {
        readonly code: "UNAUTHORIZED" | "FORBIDDEN";

        constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message?: string) {
            super(
                message ?? (code === "UNAUTHORIZED" ? "Unauthorized" : "Forbidden"),
            );
            this.name = "AuthError";
            this.code = code;
        }
    }

    return {
        AuthError,
        requireAdmin: mockRequireAdmin,
    };
});

vi.mock("@/lib/newrelic-utils", () => ({
    logger: {
        error: mockLoggerError,
    },
}));

const { GET, POST } = await import("../../app/api/announcements/route");
const { POST: dispatchAnnouncements } = await import(
    "../../app/api/announcements/dispatch/route",
);

describe("announcements API routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGetAnnouncementRuntimeSettings.mockReturnValue({
            dispatcherSecret: "dispatcher-secret",
            systemSenderUserId: "system-user",
        });
        mockRequireAdmin.mockResolvedValue({
            user: { $id: "admin-1" },
            roles: { isAdmin: true },
        });
    });

    it("lists announcements with normalized filters", async () => {
        mockListAnnouncements.mockResolvedValue({
            items: [{ $id: "ann-1" }],
            nextCursor: "cursor-1",
        });

        const response = await GET(
            new Request(
                "http://localhost/api/announcements?cursorAfter=cursor-0&limit=150&statuses=sent,scheduled,invalid,scheduled",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockListAnnouncements).toHaveBeenCalledWith({
            cursorAfter: "cursor-0",
            limit: 100,
            statuses: ["sent", "scheduled"],
        });
        expect(data.success).toBe(true);
        expect(data.items).toHaveLength(1);
        expect(data.nextCursor).toBe("cursor-1");
    });

    it("returns 401 when the caller is not authenticated as admin", async () => {
        const { AuthError } = await import("../../lib/auth-server");
        mockRequireAdmin.mockRejectedValue(new AuthError("UNAUTHORIZED"));

        const response = await GET(
            new Request("http://localhost/api/announcements"),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
        expect(mockListAnnouncements).not.toHaveBeenCalled();
    });

    it("returns 500 when listing announcements fails", async () => {
        mockListAnnouncements.mockRejectedValue(new Error("boom"));

        const response = await GET(
            new Request("http://localhost/api/announcements"),
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to list announcements");
        expect(mockLoggerError).toHaveBeenCalledWith(
            "Failed to list announcements",
            expect.objectContaining({ error: "boom" }),
        );
    });

    it("rejects invalid announcement payloads", async () => {
        const response = await POST(
            new Request("http://localhost/api/announcements", {
                body: JSON.stringify({ body: 123 }),
                method: "POST",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe("body must be a string");
        expect(mockCreateAnnouncement).not.toHaveBeenCalled();
    });

    // `mockCreateAnnouncement` is expected to receive the raw POST payload here; whitespace is preserved by design for `body`, `title`, and `idempotencyKey`.
    it("creates announcements with validated fields", async () => {
        mockCreateAnnouncement.mockResolvedValue({
            $id: "ann-1",
            status: "draft",
        });

        const response = await POST(
            new Request("http://localhost/api/announcements", {
                body: JSON.stringify({
                    body: "  Hello everyone  ",
                    idempotencyKey: "  request-1  ",
                    mode: "send_now",
                    priority: "urgent",
                    scheduledFor: "2026-04-30T12:00:00.000Z",
                    title: "  Update  ",
                }),
                method: "POST",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(mockCreateAnnouncement).toHaveBeenCalledWith({
            actorId: "admin-1",
            body: "  Hello everyone  ",
            idempotencyKey: "  request-1  ",
            mode: "send_now",
            priority: "urgent",
            scheduledFor: "2026-04-30T12:00:00.000Z",
            title: "  Update  ",
        });
        expect(data.announcement.$id).toBe("ann-1");
        expect(data.success).toBe(true);
    });

    it("returns 500 when announcement creation fails", async () => {
        mockCreateAnnouncement.mockRejectedValue(new Error("create failed"));

        const response = await POST(
            new Request("http://localhost/api/announcements", {
                body: JSON.stringify({ body: "Hello" }),
                method: "POST",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to create announcement");
        expect(mockLoggerError).toHaveBeenCalledWith(
            "Failed to create announcement",
            expect.objectContaining({ error: "create failed" }),
        );
    });

    it("rejects dispatch requests without a configured secret", async () => {
        mockGetAnnouncementRuntimeSettings.mockReturnValue({
            dispatcherSecret: null,
            systemSenderUserId: "system-user",
        });

        const response = await dispatchAnnouncements(
            new Request("http://localhost/api/announcements/dispatch"),
        );
        const data = await response.json();

        expect(response.status).toBe(503);
        expect(data.error).toBe("Announcements dispatcher secret is not configured");
    });

    it("rejects dispatch requests with an invalid secret", async () => {
        const response = await dispatchAnnouncements(
            new Request("http://localhost/api/announcements/dispatch", {
                headers: {
                    "x-announcements-dispatcher-secret": "wrong-secret",
                },
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Unauthorized");
        expect(mockDispatchScheduledAnnouncements).not.toHaveBeenCalled();
    });

    it("dispatches due announcements after verifying the secret", async () => {
        mockDispatchScheduledAnnouncements.mockResolvedValue({
            announcementIds: ["ann-1", "ann-2"],
            dueCount: 2,
        });

        const response = await dispatchAnnouncements(
            new Request(
                "http://localhost/api/announcements/dispatch?limit=150",
                {
                    headers: {
                        "x-announcements-dispatcher-secret": "dispatcher-secret",
                    },
                },
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockDispatchScheduledAnnouncements).toHaveBeenCalledWith(100);
        expect(data.dispatched).toBe(2);
        expect(data.announcementIds).toEqual(["ann-1", "ann-2"]);
    });

    it("returns 500 when dispatching scheduled announcements fails", async () => {
        mockDispatchScheduledAnnouncements.mockRejectedValue(
            new Error("dispatch failed"),
        );

        const response = await dispatchAnnouncements(
            new Request("http://localhost/api/announcements/dispatch", {
                headers: {
                    "x-announcements-dispatcher-secret": "dispatcher-secret",
                },
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("Failed to dispatch announcements");
        expect(mockLoggerError).toHaveBeenCalledWith(
            "Failed to dispatch announcements from API route",
            expect.objectContaining({
                error: "dispatch failed",
                limit: 25,
            }),
        );
    });
});