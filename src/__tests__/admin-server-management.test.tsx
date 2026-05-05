import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServerManagement } from "@/app/admin/server-management";

const {
    mockCreateChannelAction,
    mockCreateServerAction,
    mockDeleteChannelAction,
    mockDeleteServerAction,
    mockListChannelsAction,
    mockListServersAction,
} = vi.hoisted(() => ({
    mockCreateChannelAction: vi.fn(),
    mockCreateServerAction: vi.fn(),
    mockDeleteChannelAction: vi.fn(),
    mockDeleteServerAction: vi.fn(),
    mockListChannelsAction: vi.fn(),
    mockListServersAction: vi.fn(),
}));

vi.mock("@/app/admin/server-actions", () => ({
    createChannelAction: (...args: unknown[]) =>
        mockCreateChannelAction(...args),
    createServerAction: (...args: unknown[]) => mockCreateServerAction(...args),
    deleteChannelAction: (...args: unknown[]) =>
        mockDeleteChannelAction(...args),
    deleteServerAction: (...args: unknown[]) => mockDeleteServerAction(...args),
    listChannelsAction: (...args: unknown[]) => mockListChannelsAction(...args),
    listServersAction: (...args: unknown[]) => mockListServersAction(...args),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

describe("ServerManagement", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockListServersAction.mockResolvedValue({
            servers: [
                {
                    $id: "server-1",
                    createdAt: "2026-03-10T12:00:00.000Z",
                    name: "Firepit HQ",
                    ownerId: "user-1",
                },
            ],
        });
        mockListChannelsAction.mockResolvedValue({
            channels: [
                {
                    $id: "channel-voice",
                    createdAt: "2026-03-10T12:00:00.000Z",
                    name: "voice-lounge",
                    serverId: "server-1",
                    type: "voice",
                },
            ],
        });
        mockCreateChannelAction.mockResolvedValue({
            success: true,
            channelId: "channel-announcements",
            channelName: "announcements",
            channelType: "announcement",
        });
        mockCreateServerAction.mockResolvedValue({
            success: true,
            serverId: "server-2",
            serverName: "New Server",
        });
        mockDeleteChannelAction.mockResolvedValue({ success: true });
        mockDeleteServerAction.mockResolvedValue({ success: true });
    });

    it("hides voice in channel type selection", async () => {
        render(<ServerManagement isAdmin={true} isModerator={true} />);

        const typeSelect = await screen.findByLabelText("Channel Type");
        const typeOptions = Array.from(typeSelect.querySelectorAll("option"));
        const optionValues = typeOptions.map((option) => option.value);

        expect(optionValues).toContain("text");
        expect(optionValues).toContain("announcement");
        expect(optionValues).not.toContain("voice");
    });

    it("creates channels with announcement type from admin UI", async () => {
        const user = userEvent.setup();

        render(<ServerManagement isAdmin={true} isModerator={true} />);

        const channelNameInput = await screen.findByLabelText("Channel Name");
        const typeSelect = await screen.findByLabelText("Channel Type");

        await user.type(channelNameInput, "announcements");
        await user.selectOptions(typeSelect, "announcement");
        await user.click(
            screen.getByRole("button", {
                name: "Create Channel",
            }),
        );

        await waitFor(() => {
            expect(mockCreateChannelAction).toHaveBeenCalledWith(
                "server-1",
                "announcements",
                "announcement",
            );
        });
    });
});
