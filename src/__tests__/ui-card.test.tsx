/**
 * Tests for Card UI components
 * Target coverage: Card and all its sub-components
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardAction,
	CardContent,
	CardFooter,
} from "@/components/ui/card";

describe("Card Components", () => {
	describe("Card", () => {
		it("should render card with children", () => {
			render(<Card>Card Content</Card>);
			const card = screen.getByText("Card Content");
			expect(card).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<Card>Card</Card>);
			const card = screen.getByText("Card");
			expect(card.className).toContain("rounded-xl");
			expect(card.className).toContain("border");
			expect(card.className).toContain("bg-card");
			expect(card.className).toContain("shadow-sm");
		});

		it("should apply custom className", () => {
			render(<Card className="custom-card">Card</Card>);
			const card = screen.getByText("Card");
			expect(card.className).toContain("custom-card");
		});

		it("should have data-slot attribute", () => {
			render(<Card>Card</Card>);
			const card = screen.getByText("Card");
			expect(card.getAttribute("data-slot")).toBe("card");
		});

		it("should spread additional props", () => {
			render(<Card data-testid="test-card">Card</Card>);
			const card = screen.getByTestId("test-card");
			expect(card).toBeDefined();
		});
	});

	describe("CardHeader", () => {
		it("should render card header with children", () => {
			render(<CardHeader>Header Content</CardHeader>);
			const header = screen.getByText("Header Content");
			expect(header).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<CardHeader>Header</CardHeader>);
			const header = screen.getByText("Header");
			expect(header.className).toContain("grid");
			expect(header.className).toContain("gap-1.5");
			expect(header.className).toContain("px-6");
		});

		it("should apply custom className", () => {
			render(<CardHeader className="custom-header">Header</CardHeader>);
			const header = screen.getByText("Header");
			expect(header.className).toContain("custom-header");
		});

		it("should have data-slot attribute", () => {
			render(<CardHeader>Header</CardHeader>);
			const header = screen.getByText("Header");
			expect(header.getAttribute("data-slot")).toBe("card-header");
		});

		it("should spread additional props", () => {
			render(<CardHeader data-testid="test-header">Header</CardHeader>);
			const header = screen.getByTestId("test-header");
			expect(header).toBeDefined();
		});
	});

	describe("CardTitle", () => {
		it("should render card title with children", () => {
			render(<CardTitle>Title Text</CardTitle>);
			const title = screen.getByText("Title Text");
			expect(title).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<CardTitle>Title</CardTitle>);
			const title = screen.getByText("Title");
			expect(title.className).toContain("font-semibold");
			expect(title.className).toContain("leading-none");
		});

		it("should apply custom className", () => {
			render(<CardTitle className="custom-title">Title</CardTitle>);
			const title = screen.getByText("Title");
			expect(title.className).toContain("custom-title");
		});

		it("should have data-slot attribute", () => {
			render(<CardTitle>Title</CardTitle>);
			const title = screen.getByText("Title");
			expect(title.getAttribute("data-slot")).toBe("card-title");
		});

		it("should spread additional props", () => {
			render(<CardTitle data-testid="test-title">Title</CardTitle>);
			const title = screen.getByTestId("test-title");
			expect(title).toBeDefined();
		});
	});

	describe("CardDescription", () => {
		it("should render card description with children", () => {
			render(<CardDescription>Description Text</CardDescription>);
			const description = screen.getByText("Description Text");
			expect(description).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<CardDescription>Description</CardDescription>);
			const description = screen.getByText("Description");
			expect(description.className).toContain("text-muted-foreground");
			expect(description.className).toContain("text-sm");
		});

		it("should apply custom className", () => {
			render(
				<CardDescription className="custom-description">
					Description
				</CardDescription>
			);
			const description = screen.getByText("Description");
			expect(description.className).toContain("custom-description");
		});

		it("should have data-slot attribute", () => {
			render(<CardDescription>Description</CardDescription>);
			const description = screen.getByText("Description");
			expect(description.getAttribute("data-slot")).toBe("card-description");
		});

		it("should spread additional props", () => {
			render(
				<CardDescription data-testid="test-description">
					Description
				</CardDescription>
			);
			const description = screen.getByTestId("test-description");
			expect(description).toBeDefined();
		});
	});

	describe("CardAction", () => {
		it("should render card action with children", () => {
			render(<CardAction>Action Button</CardAction>);
			const action = screen.getByText("Action Button");
			expect(action).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<CardAction>Action</CardAction>);
			const action = screen.getByText("Action");
			expect(action.className).toContain("col-start-2");
			expect(action.className).toContain("row-span-2");
			expect(action.className).toContain("self-start");
		});

		it("should apply custom className", () => {
			render(<CardAction className="custom-action">Action</CardAction>);
			const action = screen.getByText("Action");
			expect(action.className).toContain("custom-action");
		});

		it("should have data-slot attribute", () => {
			render(<CardAction>Action</CardAction>);
			const action = screen.getByText("Action");
			expect(action.getAttribute("data-slot")).toBe("card-action");
		});

		it("should spread additional props", () => {
			render(<CardAction data-testid="test-action">Action</CardAction>);
			const action = screen.getByTestId("test-action");
			expect(action).toBeDefined();
		});
	});

	describe("CardContent", () => {
		it("should render card content with children", () => {
			render(<CardContent>Content Text</CardContent>);
			const content = screen.getByText("Content Text");
			expect(content).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<CardContent>Content</CardContent>);
			const content = screen.getByText("Content");
			expect(content.className).toContain("px-6");
		});

		it("should apply custom className", () => {
			render(<CardContent className="custom-content">Content</CardContent>);
			const content = screen.getByText("Content");
			expect(content.className).toContain("custom-content");
		});

		it("should have data-slot attribute", () => {
			render(<CardContent>Content</CardContent>);
			const content = screen.getByText("Content");
			expect(content.getAttribute("data-slot")).toBe("card-content");
		});

		it("should spread additional props", () => {
			render(<CardContent data-testid="test-content">Content</CardContent>);
			const content = screen.getByTestId("test-content");
			expect(content).toBeDefined();
		});
	});

	describe("CardFooter", () => {
		it("should render card footer with children", () => {
			render(<CardFooter>Footer Text</CardFooter>);
			const footer = screen.getByText("Footer Text");
			expect(footer).toBeDefined();
		});

		it("should apply default classes", () => {
			render(<CardFooter>Footer</CardFooter>);
			const footer = screen.getByText("Footer");
			expect(footer.className).toContain("flex");
			expect(footer.className).toContain("items-center");
			expect(footer.className).toContain("px-6");
		});

		it("should apply custom className", () => {
			render(<CardFooter className="custom-footer">Footer</CardFooter>);
			const footer = screen.getByText("Footer");
			expect(footer.className).toContain("custom-footer");
		});

		it("should have data-slot attribute", () => {
			render(<CardFooter>Footer</CardFooter>);
			const footer = screen.getByText("Footer");
			expect(footer.getAttribute("data-slot")).toBe("card-footer");
		});

		it("should spread additional props", () => {
			render(<CardFooter data-testid="test-footer">Footer</CardFooter>);
			const footer = screen.getByTestId("test-footer");
			expect(footer).toBeDefined();
		});
	});

	describe("Card Integration", () => {
		it("should render complete card with all components", () => {
			render(
				<Card>
					<CardHeader>
						<CardTitle>Test Title</CardTitle>
						<CardDescription>Test Description</CardDescription>
						<CardAction>Action</CardAction>
					</CardHeader>
					<CardContent>Test Content</CardContent>
					<CardFooter>Test Footer</CardFooter>
				</Card>
			);

			expect(screen.getByText("Test Title")).toBeDefined();
			expect(screen.getByText("Test Description")).toBeDefined();
			expect(screen.getByText("Action")).toBeDefined();
			expect(screen.getByText("Test Content")).toBeDefined();
			expect(screen.getByText("Test Footer")).toBeDefined();
		});
	});
});
