import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { DirectMessageView } from "@/app/chat/components/DirectMessageView";

vi.mock("@/components/image-viewer", () => ({
    ImageViewer: () => null,
}));

vi.mock("@/components/image-with-skeleton", () => ({
    ImageWithSkeleton: () => null,
}));

vi.mock("@/components/emoji-picker", () => ({
    EmojiPicker: () => <div>emoji-picker</div>,
}));

vi.mock("@/components/chat-input", () => ({
    ChatInput: (props: Record<string, unknown>) => (
        <input
            aria-label={String(props["aria-label"] ?? "Message")}
            disabled={Boolean(props.disabled)}
            placeholder={String(props.placeholder ?? "")}
            value={String(props.value ?? "")}
            readOnly
        />
    ),
}));

vi.mock("@/hooks/useCustomEmojis", () => ({
    useCustomEmojis: () => ({
        customEmojis: [],
        uploadEmoji: vi.fn(),
    }),
}));

vi.mock("@/components/reaction-button", () => ({
    ReactionButton: () => null,
}));

vi.mock("@/components/reaction-picker", () => ({
    ReactionPicker: () => null,
}));

vi.mock("@/components/message-with-mentions", () => ({
    MessageWithMentions: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("@/components/mention-help-tooltip", () => ({
    MentionHelpTooltip: () => null,
}));

vi.mock("@/components/file-upload-button", () => ({
    FileUploadButton: (props: Record<string, unknown>) => (
        <button disabled={Boolean(props.disabled)} type="button">
            file-upload
        </button>
    ),
    FilePreview: () => null,
}));

vi.mock("@/components/file-attachment-display", () => ({
    FileAttachmentDisplay: () => null,
}));

vi.mock("@/components/virtualized-dm-list", () => ({
    VirtualizedDMList: () => null,
}));

describe("DirectMessageView", () => {
    it("shows a read-only banner and disables composer controls", () => {
        const { container } = render(
            <DirectMessageView
                conversation={{
                    $id: "conv-1",
                    participants: ["current-user", "other-user"],
                    $createdAt: new Date().toISOString(),
                    otherUser: {
                        userId: "other-user",
                        displayName: "Other User",
                        status: "online",
                    },
                }}
                currentUserId="current-user"
                loading={false}
                messages={[]}
                surfaceMessages={[]}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onSend={vi.fn()}
                readOnly
                readOnlyReason="This user blocked you"
                sending={false}
            />,
        );

        expect(screen.getByText("Messaging disabled")).toBeInTheDocument();
        expect(screen.getByText("This user blocked you")).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText("This user blocked you"),
        ).toBeDisabled();
        expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

        const scrollContainer = container.querySelector(
            '[data-message-scroll-container="true"]',
        ) as HTMLDivElement | null;
        const computedHeight = scrollContainer
            ? getComputedStyle(scrollContainer).height
            : "";

        expect(scrollContainer).toBeInTheDocument();
        expect(scrollContainer).toHaveClass("w-full", "min-w-0");
        expect(computedHeight).toMatch(/^\d+(\.\d+)?(px|vh|%)$/);
    });
});
