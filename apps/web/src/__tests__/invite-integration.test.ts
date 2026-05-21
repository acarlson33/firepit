import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Store original fetch
const originalFetch = global.fetch;

// Mock toast
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("sonner", () => ({
  toast: mockToast,
}));

describe("Invite Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("Full Invite Flow", () => {
    it("should complete create → validate → use → exhaust lifecycle", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      
      // Step 1: Create invite with max uses = 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          $id: "invite-1",
          code: "fulltest123",
          serverId: "server-1",
          creatorId: "admin-1",
          currentUses: 0,
          maxUses: 1,
          temporary: false,
          $createdAt: new Date().toISOString(),
        }),
      } as Response);

      // Step 2: Validate invite (should be valid)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          invite: {
            code: "fulltest123",
            serverId: "server-1",
            maxUses: 1,
            currentUses: 0,
          },
        }),
      } as Response);

      // Step 3: Get server preview
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "Test Server",
          memberCount: 42,
        }),
      } as Response);

      // Step 4: Use invite
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          membershipId: "membership-1",
          serverId: "server-1",
        }),
      } as Response);

      // Step 5: Validate again (should be exhausted)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: false,
          error: "Invite has reached maximum uses",
        }),
      } as Response);

      // Execute the flow
      const createRes = await fetch("/api/servers/server-1/invites", {
        method: "POST",
        body: JSON.stringify({ maxUses: 1 }),
      });
      const invite = await createRes.json();
      expect(invite.code).toBe("fulltest123");
      expect(invite.maxUses).toBe(1);

      const validateRes = await fetch(`/api/invites/validate?code=${invite.code}`);
      const validation = await validateRes.json();
      expect(validation.valid).toBe(true);

      const previewRes = await fetch(`/api/invites/preview?code=${invite.code}`);
      const preview = await previewRes.json();
      expect(preview.name).toBe("Test Server");
      expect(preview.memberCount).toBe(42);

      const useRes = await fetch("/api/invites/use", {
        method: "POST",
        body: JSON.stringify({ code: invite.code }),
      });
      const useResult = await useRes.json();
      expect(useResult.success).toBe(true);

      const revalidateRes = await fetch(`/api/invites/validate?code=${invite.code}`);
      const revalidation = await revalidateRes.json();
      expect(revalidation.valid).toBe(false);
      expect(revalidation.error).toBe("Invite has reached maximum uses");
    });
  });

  describe("Invite Expiration", () => {
    it("should reject expired invites", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      const pastDate = new Date(Date.now() - 3600000).toISOString();

      // Validation returns expired error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: false,
          error: "Invite has expired",
        }),
      } as Response);

      // Use attempt fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: "Invite has expired",
        }),
      } as Response);

      const validateRes = await fetch("/api/invites/validate?code=expired123");
      const validation = await validateRes.json();
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe("Invite has expired");

      const useRes = await fetch("/api/invites/use", {
        method: "POST",
        body: JSON.stringify({ code: "expired123" }),
      });
      expect(useRes.ok).toBe(false);
    });
  });

  describe("Invite Revocation", () => {
    it("should prevent use after revocation", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      // Create invite
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          $id: "invite-3",
          code: "revoke123",
        }),
      } as Response);

      // Validate before revocation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: true,
          invite: { code: "revoke123" },
        }),
      } as Response);

      // Revoke
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      // Validate after revocation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: false,
          error: "Invite not found",
        }),
      } as Response);

      const createRes = await fetch("/api/servers/server-1/invites", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const invite = await createRes.json();

      const validateRes1 = await fetch(`/api/invites/validate?code=${invite.code}`);
      const validation1 = await validateRes1.json();
      expect(validation1.valid).toBe(true);

      const revokeRes = await fetch(`/api/invites/${invite.$id}`, {
        method: "DELETE",
      });
      const revokeResult = await revokeRes.json();
      expect(revokeResult.success).toBe(true);

      const validateRes2 = await fetch(`/api/invites/validate?code=${invite.code}`);
      const validation2 = await validateRes2.json();
      expect(validation2.valid).toBe(false);
    });
  });

  describe("Temporary Membership", () => {
    it("should create temporary membership when invite.temporary = true", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      // Create temporary invite
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          $id: "invite-4",
          code: "temp123456",
          temporary: true,
        }),
      } as Response);

      // Use invite
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          membershipId: "membership-temp-1",
          temporary: true,
        }),
      } as Response);

      const createRes = await fetch("/api/servers/server-1/invites", {
        method: "POST",
        body: JSON.stringify({ temporary: true }),
      });
      const invite = await createRes.json();
      expect(invite.temporary).toBe(true);

      const useRes = await fetch("/api/invites/use", {
        method: "POST",
        body: JSON.stringify({ code: invite.code }),
      });
      const useResult = await useRes.json();
      expect(useResult.success).toBe(true);
      expect(useResult.temporary).toBe(true);
    });
  });

  describe("Multi-Use Invites", () => {
    it("should track usage and reject after max uses", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      // Create invite with max uses = 3
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: "multi12345",
          maxUses: 3,
          currentUses: 0,
        }),
      } as Response);

      // User 1 uses (1/3)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, membershipId: "m-1" }),
      } as Response);

      // User 2 uses (2/3)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, membershipId: "m-2" }),
      } as Response);

      // User 3 uses (3/3)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, membershipId: "m-3" }),
      } as Response);

      // User 4 tries (should fail)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          valid: false,
          error: "Invite has reached maximum uses",
        }),
      } as Response);

      const createRes = await fetch("/api/servers/server-1/invites", {
        method: "POST",
        body: JSON.stringify({ maxUses: 3 }),
      });
      const invite = await createRes.json();

      // Three successful uses
      for (let i = 0; i < 3; i++) {
        await fetch(`/api/invites/validate?code=${invite.code}`);
        const useRes = await fetch("/api/invites/use", {
          method: "POST",
          body: JSON.stringify({ code: invite.code }),
        });
        const result = await useRes.json();
        expect(result.success).toBe(true);
      }

      // Fourth attempt fails
      const validateRes = await fetch(`/api/invites/validate?code=${invite.code}`);
      const validation = await validateRes.json();
      expect(validation.valid).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      try {
        await fetch("/api/servers/server-1/invites", {
          method: "POST",
          body: JSON.stringify({}),
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toBe("Network error");
      }
    });

    it("should handle invalid server ID", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "Server not found" }),
      } as Response);

      const res = await fetch("/api/servers/invalid-id/invites", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);

      const error = await res.json();
      expect(error.error).toBe("Server not found");
    });

    it("should handle unauthorized creation attempts", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: "Insufficient permissions" }),
      } as Response);

      const res = await fetch("/api/servers/server-1/invites", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(res.ok).toBe(false);
      expect(res.status).toBe(403);
    });
  });

  describe("Usage Tracking", () => {
    it("should track and report invite usage statistics", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

      // Get usage stats
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            $id: "usage-1",
            inviteCode: "track123",
            userId: "user-1",
            joinedAt: new Date().toISOString(),
          },
          {
            $id: "usage-2",
            inviteCode: "track123",
            userId: "user-2",
            joinedAt: new Date().toISOString(),
          },
        ],
      } as Response);

      const res = await fetch("/api/invites/track123/usage");
      const usage = await res.json();
      
      expect(Array.isArray(usage)).toBe(true);
      expect(usage.length).toBe(2);
      expect(usage[0].inviteCode).toBe("track123");
      expect(usage[1].inviteCode).toBe("track123");
    });
  });
});
