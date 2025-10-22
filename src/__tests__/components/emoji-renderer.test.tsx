import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmojiRenderer } from "@/components/emoji-renderer";

describe("EmojiRenderer", () => {
	it("should render plain text without custom emojis", () => {
		const { container } = render(<EmojiRenderer text="Hello world" />);
		expect(container.textContent).toBe("Hello world");
	});

	it("should render custom emoji when found", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/emoji.png",
				name: "party-parrot",
			},
		];

		render(
			<EmojiRenderer text="Hello :party-parrot: world" customEmojis={customEmojis} />
		);

		const img = screen.getByRole("img");
		expect(img).toBeDefined();
		expect(img.getAttribute("src")).toBe("https://example.com/emoji.png");
		expect(img.getAttribute("alt")).toBe(":party-parrot:");
		expect(img.getAttribute("title")).toBe(":party-parrot:");
	});

	it("should render multiple custom emojis", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/emoji1.png",
				name: "party-parrot",
			},
			{
				fileId: "emoji-2",
				url: "https://example.com/emoji2.png",
				name: "cool-cat",
			},
		];

		render(
			<EmojiRenderer
				text=":party-parrot: Hello :cool-cat:"
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
				url: "https://example.com/emoji.png",
				name: "party-parrot",
			},
		];

		const { container } = render(
			<EmojiRenderer text="Hello :unknown-emoji: world" customEmojis={customEmojis} />
		);

		expect(container.textContent).toContain(":unknown-emoji:");
		expect(screen.queryByRole("img")).toBeNull();
	});

	it("should handle mixed content with emojis and text", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/emoji.png",
				name: "smile",
			},
		];

		const { container } = render(
			<EmojiRenderer
				text="Start :smile: middle :smile: end"
				customEmojis={customEmojis}
			/>
		);

		const images = screen.getAllByRole("img");
		expect(images).toHaveLength(2);
		expect(container.textContent).toContain("Start");
		expect(container.textContent).toContain("middle");
		expect(container.textContent).toContain("end");
	});

	it("should render with correct CSS classes for sizing", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/emoji.png",
				name: "test",
			},
		];

		render(<EmojiRenderer text=":test:" customEmojis={customEmojis} />);

		const img = screen.getByRole("img");
		expect(img.className).toContain("size-5");
		expect(img.className).toContain("inline-block");
		expect(img.className).toContain("align-middle");
	});

	it("should have lazy loading attribute", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/emoji.png",
				name: "test",
			},
		];

		render(<EmojiRenderer text=":test:" customEmojis={customEmojis} />);

		const img = screen.getByRole("img");
		expect(img.getAttribute("loading")).toBe("lazy");
	});

	it("should handle empty custom emoji list", () => {
		const { container } = render(<EmojiRenderer text="Hello :emoji:" customEmojis={[]} />);
		expect(container.textContent).toBe("Hello :emoji:");
		expect(screen.queryByRole("img")).toBeNull();
	});

	it("should render standard emoji from shortcode", () => {
		const { container } = render(<EmojiRenderer text="Hello :smile: world" />);
		// smile emoji shortcode should be converted to 😄
		expect(container.textContent).toContain("😄");
		expect(container.textContent).toContain("Hello");
		expect(container.textContent).toContain("world");
	});

	it("should render multiple standard emojis", () => {
		const { container } = render(<EmojiRenderer text=":heart: Love :+1:" />);
		// heart emoji should be ❤️ and +1 should be 👍
		expect(container.textContent).toContain("❤️");
		expect(container.textContent).toContain("👍");
		expect(container.textContent).toContain("Love");
	});

	it("should prioritize custom emojis over standard emojis", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/custom-smile.png",
				name: "smile",
			},
		];

		render(<EmojiRenderer text="Hello :smile: world" customEmojis={customEmojis} />);

		// Should render custom emoji image, not standard Unicode emoji
		const img = screen.getByRole("img");
		expect(img).toBeDefined();
		expect(img.getAttribute("src")).toBe("https://example.com/custom-smile.png");
	});

	it("should handle mixed custom and standard emojis", () => {
		const customEmojis = [
			{
				fileId: "emoji-1",
				url: "https://example.com/custom.png",
				name: "custom",
			},
		];

		const { container } = render(
			<EmojiRenderer
				text=":custom: Hello :heart: world"
				customEmojis={customEmojis}
			/>
		);

		// Custom emoji should be an image
		const img = screen.getByRole("img");
		expect(img.getAttribute("alt")).toBe(":custom:");

		// Standard emoji should be Unicode
		expect(container.textContent).toContain("❤️");
	});

	it("should keep unknown shortcodes as text", () => {
		const { container } = render(
			<EmojiRenderer text="Hello :unknown_emoji_xyz: world" />
		);

		// Unknown emoji should remain as text
		expect(container.textContent).toBe("Hello :unknown_emoji_xyz: world");
	});
});
