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
            telemetryEnabled: false,
            navigationItemOrder: ["settings", "docs", "friends"],
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.showDocsInNavigation).toBe(false);
        expect(data.showFriendsInNavigation).toBe(true);
        expect(data.showSettingsInNavigation).toBe(false);
        expect(data.showAddFriendInHeader).toBe(false);
        expect(data.telemetryEnabled).toBe(false);
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
        expect(data.telemetryEnabled).toBe(true);
        expect(data.navigationItemOrder).toEqual([
            "docs",
            "friends",
            "settings",
        ]);
    });

    it("parses legacy string navigation order values on GET", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            navigationItemOrder: "settings, docs, friends",
        });

        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.navigationItemOrder).toEqual([
            "settings",
            "docs",
            "friends",
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

    it("rejects invalid telemetry preference payloads", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({ telemetryEnabled: "nope" }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain("telemetryEnabled");
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
            telemetryEnabled: true,
            navigationItemOrder: ["docs", "friends", "settings"],
        });
        mockUpdateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            showDocsInNavigation: false,
            showFriendsInNavigation: true,
            showSettingsInNavigation: false,
            showAddFriendInHeader: false,
            telemetryEnabled: false,
            navigationItemOrder: ["settings", "docs", "friends"],
        });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({
                showDocsInNavigation: false,
                showSettingsInNavigation: false,
                showAddFriendInHeader: false,
                telemetryEnabled: false,
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
            telemetryEnabled: false,
            navigationItemOrder: ["settings", "docs", "friends"],
        });
        expect(data.showDocsInNavigation).toBe(false);
        expect(data.showSettingsInNavigation).toBe(false);
        expect(data.showAddFriendInHeader).toBe(false);
        expect(data.telemetryEnabled).toBe(false);
        expect(data.navigationItemOrder).toEqual([
            "settings",
            "docs",
            "friends",
        ]);
    });

    it("does not write navigation order when updating unrelated preferences", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            navigationItemOrder: "docs,friends,settings",
        });
        mockUpdateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            showAddFriendInHeader: false,
            navigationItemOrder: "docs,friends,settings",
        });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({ showAddFriendInHeader: false }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenCalledWith("profile-1", {
            showDocsInNavigation: true,
            showFriendsInNavigation: true,
            showSettingsInNavigation: true,
            showAddFriendInHeader: false,
        });
        expect(data.navigationItemOrder).toEqual([
            "docs",
            "friends",
            "settings",
        ]);
    });

    it("falls back to legacy string navigation order writes when needed", async () => {
        mockSession.mockResolvedValue({ $id: "user-1", name: "August" });
        mockGetOrCreateProfile.mockResolvedValue({
            $id: "profile-1",
            userId: "user-1",
            navigationItemOrder: "docs,friends,settings",
        });
        mockUpdateProfile
            .mockRejectedValueOnce(
                new Error(
                    'Invalid document structure: Attribute "navigationItemOrder" has invalid type. Value must be a valid string and no longer than 255 chars',
                ),
            )
            .mockResolvedValueOnce({
                $id: "profile-1",
                userId: "user-1",
                navigationItemOrder: "settings,docs,friends",
            });

        const request = new NextRequest("http://localhost/api/me/preferences", {
            method: "PATCH",
            body: JSON.stringify({
                navigationItemOrder: ["settings", "docs", "friends"],
            }),
        });

        const response = await PATCH(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockUpdateProfile).toHaveBeenNthCalledWith(1, "profile-1", {
            showDocsInNavigation: true,
            showFriendsInNavigation: true,
            showSettingsInNavigation: true,
            showAddFriendInHeader: true,
            navigationItemOrder: ["settings", "docs", "friends"],
        });
        expect(mockUpdateProfile).toHaveBeenNthCalledWith(2, "profile-1", {
            showDocsInNavigation: true,
            showFriendsInNavigation: true,
            showSettingsInNavigation: true,
            showAddFriendInHeader: true,
            navigationItemOrder: "settings,docs,friends",
        });
        expect(data.navigationItemOrder).toEqual([
            "settings",
            "docs",
            "friends",
        ]);
    });
});
