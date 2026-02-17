import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PinnedMessagesPanel } from "../../components/pinned-messages-panel";
import type { Message } from "../../lib/types";

const pinnedMessage: Message = {
  $id: "pin-1",
  $createdAt: new Date().toISOString(),
  channelId: "channel-1",
  serverId: "server-1",
  userId: "user-1",
  userName: "User",
  text: "Pinned",
  isPinned: true,
};

describe("PinnedMessagesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads pins when opened", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pins: [pinnedMessage] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    render(
      <PinnedMessagesPanel
        open
        channelId="channel-1"
        channelName="general"
        onOpenChange={() => {}}
      />
    );

    await waitFor(() => expect(screen.getAllByText("Pinned").length).toBeGreaterThan(0));
    expect(mockFetch).toHaveBeenCalledWith("/api/channels/channel-1/pins");
  });

  it("calls unpin handler and removes message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pins: [pinnedMessage] }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const onUnpin = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <PinnedMessagesPanel
        open
        channelId="channel-1"
        channelName="general"
        onOpenChange={() => {}}
        onUnpin={onUnpin}
        canManageMessages
      />
    );

    const unpinButton = await screen.findByTitle("Unpin message");
    await user.click(unpinButton);

    expect(onUnpin).toHaveBeenCalledWith("pin-1");
    await waitFor(() => expect(screen.queryByText("Pinned")).not.toBeInTheDocument());
  });
});
