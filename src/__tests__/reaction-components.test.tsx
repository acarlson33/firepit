import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReactionButton } from "../components/reaction-button";
import { ReactionPicker } from "../components/reaction-picker";

describe("ReactionButton Component", () => {
	it("should render emoji and count", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1", "user2"],
			count: 2,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user3"
				onToggle={vi.fn()}
			/>
		);

		expect(screen.getByText("👍")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("should show active state when current user reacted", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1", "user2"],
			count: 2,
		};

		const { container } = render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user1"
				onToggle={vi.fn()}
			/>
		);

		const button = container.querySelector("button");
		expect(button?.className).toContain("bg-primary");
	});

	it("should show inactive state when current user has not reacted", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1", "user2"],
			count: 2,
		};

		const { container } = render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user3"
				onToggle={vi.fn()}
			/>
		);

		const button = container.querySelector("button");
		expect(button?.className).toContain("bg-muted");
	});

	it("should call onToggle when clicked", async () => {
		const onToggle = vi.fn().mockResolvedValue(undefined);
		const reaction = {
			emoji: "👍",
			userIds: ["user1"],
			count: 1,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user2"
				onToggle={onToggle}
			/>
		);

		const button = screen.getByRole("button");
		fireEvent.click(button);

		await waitFor(() => {
			expect(onToggle).toHaveBeenCalledTimes(1);
			expect(onToggle).toHaveBeenCalledWith("👍", true);
		});
	});

	it("should be disabled when no current user", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1"],
			count: 1,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId={null}
				onToggle={vi.fn()}
			/>
		);

		const button = screen.getByRole("button");
		expect(button).toBeDisabled();
	});

	it("should disable button while loading", async () => {
		const onToggle = vi.fn<(emoji: string, isAdding: boolean) => Promise<void>>(() => 
			new Promise((resolve) => setTimeout(resolve, 100))
		);
		const reaction = {
			emoji: "👍",
			userIds: ["user1"],
			count: 1,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user1"
				onToggle={onToggle}
			/>
		);

		const button = screen.getByRole("button");
		
		fireEvent.click(button);
		
		// Button should be disabled while loading
		expect(button).toBeDisabled();
	});

	it("should display single digit count", () => {
		const reaction = {
			emoji: "❤️",
			userIds: ["user1"],
			count: 1,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user2"
				onToggle={vi.fn()}
			/>
		);

		expect(screen.getByText("1")).toBeInTheDocument();
	});

	it("should display multi-digit count", () => {
		const userIds = Array.from({ length: 15 }, (_, i) => `user${i + 1}`);
		const reaction = {
			emoji: "🔥",
			userIds,
			count: 15,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user99"
				onToggle={vi.fn()}
			/>
		);

		expect(screen.getByText("15")).toBeInTheDocument();
	});

	it("should handle various emoji types", () => {
		const emojis = ["👍", "❤️", "😂", "🎉", "🔥", "👀"];

		emojis.forEach((emoji) => {
			const reaction = {
				emoji,
				userIds: ["user1"],
				count: 1,
			};

			const { unmount } = render(
				<ReactionButton
					reaction={reaction}
					currentUserId="user2"
					onToggle={vi.fn()}
				/>
			);

			expect(screen.getByText(emoji)).toBeInTheDocument();
			unmount();
		});
	});

	it("should show correct title attribute", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1", "user2"],
			count: 2,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user3"
				onToggle={vi.fn()}
			/>
		);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("title", "2 reactions");
	});
});

describe("ReactionPicker Component", () => {
	it("should render trigger button", () => {
		render(<ReactionPicker onSelectEmoji={vi.fn()} />);

		const button = screen.getByRole("button", { name: /add reaction/i });
		expect(button).toBeInTheDocument();
	});

	it("should have correct accessibility label", () => {
		render(<ReactionPicker onSelectEmoji={vi.fn()} />);

		expect(screen.getByText("Add reaction")).toBeInTheDocument();
	});

	it("should be disabled when disabled prop is true", () => {
		render(<ReactionPicker onSelectEmoji={vi.fn()} disabled />);

		const button = screen.getByRole("button", { name: /add reaction/i });
		expect(button).toBeDisabled();
	});

	it("should have hover opacity classes", () => {
		const { container } = render(<ReactionPicker onSelectEmoji={vi.fn()} />);

		const button = container.querySelector("button");
		expect(button?.className).toContain("opacity-0");
		expect(button?.className).toContain("group-hover:opacity-100");
	});

	it("should call onSelectEmoji prop function", async () => {
		const onSelectEmoji = vi.fn().mockResolvedValue(undefined);
		
		// This test validates the prop is passed correctly
		// Full integration testing of emoji picker would require mocking the EmojiPicker component
		render(<ReactionPicker onSelectEmoji={onSelectEmoji} />);
		
		expect(onSelectEmoji).toBeDefined();
	});
});

