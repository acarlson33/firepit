import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, PATCH } from "@/app/api/thread-reads/route";

const { mockSession, mockGetThreadReads, mockUpsertThreadReads } = vi.hoisted(
    () => ({
        mockGetThreadReads: vi.fn(),
        mockSession: vi.fn(),
        mockUpsertThreadReads: vi.fn(),
    }),
);

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/thread-read-store", () => ({
    getThreadReads: mockGetThreadReads,
    upsertThreadReads: mockUpsertThreadReads,
}));

describe("thread reads route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns 401 on GET when unauthenticated", async () => {
        mockSession.mockResolvedValue(null);

        const response = await GET(
            new NextRequest(
                "http://localhost/api/thread-reads?contextType=conversation&contextId=conv-1",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns filtered read states for the requested context", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockGetThreadReads.mockResolvedValue({
            $id: "settings-1",
            reads: {
                "message-1": "2026-03-10T12:00:00.000Z",
            },
        });

        const response = await GET(
            new NextRequest(
                "http://localhost/api/thread-reads?contextType=conversation&contextId=conv-1",
            ),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.reads).toEqual({
            "message-1": "2026-03-10T12:00:00.000Z",
        });
    });

    it("rejects invalid PATCH payloads", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });

        const response = await PATCH(
            new NextRequest("http://localhost/api/thread-reads", {
                body: JSON.stringify({
                    contextId: "conv-1",
                    contextType: "conversation",
                    reads: [],
                }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("reads must be a record");
        expect(mockUpsertThreadReads).not.toHaveBeenCalled();
    });

    it("persists thread read states on PATCH", async () => {
        mockSession.mockResolvedValue({ $id: "user-1" });
        mockUpsertThreadReads.mockResolvedValue({
            $id: "settings-1",
            reads: {
                "message-2": "2026-03-10T14:00:00.000Z",
            },
        });

        const response = await PATCH(
            new NextRequest("http://localhost/api/thread-reads", {
                body: JSON.stringify({
                    contextId: "conv-1",
                    contextType: "conversation",
                    reads: {
                        "message-2": "2026-03-10T14:00:00.000Z",
                    },
                }),
                method: "PATCH",
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpsertThreadReads).toHaveBeenCalledWith({
            contextId: "conv-1",
            contextType: "conversation",
            reads: {
                "message-2": "2026-03-10T14:00:00.000Z",
            },
            userId: "user-1",
        });
        expect(data.reads).toEqual({
            "message-2": "2026-03-10T14:00:00.000Z",
        });
    });
});
