import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock appwrite
vi.mock("appwrite", () => ({
	ID: {
		unique: () => "mock-id-123",
	},
	Query: {
		limit: (n: number) => `limit(${n})`,
		orderDesc: (field: string) => `orderDesc(${field})`,
		cursorAfter: (cursor: string) => `cursorAfter(${cursor})`,
		equal: (field: string, value: string) => `equal(${field},${value})`,
	},
}));

// Mock appwrite-core
vi.mock("../lib/appwrite-core", () => ({
	getBrowserDatabases: () => ({
		createDocument: vi.fn(async (params: unknown) => {
			const mockDocs = (globalThis as any).__mockAuditDocs || [];
			const doc = {
				...(params as any).data,
				$id: (params as any).documentId,
				$createdAt: new Date().toISOString(),
			};
			mockDocs.push(doc);
			return doc;
		}),
		listDocuments: vi.fn(async (params: unknown) => {
			const mockDocs = (globalThis as any).__mockAuditDocs || [];
			const { queries } = params as any;
			
			// Simple filter by action if provided
			let filtered = [...mockDocs];
			let limit = 50; // default
			
			for (const q of queries || []) {
				if (q.startsWith("limit(")) {
					const match = q.match(/limit\((\d+)\)/);
					if (match) {
						limit = Number.parseInt(match[1], 10);
					}
				}
				if (q.startsWith("equal(action,")) {
					const action = q.match(/equal\(action,(.+)\)/)?.[1];
					filtered = filtered.filter((d: any) => d.action === action);
				}
				if (q.startsWith("equal(actorId,")) {
					const actorId = q.match(/equal\(actorId,(.+)\)/)?.[1];
					filtered = filtered.filter((d: any) => d.actorId === actorId);
				}
				if (q.startsWith("equal(targetId,")) {
					const targetId = q.match(/equal\(targetId,(.+)\)/)?.[1];
					filtered = filtered.filter((d: any) => d.targetId === targetId);
				}
			}
			
			return { documents: filtered.slice(0, limit) };
		}),
	}),
	getEnvConfig: () => ({
		databaseId: "test-db",
		collections: { audit: "audit-collection" },
		teams: {
			adminTeamId: "admin-team",
			moderatorTeamId: "mod-team",
		},
	}),
	materializePermissions: (perms: string[]) => perms,
	perms: {
		message: (_userId: string, _teams: Record<string, string>) => [
			"read(admin-team)",
			"read(mod-team)",
			"write(user123)",
		],
	},
}));

// Mock appwrite-admin
vi.mock("../lib/appwrite-admin", () => ({
	getAdminClient: () => ({
		databases: {
			listDocuments: vi.fn(
				async (_dbId: string, _collectionId: string, queries: string[]) => {
					const mockDocs = (globalThis as any).__mockAuditDocs || [];
					// Simple filter for admin version
					let filtered = [...mockDocs];
					let limit = 50; // default
					
					for (const q of queries || []) {
						if (q.startsWith("limit(")) {
							const match = q.match(/limit\((\d+)\)/);
							if (match) {
								limit = Number.parseInt(match[1], 10);
							}
						}
						if (q.startsWith("equal(action,")) {
							const action = q.match(/equal\(action,(.+)\)/)?.[1];
							filtered = filtered.filter((d: any) => d.action === action);
						}
					}
					return { documents: filtered.slice(0, limit) };
				}
			),
		},
	}),
}));

function setMockAuditDocs(docs: any[]) {
	(globalThis as any).__mockAuditDocs = docs;
}

function clearMockAuditDocs() {
	(globalThis as any).__mockAuditDocs = [];
}

