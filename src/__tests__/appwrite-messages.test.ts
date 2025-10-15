import { describe, expect, it } from "vitest";

describe("Appwrite Messages", () => {
  it("should have message functions", async () => {
    (process.env as Record<string, string>).APPWRITE_ENDPOINT =
      "http://localhost";
    (process.env as Record<string, string>).APPWRITE_PROJECT_ID =
      "proj";
    (
      process.env as Record<string, string>
    ).APPWRITE_MESSAGES_COLLECTION_ID = "messages";
    (process.env as Record<string, string>).APPWRITE_DATABASE_ID =
      "main";
    const mod = await import("../lib/appwrite-messages");
    expect(typeof mod.listMessages).toBe("function");
    expect(typeof mod.sendMessage).toBe("function");
  });
});
