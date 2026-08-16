/// <reference lib="dom" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import type { ChatSurfaceMessage } from "@/lib/chat-surface";

const { mockScrollToIndex } = vi.hoisted(() => ({
    mockScrollToIndex: vi.fn(),
}));

// Mock react-virtuoso since we're just testing the item renderer
vi.mock("react-virtuoso", () => ({
    Virtuoso: React.forwardRef(
        (
            {
                className,
                itemContent,
                data,
                style,
            }: {
                className?: string;
                itemContent: (
                    index: number,
                    item: ChatSurfaceMessage,
                ) => React.ReactNode;
                data: ChatSurfaceMessage[];
                style?: React.CSSProperties;
            },
            ref: React.ForwardedRef<{
                scrollToIndex: typeof mockScrollToIndex;
            }>,
        ) => {
            React.useImperativeHandle(ref, () => ({
                scrollToIndex: mockScrollToIndex,
            }));

            return (
                <div
                    className={className}
                    data-testid="virtuoso-container"
                    style={style}
                >
                    {data.map((item, index) => (
                        <div key={item.id} data-testid={`message-${item.id}`}>
                            {itemContent(index, item)}
                        </div>
                    ))}
                </div>
            );
        },
    ),
}));

describe("VirtualizedMessageList", () => {
    beforeEach(() => {
        mockScrollToIndex.mockClear();
    });

    const mockMessages: ChatSurfaceMessage[] = [
        {
            id: "msg-1",
            sourceType: "channel",
            sourceMessageId: "msg-1",
            context: {
                kind: "channel",
                channelId: "channel-1",
                serverId: "server-1",
            },
            authorId: "user-1",
            authorUserName: "TestUser",
            authorLabel: "TestUser",
            text: "Hello world",
            createdAt: new Date().toISOString(),
            reactions: [],
        },
    ];

    const defaultProps = {
        messages: mockMessages,
        userId: "user-1",
        userIdSlice: 6,
        editingMessageId: null,
        deleteConfirmId: null,
        setDeleteConfirmId: vi.fn(),
        onStartEdit: vi.fn(),
        onStartReply: vi.fn(),
        onRemove: vi.fn(),
        onToggleReaction: vi.fn(),
        onOpenProfileModal: vi.fn(),
        onOpenImageViewer: vi.fn(),
        shouldShowLoadOlder: false,
        onLoadOlder: vi.fn(),
    };

    it("renders thread controls when enabled", async () => {
        const onOpenThread = vi.fn();
        const user = userEvent.setup();
        const threadMessage: ChatSurfaceMessage = {
            ...mockMessages[0],
            id: "thread-parent",
            sourceMessageId: "thread-parent",
            threadReplyCount: 2,
        };

        render(
            <VirtualizedMessageList
                {...defaultProps}
                messages={[threadMessage]}
                onOpenThread={onOpenThread}
            />,
        );

        const threadButton = await screen.findByTitle("Start or view thread");
        await user.click(threadButton);
        expect(onOpenThread).toHaveBeenCalledWith(
            expect.objectContaining({ id: "thread-parent" }),
        );
    });

    it("shows an unread badge on thread indicators with unread replies", async () => {
        const threadMessage: ChatSurfaceMessage = {
            ...mockMessages[0],
            id: "thread-parent-unread",
            sourceMessageId: "thread-parent-unread",
            threadHasUnread: true,
            threadReplyCount: 2,
        };

        render(
            <VirtualizedMessageList
                {...defaultProps}
                messages={[threadMessage]}
                onOpenThread={vi.fn()}
            />,
        );

        expect(await screen.findByText("New")).toBeDefined();
        expect(
            screen.getByLabelText("2 replies, unread updates"),
        ).toBeDefined();
    });

    it("renders pin and unpin buttons when user can manage messages", async () => {
        const onTogglePin = vi.fn();
        const user = userEvent.setup();

        render(
            <VirtualizedMessageList
                {...defaultProps}
                messages={[
                    {
                        ...mockMessages[0],
                        id: "pin-test",
                        sourceMessageId: "pin-test",
                        isPinned: false,
                    },
                ]}
                onTogglePin={onTogglePin}
                canManageMessages
            />,
        );

        const pinButton = await screen.findByTitle("Pin message");
        await user.click(pinButton);
        expect(onTogglePin).toHaveBeenCalledWith(
            expect.objectContaining({ id: "pin-test" }),
        );

        render(
            <VirtualizedMessageList
                {...defaultProps}
                messages={[
                    {
                        ...mockMessages[0],
                        id: "pinned-test",
                        sourceMessageId: "pinned-test",
                        isPinned: true,
                    },
                ]}
                onTogglePin={onTogglePin}
                canManageMessages
            />,
        );

        const unpinButton = await screen.findByTitle("Unpin message");
        await user.click(unpinButton);
        expect(onTogglePin).toHaveBeenCalledWith(
            expect.objectContaining({ id: "pinned-test" }),
        );
    });

    it("should render message list", () => {
        render(<VirtualizedMessageList {...defaultProps} />);

        expect(screen.getByTestId("virtuoso-container")).toBeDefined();
        expect(screen.getByTestId("message-msg-1")).toBeDefined();
    });

    it("keeps the virtualized container pinned to full width", () => {
        render(<VirtualizedMessageList {...defaultProps} />);

        expect(screen.getByTestId("virtuoso-container").className).toContain(
            "w-full",
        );
        expect(screen.getByTestId("virtuoso-container").className).toContain(
            "min-w-0",
        );
        expect(screen.getByTestId("virtuoso-container").style.height).toBe(
            "60vh",
        );
    });

    it("scrolls to the bottom when requested", async () => {
        const { rerender } = render(
            <VirtualizedMessageList
                {...defaultProps}
                scrollToBottomRequest={{ behavior: "auto", id: 1 }}
            />,
        );

        await waitFor(() => {
            expect(mockScrollToIndex).toHaveBeenCalledWith({
                align: "end",
                behavior: "auto",
                index: 0,
            });
        });

        rerender(
            <VirtualizedMessageList
                {...defaultProps}
                messages={[
                    ...mockMessages,
                    {
                        ...mockMessages[0],
                        id: "msg-2",
                        sourceMessageId: "msg-2",
                    },
                ]}
                scrollToBottomRequest={{ behavior: "smooth", id: 2 }}
            />,
        );

        await waitFor(() => {
            expect(mockScrollToIndex).toHaveBeenLastCalledWith({
                align: "end",
                behavior: "smooth",
                index: 1,
            });
        });
    });

    it("should render action buttons with mobile-friendly classes", () => {
        render(<VirtualizedMessageList {...defaultProps} />);

        const actionButtonsContainer = screen.getByTestId(
            "message-action-buttons",
        );

        expect(actionButtonsContainer).toBeDefined();
    });

    it("should render reply button for all messages", () => {
        render(<VirtualizedMessageList {...defaultProps} />);

        expect(screen.getByRole("button", { name: /reply/i })).toBeDefined();
    });

    it("should render edit and delete buttons for own messages", () => {
        render(<VirtualizedMessageList {...defaultProps} />);

        expect(screen.getByRole("button", { name: /reply/i })).toBeDefined();
        expect(screen.getByRole("button", { name: /edit message/i })).toBeDefined();
        expect(screen.getByRole("button", { name: /delete message/i })).toBeDefined();
    });

    it("should not render edit and delete buttons for other users' messages", () => {
        const messagesFromOtherUser: ChatSurfaceMessage[] = [
            {
                id: "msg-2",
                sourceType: "channel",
                sourceMessageId: "msg-2",
                context: {
                    kind: "channel",
                    channelId: "channel-1",
                    serverId: "server-1",
                },
                authorId: "user-2",
                authorUserName: "OtherUser",
                authorLabel: "OtherUser",
                text: "Hello from another user",
                createdAt: new Date().toISOString(),
                reactions: [],
            },
        ];

        const props = {
            ...defaultProps,
            messages: messagesFromOtherUser,
        };

        render(<VirtualizedMessageList {...props} />);

        expect(screen.getByRole("button", { name: /reply/i })).toBeDefined();
        expect(
            screen.queryByRole("button", { name: /edit message/i }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: /delete message/i }),
        ).toBeNull();
    });
});