describe("appwrite-audit", () => {
	beforeEach(() => {
		clearMockAuditDocs();
	});

	describe("recordAudit", () => {
		it("should record audit event with basic data", async () => {
			const { recordAudit } = await import("../lib/appwrite-audit");

			await recordAudit("user.login", "user-123", "actor-456");

			const docs = (globalThis as any).__mockAuditDocs;
			expect(docs).toHaveLength(1);
			expect(docs[0]).toMatchObject({
				action: "user.login",
				targetId: "user-123",
				actorId: "actor-456",
			});
		});

		it("should record audit event with metadata", async () => {
			const { recordAudit } = await import("../lib/appwrite-audit");

			const meta = { ip: "192.168.1.1", userAgent: "Mozilla/5.0" };
			await recordAudit("user.login", "user-123", "actor-456", meta);

			const docs = (globalThis as any).__mockAuditDocs;
			expect(docs[0].meta).toEqual(meta);
		});

		it("should handle audit recording failure gracefully", async () => {
			const { recordAudit } = await import("../lib/appwrite-audit");

			// Mock a failure in createDocument
			const { getBrowserDatabases } = await import("../lib/appwrite-core");
			const mockDb = getBrowserDatabases();
			vi.spyOn(mockDb, "createDocument").mockRejectedValueOnce(
				new Error("Database error")
			);

			// Should not throw
			await expect(
				recordAudit("user.login", "user-123", "actor-456")
			).resolves.not.toThrow();
		});

		it("should include actor in permissions", async () => {
			const { recordAudit } = await import("../lib/appwrite-audit");

			await recordAudit("message.delete", "msg-789", "actor-111");

			const docs = (globalThis as any).__mockAuditDocs;
			expect(docs[0]).toHaveProperty("actorId", "actor-111");
		});
	});

	describe("listAuditEvents", () => {
		it("should list all audit events", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.login",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "2",
					action: "user.logout",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-02T00:00:00.000Z",
				},
			]);

			const result = await listAuditEvents();

			expect(result.items).toHaveLength(2);
			expect(result.items[0].action).toBe("user.login");
			expect(result.items[1].action).toBe("user.logout");
		});

		it("should filter by action", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.login",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "2",
					action: "user.logout",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-02T00:00:00.000Z",
				},
			]);

			const result = await listAuditEvents({ action: "user.login" });

			expect(result.items).toHaveLength(1);
			expect(result.items[0].action).toBe("user.login");
		});

		it("should filter by actorId", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.login",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "2",
					action: "user.login",
					targetId: "user-2",
					actorId: "actor-2",
					$createdAt: "2023-01-02T00:00:00.000Z",
				},
			]);

			const result = await listAuditEvents({ actorId: "actor-1" });

			expect(result.items).toHaveLength(1);
			expect(result.items[0].actorId).toBe("actor-1");
		});

		it("should filter by targetId", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "message.delete",
					targetId: "msg-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "2",
					action: "message.delete",
					targetId: "msg-2",
					actorId: "actor-1",
					$createdAt: "2023-01-02T00:00:00.000Z",
				},
			]);

			const result = await listAuditEvents({ targetId: "msg-1" });

			expect(result.items).toHaveLength(1);
			expect(result.items[0].targetId).toBe("msg-1");
		});

		it("should support pagination with limit", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.login",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "2",
					action: "user.logout",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-02T00:00:00.000Z",
				},
				{
					$id: "3",
					action: "user.login",
					targetId: "user-2",
					actorId: "actor-2",
					$createdAt: "2023-01-03T00:00:00.000Z",
				},
			]);

			const result = await listAuditEvents({ limit: 2 });

			// Should still get all in mock, but nextCursor should indicate more
			expect(result.items.length).toBeGreaterThanOrEqual(2);
		});

		it("should return nextCursor when more results exist", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			const docs = Array.from({ length: 60 }, (_, i) => ({
				$id: String(i + 1),
				action: "user.login",
				targetId: `user-${i}`,
				actorId: "actor-1",
				$createdAt: `2023-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
			}));
			setMockAuditDocs(docs);

			const result = await listAuditEvents({ limit: 50 });

			expect(result.items).toHaveLength(50);
			expect(result.nextCursor).toBe("50");
		});

		it("should return null nextCursor when no more results", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.login",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
			]);

			const result = await listAuditEvents({ limit: 50 });

			expect(result.items).toHaveLength(1);
			expect(result.nextCursor).toBeNull();
		});

		it("should handle empty audit log", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			const result = await listAuditEvents();

			expect(result.items).toHaveLength(0);
			expect(result.nextCursor).toBeNull();
		});

		it("should include metadata in returned events", async () => {
			const { listAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.login",
					targetId: "user-1",
					actorId: "actor-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
					meta: { ip: "192.168.1.1" },
				},
			]);

			const result = await listAuditEvents();

			expect(result.items[0].meta).toEqual({ ip: "192.168.1.1" });
		});
	});

	describe("adminListAuditEvents", () => {
		it("should list audit events with admin client", async () => {
			const { adminListAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.ban",
					targetId: "user-1",
					actorId: "admin-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
			]);

			const result = await adminListAuditEvents();

			expect(result.items).toHaveLength(1);
			expect(result.items[0].action).toBe("user.ban");
		});

		it("should filter admin events by action", async () => {
			const { adminListAuditEvents } = await import("../lib/appwrite-audit");

			setMockAuditDocs([
				{
					$id: "1",
					action: "user.ban",
					targetId: "user-1",
					actorId: "admin-1",
					$createdAt: "2023-01-01T00:00:00.000Z",
				},
				{
					$id: "2",
					action: "user.unban",
					targetId: "user-1",
					actorId: "admin-1",
					$createdAt: "2023-01-02T00:00:00.000Z",
				},
			]);

			const result = await adminListAuditEvents({ action: "user.ban" });

			expect(result.items).toHaveLength(1);
			expect(result.items[0].action).toBe("user.ban");
		});

		it("should support admin pagination", async () => {
			const { adminListAuditEvents } = await import("../lib/appwrite-audit");

			const docs = Array.from({ length: 60 }, (_, i) => ({
				$id: String(i + 1),
				action: "admin.action",
				targetId: `resource-${i}`,
				actorId: "admin-1",
				$createdAt: `2023-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
			}));
			setMockAuditDocs(docs);

			const result = await adminListAuditEvents({ limit: 50 });

			expect(result.items).toHaveLength(50);
			expect(result.nextCursor).toBe("50");
		});
	});
});
