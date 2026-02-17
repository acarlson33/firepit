import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VirtualizedMessageList } from "@/components/virtualized-message-list";
import type { Message } from "@/lib/types";

// Mock react-virtuoso since we're just testing the item renderer
vi.mock("react-virtuoso", () => ({
	Virtuoso: ({ itemContent, data }: { itemContent: (index: number, item: Message) => React.ReactNode; data: Message[] }) => (
		<div data-testid="virtuoso-container">
			{data.map((item, index) => (
				<div key={item.$id} data-testid={`message-${item.$id}`}>
					{itemContent(index, item)}
				</div>
			))}
		</div>
	),
}));

describe("VirtualizedMessageList", () => {
	const mockMessages: Message[] = [
		{
			$id: "msg-1",
			userId: "user-1",
			userName: "TestUser",
			text: "Hello world",
			$createdAt: new Date().toISOString(),
			channelId: "channel-1",
			serverId: "server-1",
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
		const threadMessage: Message = {
			...mockMessages[0],
			$id: "thread-parent",
			threadReplyCount: 2,
		};

		render(
			<VirtualizedMessageList
				{...defaultProps}
				messages={[threadMessage]}
				onOpenThread={onOpenThread}
			/>
		);

		const threadButton = await screen.findByTitle("Start or view thread");
		await user.click(threadButton);
		expect(onOpenThread).toHaveBeenCalledWith(expect.objectContaining({ $id: "thread-parent" }));
	});

	it("renders pin and unpin buttons when user can manage messages", async () => {
		const onPinMessage = vi.fn();
		const onUnpinMessage = vi.fn();
		const user = userEvent.setup();

		render(
			<VirtualizedMessageList
				{...defaultProps}
				messages={[{ ...mockMessages[0], $id: "pin-test", isPinned: false }]}
				onPinMessage={onPinMessage}
				onUnpinMessage={onUnpinMessage}
				canManageMessages
			/>
		);

		const pinButton = await screen.findByTitle("Pin message");
		await user.click(pinButton);
		expect(onPinMessage).toHaveBeenCalledWith("pin-test");

		render(
			<VirtualizedMessageList
				{...defaultProps}
				messages={[{ ...mockMessages[0], $id: "pinned-test", isPinned: true }]}
				onPinMessage={onPinMessage}
				onUnpinMessage={onUnpinMessage}
				canManageMessages
			/>
		);

		const unpinButton = await screen.findByTitle("Unpin message");
		await user.click(unpinButton);
		expect(onUnpinMessage).toHaveBeenCalledWith("pinned-test");
	});

	it("should render message list", () => {
		render(<VirtualizedMessageList {...defaultProps} />);
		
		expect(screen.getByTestId("virtuoso-container")).toBeDefined();
		expect(screen.getByTestId("message-msg-1")).toBeDefined();
	});

	it("should render action buttons with mobile-friendly classes", () => {
		const { container } = render(<VirtualizedMessageList {...defaultProps} />);
		
		// Find the action buttons container
		const actionButtonsContainer = container.querySelector(".opacity-100.md\\:opacity-0.md\\:group-hover\\:opacity-100");
		
		expect(actionButtonsContainer).toBeDefined();
		expect(actionButtonsContainer?.className).toContain("opacity-100");
		expect(actionButtonsContainer?.className).toContain("md:opacity-0");
		expect(actionButtonsContainer?.className).toContain("md:group-hover:opacity-100");
	});

	it("should render reply button for all messages", () => {
		render(<VirtualizedMessageList {...defaultProps} />);
		
		// Reply button should be present (using MessageSquare icon)
		const buttons = screen.getAllByRole("button");
		expect(buttons.length).toBeGreaterThan(0);
	});

	it("should render edit and delete buttons for own messages", () => {
		const { container } = render(<VirtualizedMessageList {...defaultProps} />);
		
		// Since the message userId matches the current userId, edit and delete buttons should be present
		const buttons = container.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThan(1); // At least reply, edit, and delete buttons
	});

	it("should not render edit and delete buttons for other users' messages", () => {
		const messagesFromOtherUser: Message[] = [
			{
				$id: "msg-2",
				userId: "user-2",
				userName: "OtherUser",
				text: "Hello from another user",
				$createdAt: new Date().toISOString(),
				channelId: "channel-1",
				serverId: "server-1",
				reactions: [],
			},
		];

		const props = {
			...defaultProps,
			messages: messagesFromOtherUser,
		};

		const { container } = render(<VirtualizedMessageList {...props} />);
		
		// Should have fewer buttons (no edit/delete)
		const buttons = container.querySelectorAll("button");
		// Should have reply button and reaction picker, but no edit/delete
		expect(buttons.length).toBeLessThan(4);
	});
});
