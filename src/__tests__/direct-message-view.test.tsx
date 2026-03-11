/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DirectMessageView } from "@/app/chat/components/DirectMessageView";
import type { ChatSurfaceMessage } from "@/lib/chat-surface";
import type { Conversation, DirectMessage } from "@/lib/types";

const { mockJumpToMessage } = vi.hoisted(() => ({
    mockJumpToMessage: vi.fn(),
}));

const { mockChatSurfacePanel } = vi.hoisted(() => ({
    mockChatSurfacePanel: vi.fn(),
}));

vi.mock("@/lib/message-navigation", () => ({
    jumpToMessage: (...args: unknown[]) => mockJumpToMessage(...args),
}));

vi.mock("@/hooks/useCustomEmojis", () => ({
    useCustomEmojis: () => ({
        customEmojis: [],
        uploadEmoji: vi.fn(),
    }),
}));

vi.mock("@/app/chat/hooks/useChatSurfaceController", () => ({
    useChatSurfaceController: () => ({
        handleDeleteSurfaceMessage: vi.fn(),
        handleStartEditSurfaceMessage: vi.fn(),
        handleStartReplySurfaceMessage: vi.fn(),
        onToggleReaction: vi.fn(),
    }),
}));

vi.mock("@/lib/appwrite-dms-client", () => ({
    uploadImage: vi.fn(),
}));

vi.mock("@/lib/reactions-client", () => ({
    toggleReaction: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock("@/components/chat-surface-panel", () => ({
    ChatSurfacePanel: (props: Record<string, unknown>) => {
        mockChatSurfacePanel(props);
        return <div>chat-surface-panel</div>;
    },
}));

vi.mock("@/components/chat-thread-content", () => ({
    ChatThreadContent: () => <div>chat-thread-content</div>,
}));

vi.mock("@/components/image-viewer", () => ({
    ImageViewer: () => null,
}));

vi.mock("@/components/mention-help-tooltip", () => ({
    MentionHelpTooltip: () => <div>mention-help-tooltip</div>,
}));

describe("DirectMessageView", () => {
    it("keeps DM virtualization aligned with the shared surface threshold", () => {
        const conversation: Conversation = {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conversation-1",
            otherUser: {
                displayName: "User Two",
                userId: "user-2",
            },
            participantCount: 2,
            participants: ["user-1", "user-2"],
        };

        render(
            <DirectMessageView
                conversation={conversation}
                currentUserId="user-1"
                loading={false}
                messages={[]}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onSend={vi.fn()}
                sending={false}
                surfaceMessages={[]}
            />,
        );

        expect(mockChatSurfacePanel).toHaveBeenCalledWith(
            expect.objectContaining({ virtualizationThreshold: 20 }),
        );
    });

    it("uses the shared jump helper for pinned DM messages", async () => {
        const user = userEvent.setup();
        const conversation: Conversation = {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "conversation-1",
            otherUser: {
                displayName: "User Two",
                userId: "user-2",
            },
            participantCount: 2,
            participants: ["user-1", "user-2"],
        };
        const pinnedMessage: DirectMessage = {
            $createdAt: "2026-03-10T12:00:00.000Z",
            $id: "dm-1",
            conversationId: "conversation-1",
            senderDisplayName: "User Two",
            senderId: "user-2",
            text: "Pinned DM",
        };
        const surfaceMessages: ChatSurfaceMessage[] = [
            {
                authorId: "user-2",
                authorLabel: "User Two",
                context: { conversationId: "conversation-1", kind: "dm" },
                createdAt: "2026-03-10T12:00:00.000Z",
                id: "dm-1",
                sourceMessageId: "dm-1",
                sourceType: "dm",
                text: "Pinned DM",
            },
        ];

        render(
            <DirectMessageView
                conversation={conversation}
                currentUserId="user-1"
                loading={false}
                messages={[pinnedMessage]}
                onDelete={vi.fn()}
                onEdit={vi.fn()}
                onSend={vi.fn()}
                pinnedMessages={[pinnedMessage]}
                sending={false}
                surfaceMessages={surfaceMessages}
            />,
        );

        await user.click(
            screen.getByRole("button", { name: "Jump to message" }),
        );

        expect(mockJumpToMessage).toHaveBeenCalledWith("dm-1");
    });
});
