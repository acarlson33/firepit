import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatSurfacePanel } from "@/components/chat-surface-panel";
import type { ChatSurfaceMessage } from "@/lib/chat-surface";

vi.mock("@/components/chat-surface-message-item", () => ({
    ChatSurfaceMessageItem: ({
        message,
        onMediaLoad,
    }: {
        message: ChatSurfaceMessage;
        onMediaLoad?: (message: ChatSurfaceMessage) => void;
    }) => (
        <div>
            <div>{message.text}</div>
            {onMediaLoad ? (
                <button onClick={() => onMediaLoad(message)} type="button">
                    media-loaded-{message.id}
                </button>
            ) : null}
        </div>
    ),
}));

vi.mock("@/components/virtualized-message-list", () => ({
    VirtualizedMessageList: ({
        messages,
        onMediaLoad,
        scrollToBottomRequest,
    }: {
        messages: ChatSurfaceMessage[];
        onMediaLoad?: (message: ChatSurfaceMessage) => void;
        scrollToBottomRequest?: { id: number } | null;
    }) => (
        <div>
            <div>virtualized-list-{scrollToBottomRequest?.id ?? 0}</div>
            {messages.at(-1) && onMediaLoad ? (
                <button
                    onClick={() =>
                        onMediaLoad(messages.at(-1) as ChatSurfaceMessage)
                    }
                    type="button"
                >
                    virtual-media-loaded
                </button>
            ) : null}
        </div>
    ),
}));

vi.mock("@/components/chat-input", () => ({
    ChatInput: ({
        onChange,
        onKeyDown,
        onMentionsChange: _onMentionsChange,
        placeholder,
        value,
        disabled,
        ...props
    }: Record<string, unknown>) => (
        <input
            {...props}
            disabled={Boolean(disabled)}
            onChange={(event) => {
                onChange?.((event.target as HTMLInputElement).value);
            }}
            onKeyDown={(event) => {
                onKeyDown?.(event);
            }}
            placeholder={String(placeholder ?? "")}
            value={String(value ?? "")}
        />
    ),
}));

vi.mock("@/components/emoji-picker", () => ({
    EmojiPicker: ({ onEmojiSelect }: Record<string, unknown>) => (
        <button
            onClick={() => {
                (onEmojiSelect as (emoji: string) => void)(":wave:");
            }}
            type="button"
        >
            emoji-picker
        </button>
    ),
}));

vi.mock("@/components/file-upload-button", () => ({
    FilePreview: ({ attachment }: { attachment: { fileName?: string } }) => (
        <div>{attachment.fileName ?? "attachment"}</div>
    ),
    FileUploadButton: () => <button type="button">file-upload</button>,
}));

const baseMessage: ChatSurfaceMessage = {
    authorId: "user-1",
    authorLabel: "User One",
    context: { channelId: "channel-1", kind: "channel" },
    createdAt: "2026-03-10T12:00:00.000Z",
    id: "msg-1",
    sourceMessageId: "msg-1",
    sourceType: "channel",
    text: "Hello from the surface",
};

