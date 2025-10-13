import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../../components/ui/button";

describe("Button Component", () => {
	it("should render button with text", () => {
		render(<Button>Click me</Button>);
		
		expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
	});

	it("should call onClick when clicked", async () => {
		const user = userEvent.setup();
		let clicked = false;
		const handleClick = () => {
			clicked = true;
		};
		
		render(<Button onClick={handleClick}>Click me</Button>);
		
		const button = screen.getByRole("button", { name: "Click me" });
		await user.click(button);
		
		expect(clicked).toBe(true);
	});

	it("should render with default variant", () => {
		render(<Button>Default</Button>);
		
		const button = screen.getByRole("button", { name: "Default" });
		expect(button).toBeInTheDocument();
	});

	it("should render with destructive variant", () => {
		render(<Button variant="destructive">Delete</Button>);
		
		const button = screen.getByRole("button", { name: "Delete" });
		expect(button).toBeInTheDocument();
	});

	it("should render with outline variant", () => {
		render(<Button variant="outline">Outline</Button>);
		
		const button = screen.getByRole("button", { name: "Outline" });
		expect(button).toBeInTheDocument();
	});

	it("should render with ghost variant", () => {
		render(<Button variant="ghost">Ghost</Button>);
		
		const button = screen.getByRole("button", { name: "Ghost" });
		expect(button).toBeInTheDocument();
	});

	it("should render with small size", () => {
		render(<Button size="sm">Small</Button>);
		
		const button = screen.getByRole("button", { name: "Small" });
		expect(button).toBeInTheDocument();
	});

	it("should render with large size", () => {
		render(<Button size="lg">Large</Button>);
		
		const button = screen.getByRole("button", { name: "Large" });
		expect(button).toBeInTheDocument();
	});

	it("should render with icon size", () => {
		render(<Button size="icon" aria-label="Icon button">🔔</Button>);
		
		const button = screen.getByRole("button", { name: "Icon button" });
		expect(button).toBeInTheDocument();
	});

	it("should be disabled when disabled prop is true", () => {
		render(<Button disabled>Disabled</Button>);
		
		const button = screen.getByRole("button", { name: "Disabled" });
		expect(button).toBeDisabled();
	});

	it("should render as child component when asChild is true", () => {
		render(
			<Button asChild>
				<a href="/test">Link Button</a>
			</Button>
		);
		
		const link = screen.getByRole("link", { name: "Link Button" });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute("href", "/test");
	});

	it("should apply custom className", () => {
		render(<Button className="custom-class">Custom</Button>);
		
		const button = screen.getByRole("button", { name: "Custom" });
		expect(button).toHaveClass("custom-class");
	});
});
