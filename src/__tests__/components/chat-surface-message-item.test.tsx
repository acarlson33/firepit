/// <reference lib="dom" />

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatSurfaceMessageItem } from "@/components/chat-surface-message-item";
import type { ChatSurfaceMessage } from "@/lib/chat-surface";

vi.mock("@/components/file-attachment-display", () => ({
    FileAttachmentDisplay: () => null,
}));

vi.mock("@/components/message-with-mentions", () => ({
    MessageWithMentions: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock("@/components/reaction-button", () => ({
    ReactionButton: () => null,
}));

vi.mock("@/components/reaction-picker", () => ({
    ReactionPicker: () => null,
}));

vi.mock("@/components/thread-indicator", () => ({
    ThreadIndicator: () => null,
}));

vi.mock("@/components/ui/avatar", () => ({
    Avatar: () => <div>avatar</div>,
}));

const baseMessage: ChatSurfaceMessage = {
    authorId: "user-1",
    authorLabel: "User One",
    context: { conversationId: "conversation-1", kind: "dm" },
    createdAt: "2026-03-10T12:00:00.000Z",
    id: "message-1",
    sourceMessageId: "message-1",
    sourceType: "dm",
    text: "https://example.com/this/is/a/very/long/legacy/message/without/any/spaces/that/should/still/wrap/properly",
};

describe("ChatSurfaceMessageItem", () => {
    it("applies defensive wrapping utilities to message content", () => {
        const { container } = render(
            <ChatSurfaceMessageItem
                currentUserId="user-2"
                deleteConfirmId={null}
                editingMessageId={null}
                message={baseMessage}
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
            />,
        );

        expect(screen.getByText(baseMessage.text)).toBeInTheDocument();
        expect(container.innerHTML).toContain("whitespace-pre-wrap");
        expect(container.innerHTML).toContain("wrap-anywhere");
    });
});
