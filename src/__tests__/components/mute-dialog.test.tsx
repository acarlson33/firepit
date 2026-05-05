/// <reference lib="dom" />

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { MuteDialog } from "@/components/mute-dialog";

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
    },
}));

describe("MuteDialog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({}),
            }),
        );
    });

    it("prefills from an existing override and shows channel precedence guidance", async () => {
        render(
            <MuteDialog
                open
                onOpenChange={vi.fn()}
                targetType="channel"
                targetId="channel-1"
                targetName="#general"
                initialOverride={{ level: "mentions" }}
            />,
        );

        expect(
            screen.getByText(
                "Channel overrides are the most specific setting in servers, so they beat both server and global notification defaults.",
            ),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Mute" }));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                "/api/channels/channel-1/mute",
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({
                        muted: true,
                        duration: "forever",
                        level: "mentions",
                    }),
                }),
            );
        });

        expect(mockToastSuccess).toHaveBeenCalledWith("Muted #general");
    });
});