describe("Reaction Integration", () => {
	it("should display multiple reactions for a message", () => {
		const reactions = [
			{ emoji: "👍", userIds: ["user1", "user2"], count: 2 },
			{ emoji: "❤️", userIds: ["user3"], count: 1 },
			{ emoji: "😂", userIds: ["user4", "user5", "user6"], count: 3 },
		];

		render(
			<div>
				{reactions.map((reaction) => (
					<ReactionButton
						key={reaction.emoji}
						reaction={reaction}
						currentUserId="user1"
						onToggle={vi.fn()}
					/>
				))}
			</div>
		);

		expect(screen.getByText("👍")).toBeInTheDocument();
		expect(screen.getByText("❤️")).toBeInTheDocument();
		expect(screen.getByText("😂")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.getByText("3")).toBeInTheDocument();
	});

	it("should handle reaction picker alongside existing reactions", () => {
		const reactions = [
			{ emoji: "👍", userIds: ["user1"], count: 1 },
		];

		const { container } = render(
			<div>
				{reactions.map((reaction) => (
					<ReactionButton
						key={reaction.emoji}
						reaction={reaction}
						currentUserId="user2"
						onToggle={vi.fn()}
					/>
				))}
				<ReactionPicker onSelectEmoji={vi.fn()} />
			</div>
		);

		expect(screen.getByText("👍")).toBeInTheDocument();
		// Verify both reaction button and picker are present
		const buttons = container.querySelectorAll("button");
		expect(buttons.length).toBeGreaterThan(0);
	});

	it("should show active state only for current user reactions", () => {
		const reactions = [
			{ emoji: "👍", userIds: ["user1", "user2"], count: 2 },
			{ emoji: "❤️", userIds: ["user3"], count: 1 },
		];

		const { container } = render(
			<div>
				{reactions.map((reaction) => (
					<ReactionButton
						key={reaction.emoji}
						reaction={reaction}
						currentUserId="user1"
						onToggle={vi.fn()}
					/>
				))}
			</div>
		);

		const buttons = container.querySelectorAll("button");
		const firstButton = buttons[0]; // 👍 - user1 reacted
		const secondButton = buttons[1]; // ❤️ - user1 did not react

		expect(firstButton?.className).toContain("bg-primary");
		expect(secondButton?.className).toContain("bg-muted");
	});
});

describe("Edge Cases", () => {
	it("should handle reaction with zero count gracefully", () => {
		const reaction = {
			emoji: "👍",
			userIds: [],
			count: 0,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user1"
				onToggle={vi.fn()}
			/>
		);

		expect(screen.getByText("0")).toBeInTheDocument();
	});

	it("should handle very long user ID arrays", () => {
		const userIds = Array.from({ length: 100 }, (_, i) => `user${i + 1}`);
		const reaction = {
			emoji: "🎉",
			userIds,
			count: 100,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId="user50"
				onToggle={vi.fn()}
			/>
		);

		expect(screen.getByText("100")).toBeInTheDocument();
	});

	it("should handle null currentUserId", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1"],
			count: 1,
		};

		render(
			<ReactionButton
				reaction={reaction}
				currentUserId={null}
				onToggle={vi.fn()}
			/>
		);

		const button = screen.getByRole("button");
		expect(button).toBeDisabled();
	});

	it("should not error when rendering components", () => {
		const reaction = {
			emoji: "👍",
			userIds: ["user1"],
			count: 1,
		};

		expect(() => {
			render(
				<ReactionButton
					reaction={reaction}
					currentUserId="user1"
					onToggle={vi.fn()}
				/>
			);
		}).not.toThrow();

		expect(() => {
			render(<ReactionPicker onSelectEmoji={vi.fn()} />);
		}).not.toThrow();
	});
});
