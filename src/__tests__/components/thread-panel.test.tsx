import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThreadPanel } from "../../components/thread-panel";
import type { Message } from "../../lib/types";

const parentMessage: Message = {
  $id: "parent-1",
  $createdAt: new Date().toISOString(),
  channelId: "channel-1",
  serverId: "server-1",
  userId: "user-1",
  userName: "Parent",
  text: "Parent text",
};

describe("ThreadPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads replies when opened", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ replies: [{ $id: "r1", text: "Hi", $createdAt: new Date().toISOString(), userId: "u2", userName: "User" }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <ThreadPanel
        open
        onOpenChange={() => {}}
        parentMessage={parentMessage}
        userId="user-2"
      />
    );

    await waitFor(() => expect(screen.getByText("Hi")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledWith("/api/messages/parent-1/thread");
  });

  it("sends a reply and appends to list", async () => {
    const repliesResponse = {
      ok: true,
      json: async () => ({ replies: [] }),
    } as const;
    const postResponse = {
      ok: true,
      json: async () => ({ reply: { $id: "r2", text: "New reply", $createdAt: new Date().toISOString(), userId: "user-2", userName: "User" } }),
    } as const;

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(repliesResponse)
      .mockResolvedValueOnce(postResponse);
    vi.stubGlobal("fetch", mockFetch);

    const user = userEvent.setup();

    render(
      <ThreadPanel
        open
        onOpenChange={() => {}}
        parentMessage={parentMessage}
        userId="user-2"
      />
    );

    const input = await screen.findByPlaceholderText("Reply to thread...");
    await user.type(input, "New reply");
    await user.click(screen.getByRole("button", { name: "Send reply" }));

    await waitFor(() => expect(screen.getByText("New reply")).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