describe("ChatSurfacePanel", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("renders the placeholder when no surface is selected", () => {
        render(
            <ChatSurfacePanel
                currentUserId="user-1"
                deleteConfirmId={null}
                editingMessageId={null}
                emptyDescription="No messages"
                emptyTitle="Nothing here"
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
                showSurface={false}
                surfaceMessages={[]}
            />,
        );

        expect(screen.getByText("Pick a conversation")).toBeInTheDocument();
        expect(
            screen.getByText("Your messages will appear here."),
        ).toBeInTheDocument();
    });

    it("wires shared composer interactions and typing state", () => {
        const onLoadOlder = vi.fn();
        const onSubmit = vi.fn();
        const onTextChange = vi.fn();
        const onEmojiSelect = vi.fn();
        const onCancelReply = vi.fn();

        render(
            <ChatSurfacePanel
                composer={{
                    disabled: false,
                    fileAttachments: [
                        {
                            fileId: "file-1",
                            fileName: "notes.txt",
                            fileSize: 12,
                            fileType: "text/plain",
                            fileUrl: "https://example.com/notes.txt",
                        },
                    ],
                    fileInputRef: { current: null },
                    onCancelReply,
                    onEmojiSelect,
                    onFileAttachmentSelect: vi.fn(),
                    onRemoveFileAttachment: vi.fn(),
                    onSelectImageFile: vi.fn(),
                    onSubmit,
                    onTextChange,
                    placeholder: "Type a message",
                    replyingTo: {
                        authorLabel: "User Two",
                        text: "Earlier message",
                    },
                    text: "draft",
                }}
                currentUserId="user-1"
                deleteConfirmId={null}
                editingMessageId={null}
                emptyDescription="No messages"
                emptyTitle="Nothing here"
                loading={false}
                onLoadOlder={onLoadOlder}
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
                shouldShowLoadOlder
                surfaceMessages={[baseMessage]}
                typingUsers={{
                    user2: {
                        updatedAt: "2026-03-10T12:01:00.000Z",
                        userId: "user-2",
                        userName: "User Two",
                    },
                }}
                virtualizationThreshold={10}
            />,
        );

        expect(screen.getByText("Hello from the surface")).toBeInTheDocument();
        expect(screen.getByText("Replying to")).toBeInTheDocument();
        expect(screen.getByText("notes.txt")).toBeInTheDocument();
        expect(screen.getByText("User Two is typing...")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Load older messages" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        fireEvent.click(screen.getByRole("button", { name: "emoji-picker" }));
        fireEvent.change(screen.getByPlaceholderText("Type a message"), {
            target: { value: "updated draft" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        expect(onLoadOlder).toHaveBeenCalledOnce();
        expect(onCancelReply).toHaveBeenCalledOnce();
        expect(onEmojiSelect).toHaveBeenCalledWith(":wave:");
        expect(onTextChange).toHaveBeenCalledWith("updated draft");
        expect(onSubmit).toHaveBeenCalledOnce();
    });

    it("scrolls the composer into view for large previews and after submit", async () => {
        const scrollIntoView = vi.fn();
        const original = HTMLElement.prototype.scrollIntoView;
        const onSubmit = vi.fn().mockResolvedValue(undefined);

        HTMLElement.prototype.scrollIntoView = scrollIntoView;

        const { rerender } = render(
            <ChatSurfacePanel
                composer={{
                    disabled: false,
                    fileAttachments: [],
                    fileInputRef: { current: null },
                    onEmojiSelect: vi.fn(),
                    onFileAttachmentSelect: vi.fn(),
                    onRemoveFileAttachment: vi.fn(),
                    onSelectImageFile: vi.fn(),
                    onSubmit,
                    onTextChange: vi.fn(),
                    placeholder: "Type a message",
                    selectedImagePreview: "data:image/png;base64,abc",
                    text: "draft",
                }}
                currentUserId="user-1"
                deleteConfirmId={null}
                editingMessageId={null}
                emptyDescription="No messages"
                emptyTitle="Nothing here"
                loading={false}
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
                surfaceMessages={[baseMessage]}
                virtualizationThreshold={10}
            />,
        );

        await waitFor(() => {
            expect(scrollIntoView).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByRole("button", { name: "Send" }));

        await waitFor(() => {
            expect(onSubmit).toHaveBeenCalledOnce();
        });

        rerender(
            <ChatSurfacePanel
                composer={{
                    disabled: false,
                    fileAttachments: [],
                    fileInputRef: { current: null },
                    onEmojiSelect: vi.fn(),
                    onFileAttachmentSelect: vi.fn(),
                    onRemoveFileAttachment: vi.fn(),
                    onSelectImageFile: vi.fn(),
                    onSubmit,
                    onTextChange: vi.fn(),
                    placeholder: "Type a message",
                    text: "",
                }}
                currentUserId="user-1"
                deleteConfirmId={null}
                editingMessageId={null}
                emptyDescription="No messages"
                emptyTitle="Nothing here"
                loading={false}
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
                surfaceMessages={[
                    baseMessage,
                    {
                        ...baseMessage,
                        createdAt: "2026-03-10T12:01:00.000Z",
                        id: "msg-2",
                        sourceMessageId: "msg-2",
                        text: "Sent message",
                    },
                ]}
                virtualizationThreshold={10}
            />,
        );

        await waitFor(() => {
            expect(scrollIntoView).toHaveBeenCalledTimes(3);
        });

        HTMLElement.prototype.scrollIntoView = original;
    });

    it("re-requests bottom scroll when trailing virtualized media finishes loading", async () => {
        const { rerender } = render(
            <ChatSurfacePanel
                currentUserId="user-1"
                deleteConfirmId={null}
                editingMessageId={null}
                emptyDescription="No messages"
                emptyTitle="Nothing here"
                loading
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
                surfaceMessages={[
                    {
                        ...baseMessage,
                        imageUrl: "https://example.com/first.png",
                    },
                    {
                        ...baseMessage,
                        createdAt: "2026-03-10T12:01:00.000Z",
                        id: "msg-2",
                        imageUrl: "https://example.com/second.png",
                        sourceMessageId: "msg-2",
                        text: "Latest image",
                    },
                ]}
                virtualizationThreshold={1}
            />,
        );

        rerender(
            <ChatSurfacePanel
                currentUserId="user-1"
                deleteConfirmId={null}
                editingMessageId={null}
                emptyDescription="No messages"
                emptyTitle="Nothing here"
                loading={false}
                onOpenImageViewer={vi.fn()}
                onRemove={vi.fn()}
                onStartEdit={vi.fn()}
                onStartReply={vi.fn()}
                onToggleReaction={vi.fn().mockResolvedValue(undefined)}
                setDeleteConfirmId={vi.fn()}
                surfaceMessages={[
                    {
                        ...baseMessage,
                        imageUrl: "https://example.com/first.png",
                    },
                    {
                        ...baseMessage,
                        createdAt: "2026-03-10T12:01:00.000Z",
                        id: "msg-2",
                        imageUrl: "https://example.com/second.png",
                        sourceMessageId: "msg-2",
                        text: "Latest image",
                    },
                ]}
                virtualizationThreshold={1}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("virtualized-list-1")).toBeInTheDocument();
        });

        fireEvent.click(
            screen.getByRole("button", { name: "virtual-media-loaded" }),
        );

        await waitFor(() => {
            expect(screen.getByText("virtualized-list-2")).toBeInTheDocument();
        });
    });
});
