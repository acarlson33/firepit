import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "../../components/ui/input";

describe("Input Component", () => {
	it("should render input field", () => {
		render(<Input placeholder="Enter text" />);
		
		expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
	});

	it("should accept text input", async () => {
		const user = userEvent.setup();
		render(<Input placeholder="Enter text" />);
		
		const input = screen.getByPlaceholderText("Enter text");
		await user.type(input, "Hello World");
		
		expect(input).toHaveValue("Hello World");
	});

	it("should handle different input types", () => {
		const { rerender } = render(<Input type="email" placeholder="Email" />);
		let input = screen.getByPlaceholderText("Email");
		expect(input).toHaveAttribute("type", "email");

		rerender(<Input type="password" placeholder="Password" />);
		input = screen.getByPlaceholderText("Password");
		expect(input).toHaveAttribute("type", "password");

		rerender(<Input type="number" placeholder="Number" />);
		input = screen.getByPlaceholderText("Number");
		expect(input).toHaveAttribute("type", "number");
	});

	it("should be disabled when disabled prop is true", () => {
		render(<Input disabled placeholder="Disabled input" />);
		
		const input = screen.getByPlaceholderText("Disabled input");
		expect(input).toBeDisabled();
	});

	it("should have default value", () => {
		render(<Input defaultValue="Default text" />);
		
		const input = screen.getByDisplayValue("Default text");
		expect(input).toHaveValue("Default text");
	});

	it("should apply custom className", () => {
		render(<Input className="custom-class" placeholder="Custom" />);
		
		const input = screen.getByPlaceholderText("Custom");
		expect(input).toHaveClass("custom-class");
	});

	it("should handle onChange event", async () => {
		const user = userEvent.setup();
		let value = "";
		const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
			value = e.target.value;
		};
		
		render(<Input onChange={handleChange} placeholder="Type here" />);
		
		const input = screen.getByPlaceholderText("Type here");
		await user.type(input, "Test");
		
		expect(value).toBe("Test");
	});

	it("should be required when required prop is true", () => {
		render(<Input required placeholder="Required input" />);
		
		const input = screen.getByPlaceholderText("Required input");
		expect(input).toBeRequired();
	});

	it("should have aria-label for accessibility", () => {
		render(<Input aria-label="Username input" placeholder="Username" />);
		
		const input = screen.getByLabelText("Username input");
		expect(input).toBeInTheDocument();
	});
});
