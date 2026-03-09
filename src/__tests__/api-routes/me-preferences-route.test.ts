import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { GET, PATCH } from "../../app/api/me/preferences/route";

const { mockSession, mockGetOrCreateProfile, mockUpdateProfile } = vi.hoisted(
    () => ({
        mockSession: vi.fn(),
        mockGetOrCreateProfile: vi.fn(),
        mockUpdateProfile: vi.fn(),
    }),
);

vi.mock("@/lib/auth-server", () => ({
    getServerSession: mockSession,
}));

vi.mock("@/lib/appwrite-profiles", () => ({
    getOrCreateUserProfile: mockGetOrCreateProfile,
    updateUserProfile: mockUpdateProfile,
}));

describe("Me preferences route", () => {
    beforeEach(() => {
        mockSession.mockReset();
        mockGetOrCreateProfile.mockReset();
        mockUpdateProfile.mockReset();
    });

    it("returns 401 when unauthenticated on GET", async () => {
        mockSession.mockResolvedValue(null);

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data.error).toBe("Authentication required");
    });

    it("returns the persisted docs navigation preference", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            showDocsInNavigation: false,
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.showDocsInNavigation).toBe(false);
    });

    it("defaults docs navigation preference to true when not set", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.showDocsInNavigation).toBe(true);
    });

    it("rejects invalid PATCH payloads", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({ showDocsInNavigation: "nope" }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("showDocsInNavigation");
        expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it("updates the persisted docs navigation preference", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
        });
        mockUpdateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            showDocsInNavigation: false,
        });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({ showDocsInNavigation: false }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith("profile-1", {
            showDocsInNavigation: false,
        });
        expect(data.showDocsInNavigation).toBe(false);
    });
});
