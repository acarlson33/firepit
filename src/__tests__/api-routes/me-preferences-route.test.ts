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
            showFriendsInNavigation: true,
            showSettingsInNavigation: false,
            showAddFriendInHeader: false,
            navigationItemOrder: ["settings", "docs", "friends"],
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.showDocsInNavigation).toBe(false);
        expect(data.showFriendsInNavigation).toBe(true);
        expect(data.showSettingsInNavigation).toBe(false);
        expect(data.showAddFriendInHeader).toBe(false);
        expect(data.navigationItemOrder).toEqual([
            "settings",
            "docs",
            "friends",
        ]);
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
        expect(data.showFriendsInNavigation).toBe(true);
        expect(data.showSettingsInNavigation).toBe(true);
        expect(data.showAddFriendInHeader).toBe(true);
        expect(data.navigationItemOrder).toEqual([
            "docs",
            "friends",
            "settings",
        ]);
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

    it("rejects invalid add friend header preference payloads", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({ showAddFriendInHeader: "nope" }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("showAddFriendInHeader");
        expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it("rejects invalid navigation order payloads", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({ navigationItemOrder: ["docs", "admin"] }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("navigationItemOrder");
        expect(mockUpdateProfile).not.toHaveBeenCalled();
    });

    it("updates the persisted docs navigation preference", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            showDocsInNavigation: true,
            showFriendsInNavigation: true,
            showSettingsInNavigation: true,
            showAddFriendInHeader: true,
            navigationItemOrder: ["docs", "friends", "settings"],
        });
        mockUpdateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            showDocsInNavigation: false,
            showFriendsInNavigation: true,
            showSettingsInNavigation: false,
            showAddFriendInHeader: false,
            navigationItemOrder: ["settings", "docs", "friends"],
        });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({
                showDocsInNavigation: false,
                showSettingsInNavigation: false,
                showAddFriendInHeader: false,
                navigationItemOrder: ["settings", "docs", "friends"],
            }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith("profile-1", {
            showDocsInNavigation: false,
            showFriendsInNavigation: true,
            showSettingsInNavigation: false,
            showAddFriendInHeader: false,
            navigationItemOrder: ["settings", "docs", "friends"],
        });
        expect(data.showDocsInNavigation).toBe(false);
        expect(data.showSettingsInNavigation).toBe(false);
        expect(data.showAddFriendInHeader).toBe(false);
        expect(data.navigationItemOrder).toEqual([
            "settings",
            "docs",
            "friends",
        ]);
    });
});
