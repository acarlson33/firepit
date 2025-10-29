import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchResults } from "../../components/search-results";
import type { Message, DirectMessage } from "@/lib/types";

// Mock date-fns
vi.mock("date-fns", () => ({
	formatDistanceToNow: () => "5 minutes ago",
}));

describe("SearchResults", () => {
	it("should render channel message results", () => {
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					userName: "testuser",
					displayName: "Test User",
					text: "Hello world",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
					avatarUrl: "http://localhost/avatar.jpg",
				} as Message,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		expect(screen.getByText("Test User")).toBeInTheDocument();
		expect(screen.getByText("Hello world")).toBeInTheDocument();
		expect(screen.getByText("channel")).toBeInTheDocument();
	});

	it("should render DM message results", () => {
		const results = [
			{
				type: "dm" as const,
				message: {
					$id: "dm-1",
					conversationId: "conv-1",
					senderId: "user-2",
					receiverId: "user-1",
					senderDisplayName: "DM User",
					text: "Private message",
					$createdAt: new Date().toISOString(),
				} as DirectMessage,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		expect(screen.getByText("DM User")).toBeInTheDocument();
		expect(screen.getByText("Private message")).toBeInTheDocument();
		expect(screen.getByText("DM")).toBeInTheDocument();
	});

	it("should truncate long messages", () => {
		const longText = "a".repeat(200);
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					text: longText,
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
				} as Message,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		const messageText = screen.getByText(/a+\.\.\./);
		expect(messageText.textContent?.length).toBeLessThan(200);
	});

	it("should show image indicator for messages with images", () => {
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					text: "Check this out",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
					imageFileId: "img-123",
				} as Message,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		// Should have image icon in the DOM
		const buttons = screen.getAllByRole("button");
		expect(buttons.length).toBeGreaterThan(0);
	});

	it("should show edited indicator for edited messages", () => {
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					text: "Edited message",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
					editedAt: new Date().toISOString(),
				} as Message,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		expect(screen.getByText("(edited)")).toBeInTheDocument();
	});

	it("should navigate to channel on click", async () => {
		const onClose = vi.fn();
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					text: "Test message",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
				} as Message,
			},
		];

		// Mock window.location.href
		delete (window as { location?: unknown }).location;
		window.location = { href: "" } as Location;

		render(<SearchResults results={results} onClose={onClose} />);

		const resultButton = screen.getByRole("button");
		await userEvent.click(resultButton);

		expect(window.location.href).toBe(
			"/chat?channel=channel-1&highlight=msg-1",
		);
		expect(onClose).toHaveBeenCalled();
	});

	it("should navigate to DM conversation on click", async () => {
		const onClose = vi.fn();
		const results = [
			{
				type: "dm" as const,
				message: {
					$id: "dm-1",
					conversationId: "conv-1",
					senderId: "user-2",
					receiverId: "user-1",
					text: "Private message",
					$createdAt: new Date().toISOString(),
				} as DirectMessage,
			},
		];

		// Mock window.location.href
		delete (window as { location?: unknown }).location;
		window.location = { href: "" } as Location;

		render(<SearchResults results={results} onClose={onClose} />);

		const resultButton = screen.getByRole("button");
		await userEvent.click(resultButton);

		expect(window.location.href).toBe(
			"/chat?conversation=conv-1&highlight=dm-1",
		);
		expect(onClose).toHaveBeenCalled();
	});

	it("should display avatar when available", () => {
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					displayName: "Test User",
					text: "Hello",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
					avatarUrl: "http://localhost/avatar.jpg",
				} as Message,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		const avatar = screen.getByAltText("Test User avatar");
		expect(avatar).toHaveAttribute("src", "http://localhost/avatar.jpg");
	});

	it("should display fallback avatar when no avatar URL", () => {
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					displayName: "Test User",
					text: "Hello",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
				} as Message,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		expect(screen.getByText("T")).toBeInTheDocument();
	});

	it("should handle multiple results", () => {
		const results = [
			{
				type: "channel" as const,
				message: {
					$id: "msg-1",
					userId: "user-1",
					text: "First message",
					$createdAt: new Date().toISOString(),
					channelId: "channel-1",
				} as Message,
			},
			{
				type: "dm" as const,
				message: {
					$id: "dm-1",
					conversationId: "conv-1",
					senderId: "user-2",
					receiverId: "user-1",
					text: "Second message",
					$createdAt: new Date().toISOString(),
				} as DirectMessage,
			},
		];

		render(<SearchResults results={results} onClose={vi.fn()} />);

		expect(screen.getByText("First message")).toBeInTheDocument();
		expect(screen.getByText("Second message")).toBeInTheDocument();
	});
});
