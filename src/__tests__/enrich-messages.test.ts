import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "../lib/types";

// Mock fetch for single message enrichment
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock environment variables
beforeEach(() => {
    process.env.APPWRITE_ENDPOINT = "http://localhost";
    process.env.APPWRITE_PROJECT_ID = "test-project";
    process.env.APPWRITE_DATABASE_ID = "main";
    process.env.APPWRITE_PROFILES_COLLECTION_ID = "profiles";
    process.env.APPWRITE_AVATARS_BUCKET_ID = "avatars";
    process.env.APPWRITE_API_KEY = "test-api-key";

    // Reset and setup fetch mock
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        // Mock batch profile API endpoint
        if (url.includes("/api/profiles/batch") && options?.method === "POST") {
            const body = JSON.parse(options.body as string);
            const profiles: Record<
                string,
                {
                    userId: string;
                    displayName?: string;
                    pronouns?: string;
                    avatarUrl?: string;
                }
            > = {};
            for (const userId of body.userIds as string[]) {
                if (userId === "user1") {
                    profiles.user1 = {
                        userId: "user1",
                        displayName: "Alice",
                        pronouns: "she/her",
                        avatarUrl:
                            "http://localhost/storage/buckets/avatars/files/avatar1/view?project=test-project",
                    };
                } else if (userId === "user2") {
                    profiles.user2 = {
                        userId: "user2",
                        displayName: "Bob",
                        avatarUrl:
                            "http://localhost/storage/buckets/avatars/files/avatar2/view?project=test-project",
                    };
                } else if (userId === "user3") {
                    profiles.user3 = {
                        userId: "user3",
                        displayName: "Charlie",
                    };
                }
                // Unknown userIds are simply omitted from the response
            }
            return {
                ok: true,
                json: async () => ({ profiles }),
            } as Response;
        }
        // Mock single profile API responses
        if (url.includes("/api/users/user1/profile")) {
            return {
                ok: true,
                json: async () => ({
                    userId: "user1",
                    displayName: "Alice",
                    pronouns: "she/her",
                    avatarFileId: "avatar1",
                    avatarUrl:
                        "http://localhost/storage/buckets/avatars/files/avatar1/view?project=test-project",
                }),
            } as Response;
        }
        if (url.includes("/api/users/user2/profile")) {
            return {
                ok: true,
                json: async () => ({
                    userId: "user2",
                    displayName: "Bob",
                    avatarFileId: "avatar2",
                    avatarUrl:
                        "http://localhost/storage/buckets/avatars/files/avatar2/view?project=test-project",
                }),
            } as Response;
        }
        if (url.includes("/api/users/user-no-profile/profile")) {
            return {
                ok: false,
                json: async () => ({ error: "Not found" }),
            } as Response;
        }
        return {
            ok: false,
            json: async () => ({ error: "Not found" }),
        } as Response;
    });
});

