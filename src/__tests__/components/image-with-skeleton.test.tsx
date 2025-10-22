import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ImageWithSkeleton } from "@/components/image-with-skeleton";

describe("ImageWithSkeleton", () => {
	it("should show skeleton while image is loading", () => {
		render(
			<ImageWithSkeleton
				alt="Test image"
				src="https://example.com/image.jpg"
			/>
		);

		// Check that skeleton is rendered
		const skeleton = document.querySelector('[data-slot="skeleton"]');
		expect(skeleton).toBeTruthy();
	});

	it("should hide skeleton and show image after loading", async () => {
		render(
			<ImageWithSkeleton
				alt="Test image"
				src="https://example.com/image.jpg"
			/>
		);

		const img = screen.getByAltText("Test image");

		// Simulate image load
		img.dispatchEvent(new Event("load", { bubbles: true }));

		await waitFor(() => {
			expect(img).toHaveStyle({ display: "block" });
		});
	});

	it("should show error message when image fails to load", async () => {
		render(
			<ImageWithSkeleton
				alt="Test image"
				src="https://example.com/broken-image.jpg"
			/>
		);

		const img = screen.getByAltText("Test image");

		// Simulate image error
		img.dispatchEvent(new Event("error", { bubbles: true }));

		await waitFor(() => {
			expect(screen.getByText("Failed to load image")).toBeInTheDocument();
		});
	});

	it("should handle click events", async () => {
		const handleClick = vi.fn();

		render(
			<ImageWithSkeleton
				alt="Test image"
				onClick={handleClick}
				src="https://example.com/image.jpg"
			/>
		);

		const img = screen.getByAltText("Test image");

		// Load the image first
		img.dispatchEvent(new Event("load", { bubbles: true }));

		await waitFor(() => {
			expect(img).toHaveStyle({ display: "block" });
		});

		// Click the image
		img.click();

		expect(handleClick).toHaveBeenCalledTimes(1);
	});

	it("should handle keyboard events", async () => {
		const handleKeyDown = vi.fn();

		render(
			<ImageWithSkeleton
				alt="Test image"
				onKeyDown={handleKeyDown}
				role="button"
				src="https://example.com/image.jpg"
				tabIndex={0}
			/>
		);

		const img = screen.getByAltText("Test image");

		// Load the image first
		img.dispatchEvent(new Event("load", { bubbles: true }));

		await waitFor(() => {
			expect(img).toHaveStyle({ display: "block" });
		});

		// Trigger keyboard event
		const keyDownEvent = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
		});
		img.dispatchEvent(keyDownEvent);

		expect(handleKeyDown).toHaveBeenCalledTimes(1);
	});

	it("should apply custom className", async () => {
		render(
			<ImageWithSkeleton
				alt="Test image"
				className="custom-class"
				src="https://example.com/image.jpg"
			/>
		);

		const img = screen.getByAltText("Test image");

		// Load the image
		img.dispatchEvent(new Event("load", { bubbles: true }));

		await waitFor(() => {
			expect(img).toHaveClass("custom-class");
		});
	});

	it("should set correct accessibility attributes", () => {
		render(
			<ImageWithSkeleton
				alt="Test image"
				role="button"
				src="https://example.com/image.jpg"
				tabIndex={0}
			/>
		);

		const img = screen.getByAltText("Test image");

		expect(img).toHaveAttribute("role", "button");
		expect(img).toHaveAttribute("tabIndex", "0");
	});
});
