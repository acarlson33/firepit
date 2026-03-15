import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModerationMessageList } from "@/app/moderation/ModerationMessageList";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        refresh: mockRefresh,
    }),
}));

vi.mock("@/lib/appwrite-core", () => ({
    getBrowserClient: () => ({
        subscribe: () => vi.fn(),
    }),
}));

vi.mock("@/hooks/useCustomEmojis", () => ({
    useCustomEmojis: () => ({
        customEmojis: [],
    }),
}));

vi.mock("@/components/message-with-mentions", () => ({
    MessageWithMentions: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("@/components/image-with-skeleton", () => ({
    ImageWithSkeleton: ({ alt, src }: { alt: string; src: string }) => (
        <img alt={alt} src={src} />
    ),
}));

vi.mock("@/app/moderation/actions", () => ({
    actionHardDeleteBound: vi.fn(),
    actionRestoreBound: vi.fn(),
    actionSoftDeleteBound: vi.fn(),
}));

describe("ModerationMessageList", () => {
    it("renders uploaded message images and image attachments in the moderation panel", () => {
        render(
            <ModerationMessageList
                badgeMap={{}}
                initialMessages={[
                    {
                        $id: "msg-1",
                        attachments: [
                            {
                                fileId: "attachment-1",
                                fileName: "attachment-image.png",
                                fileSize: 1024,
                                fileType: "image/png",
                                fileUrl:
                                    "https://example.com/attachment-image.png",
                            },
                            {
                                fileId: "attachment-2",
                                fileName: "notes.pdf",
                                fileSize: 2048,
                                fileType: "application/pdf",
                                fileUrl: "https://example.com/notes.pdf",
                            },
                        ],
                        channelDisplay: "general",
                        channelId: "channel-1",
                        imageUrl: "https://example.com/image.png",
                        senderDisplay: "User One",
                        serverDisplay: "Firepit HQ",
                        serverId: "server-1",
                        text: "",
                        userId: "user-1",
                    },
                ]}
                isAdmin={false}
            />,
        );

        const image = screen.getByRole("img", {
            name: "Moderation preview for message msg-1",
        });

        expect(image).toHaveAttribute("src", "https://example.com/image.png");
        expect(
            screen.getByRole("link", {
                name: "Moderation preview for message msg-1",
            }),
        ).toHaveAttribute("href", "https://example.com/image.png");

        const attachmentImage = screen.getByRole("img", {
            name: "Moderation attachment preview for attachment-image.png",
        });

        expect(attachmentImage).toHaveAttribute(
            "src",
            "https://example.com/attachment-image.png",
        );
        expect(
            screen.getByRole("link", {
                name: "Moderation attachment preview for attachment-image.png",
            }),
        ).toHaveAttribute("href", "https://example.com/attachment-image.png");
        expect(
            screen.queryByRole("img", {
                name: "Moderation attachment preview for notes.pdf",
            }),
        ).not.toBeInTheDocument();
    });
});