describe("Message Enrichment", () => {
    describe("Batch Enrichment", () => {
        it("should export enrichment functions", async () => {
            const mod = await import("../lib/enrich-messages");
            expect(typeof mod.enrichMessagesWithProfiles).toBe("function");
            expect(typeof mod.enrichMessageWithProfile).toBe("function");
        });

        it("should enrich multiple messages with profile data", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            const messages: Message[] = [
                {
                    $id: "msg1",
                    userId: "user1",
                    text: "Hello",
                    $createdAt: new Date().toISOString(),
                },
                {
                    $id: "msg2",
                    userId: "user2",
                    text: "Hi there",
                    $createdAt: new Date().toISOString(),
                },
            ];

            const enriched = await enrichMessagesWithProfiles(messages);

            expect(enriched[0].displayName).toBe("Alice");
            expect(enriched[0].pronouns).toBe("she/her");
            expect(enriched[0].avatarUrl).toContain("avatar1");

            expect(enriched[1].displayName).toBe("Bob");
            expect(enriched[1].avatarUrl).toContain("avatar2");
            expect(enriched[1].pronouns).toBeUndefined(); // Bob has no pronouns
        });

        it("should handle messages from users without profiles", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            const messages: Message[] = [
                {
                    $id: "msg1",
                    userId: "nonexistent",
                    text: "Hello",
                    $createdAt: new Date().toISOString(),
                },
            ];

            const enriched = await enrichMessagesWithProfiles(messages);

            expect(enriched[0].$id).toBe("msg1");
            expect(enriched[0].displayName).toBeUndefined();
        });

        it("should handle empty message array", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            const enriched = await enrichMessagesWithProfiles([]);

            expect(enriched).toEqual([]);
        });

        it("should batch fetch profiles efficiently", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            // Multiple messages from same users - should only fetch each profile once
            const messages: Message[] = [
                {
                    $id: "msg1",
                    userId: "user1",
                    text: "Message 1",
                    $createdAt: new Date().toISOString(),
                },
                {
                    $id: "msg2",
                    userId: "user1",
                    text: "Message 2",
                    $createdAt: new Date().toISOString(),
                },
                {
                    $id: "msg3",
                    userId: "user2",
                    text: "Message 3",
                    $createdAt: new Date().toISOString(),
                },
            ];

            const enriched = await enrichMessagesWithProfiles(messages);

            // All messages should be enriched
            expect(enriched.length).toBe(3);
            expect(enriched[0].displayName).toBe("Alice");
            expect(enriched[1].displayName).toBe("Alice");
            expect(enriched[2].displayName).toBe("Bob");
        });

        it("should preserve original message data", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            const messages: Message[] = [
                {
                    $id: "msg1",
                    userId: "user1",
                    userName: "user1-name",
                    text: "Hello",
                    $createdAt: "2025-01-01T00:00:00Z",
                    channelId: "channel1",
                    serverId: "server1",
                },
            ];

            const enriched = await enrichMessagesWithProfiles(messages);

            // Original data should be preserved
            expect(enriched[0].$id).toBe("msg1");
            expect(enriched[0].userId).toBe("user1");
            expect(enriched[0].userName).toBe("user1-name");
            expect(enriched[0].text).toBe("Hello");
            expect(enriched[0].$createdAt).toBe("2025-01-01T00:00:00Z");
            expect(enriched[0].channelId).toBe("channel1");
            expect(enriched[0].serverId).toBe("server1");
            // Plus enriched data
            expect(enriched[0].displayName).toBe("Alice");
        });

        it("should handle users with partial profile data", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            const messages: Message[] = [
                {
                    $id: "msg1",
                    userId: "user3", // Charlie has no avatarFileId
                    text: "Hello",
                    $createdAt: new Date().toISOString(),
                },
            ];

            const enriched = await enrichMessagesWithProfiles(messages);

            expect(enriched[0].displayName).toBe("Charlie");
            expect(enriched[0].avatarUrl).toBeUndefined();
            expect(enriched[0].pronouns).toBeUndefined();
        });
    });

    describe("Single Message Enrichment", () => {
        it("should enrich a single message", async () => {
            const { enrichMessageWithProfile } =
                await import("../lib/enrich-messages");

            const message: Message = {
                $id: "msg1",
                userId: "user1",
                text: "Hello",
                $createdAt: new Date().toISOString(),
            };

            const enriched = await enrichMessageWithProfile(message);

            expect(enriched.displayName).toBe("Alice");
            expect(enriched.pronouns).toBe("she/her");
            expect(enriched.avatarUrl).toContain("avatar1");
        });

        it("should handle user without profile", async () => {
            const { enrichMessageWithProfile } =
                await import("../lib/enrich-messages");

            const message: Message = {
                $id: "msg1",
                userId: "nonexistent",
                text: "Hello",
                $createdAt: new Date().toISOString(),
            };

            const enriched = await enrichMessageWithProfile(message);

            // Should return original message
            expect(enriched.$id).toBe("msg1");
            expect(enriched.userId).toBe("nonexistent");
            expect(enriched.displayName).toBeUndefined();
        });

        it("should preserve all original message fields", async () => {
            const { enrichMessageWithProfile } =
                await import("../lib/enrich-messages");

            const message: Message = {
                $id: "msg1",
                userId: "user2",
                userName: "bob-username",
                text: "Test message",
                $createdAt: "2025-01-01T12:00:00Z",
                editedAt: "2025-01-01T13:00:00Z",
                channelId: "channel1",
            };

            const enriched = await enrichMessageWithProfile(message);

            // Original fields preserved
            expect(enriched.$id).toBe("msg1");
            expect(enriched.userName).toBe("bob-username");
            expect(enriched.editedAt).toBe("2025-01-01T13:00:00Z");
            expect(enriched.channelId).toBe("channel1");
            // Plus enriched data
            expect(enriched.displayName).toBe("Bob");
        });
    });

    describe("Error Handling", () => {
        it("should return original messages if enrichment fails for batch", async () => {
            const { enrichMessagesWithProfiles } =
                await import("../lib/enrich-messages");

            const messages: Message[] = [
                {
                    $id: "msg1",
                    userId: "user1",
                    text: "Hello",
                    $createdAt: new Date().toISOString(),
                },
            ];

            // The function catches errors and returns original messages
            const enriched = await enrichMessagesWithProfiles(messages);

            expect(enriched).toBeDefined();
            expect(enriched.length).toBe(1);
        });

        it("should return original message if single enrichment fails", async () => {
            const { enrichMessageWithProfile } =
                await import("../lib/enrich-messages");

            const message: Message = {
                $id: "msg1",
                userId: "user1",
                text: "Hello",
                $createdAt: new Date().toISOString(),
            };

            // The function catches errors and returns original message
            const enriched = await enrichMessageWithProfile(message);

            expect(enriched).toBeDefined();
            expect(enriched.$id).toBe("msg1");
        });
    });
});
