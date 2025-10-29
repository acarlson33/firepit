import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageWithMentions } from "@/components/message-with-mentions";

describe("MessageWithMentions", () => {
	it("should render plain text without mentions or emojis", () => {
		const { container } = render(
			<MessageWithMentions text="Hello world" currentUserId="user-1" />
		);
		expect(container.textContent).toBe("Hello world");
	});

	it("should render custom emoji when provided", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "/api/emoji/emoji-1",
				name: "party-parrot",
			},
		];

		render(
			<MessageWithMentions
				text="Hello :party-parrot: world"
				currentUserId="user-1"
				customEmojis={customEmojis}
			/>
		);

		const img = screen.getByRole("img");
		expect(img).toBeDefined();
		expect(img.getAttribute("src")).toBe("/api/emoji/emoji-1");
		expect(img.getAttribute("alt")).toBe(":party-parrot:");
	});

	it("should render standard emoji from shortcode", () => {
		const { container } = render(
			<MessageWithMentions text="Hello :smile: world" currentUserId="user-1" />
		);
		// smile emoji shortcode should be converted to 😄
		expect(container.textContent).toContain("😄");
		expect(container.textContent).toContain("Hello");
		expect(container.textContent).toContain("world");
	});

	it("should render both mentions and emojis", () => {
		const users = new Map([
			[
				"user-2",
				{
					userId: "user-2",
					displayName: "TestUser",
					avatarUrl: "",
					status: "online",
					pronouns: "they/them",
				},
			],
		]);

		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "/api/emoji/emoji-1",
				name: "custom",
			},
		];

		const { container } = render(
			<MessageWithMentions
				text="Hey @TestUser :custom: check this :smile: out"
				currentUserId="user-1"
				users={users}
				customEmojis={customEmojis}
			/>
		);

		// Check for mention
		expect(container.textContent).toContain("@TestUser");
		
		// Check for custom emoji image
		const images = screen.getAllByRole("img");
		expect(images.length).toBeGreaterThan(0);
		const customEmojiImg = images.find(img => img.getAttribute("alt") === ":custom:");
		expect(customEmojiImg).toBeDefined();

		// Check for standard emoji
		expect(container.textContent).toContain("😄");
	});

	it("should handle multiple custom emojis", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "/api/emoji/emoji-1",
				name: "party-parrot",
			},
			{
				fileId: "emoji-2",
				url: "/api/emoji/emoji-2",
				name: "cool-cat",
			},
		];

		render(
			<MessageWithMentions
				text=":party-parrot: Hello :cool-cat:"
				currentUserId="user-1"
				customEmojis={customEmojis}
			/>
		);

		const images = screen.getAllByRole("img");
		expect(images).toHaveLength(2);
		expect(images[0].getAttribute("alt")).toBe(":party-parrot:");
		expect(images[1].getAttribute("alt")).toBe(":cool-cat:");
	});

	it("should keep original text when emoji is not found", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "/api/emoji/emoji-1",
				name: "party-parrot",
			},
		];

		const { container } = render(
			<MessageWithMentions
				text="Hello :unknown-emoji: world"
				currentUserId="user-1"
				customEmojis={customEmojis}
			/>
		);

		expect(container.textContent).toContain(":unknown-emoji:");
		expect(screen.queryByRole("img")).toBeNull();
	});

	it("should render emojis in text before and after mentions", () => {
		const users = new Map([
			[
				"user-2",
				{
					userId: "user-2",
					displayName: "Alice",
					avatarUrl: "",
					status: "online",
					pronouns: "",
				},
			],
		]);

		const { container } = render(
			<MessageWithMentions
				text=":smile: Hey @Alice :heart:"
				currentUserId="user-1"
				users={users}
			/>
		);

		// Check for emojis before and after mention
		expect(container.textContent).toContain("😄");
		expect(container.textContent).toContain("❤️");
		expect(container.textContent).toContain("@Alice");
	});

	it("should work with empty customEmojis array", () => {
		const { container } = render(
			<MessageWithMentions
				text="Hello :smile: world"
				currentUserId="user-1"
				customEmojis={[]}
			/>
		);

		// Standard emoji should still work
		expect(container.textContent).toContain("😄");
	});

	it("should work without customEmojis prop", () => {
		const { container } = render(
			<MessageWithMentions text="Hello :smile: world" currentUserId="user-1" />
		);

		// Standard emoji should still work
		expect(container.textContent).toContain("😄");
	});
});
