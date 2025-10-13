import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Checkbox } from "../../components/ui/checkbox";

describe("Checkbox Component", () => {
	it("should render checkbox", () => {
		render(<Checkbox aria-label="Accept terms" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
		expect(checkbox).toBeInTheDocument();
	});

	it("should be unchecked by default", () => {
		render(<Checkbox aria-label="Test checkbox" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Test checkbox" });
		expect(checkbox).not.toBeChecked();
	});

	it("should be checked when clicked", async () => {
		const user = userEvent.setup();
		render(<Checkbox aria-label="Test checkbox" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Test checkbox" });
		await user.click(checkbox);
		
		expect(checkbox).toBeChecked();
	});

	it("should toggle checked state", async () => {
		const user = userEvent.setup();
		render(<Checkbox aria-label="Toggle checkbox" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Toggle checkbox" });
		
		await user.click(checkbox);
		expect(checkbox).toBeChecked();
		
		await user.click(checkbox);
		expect(checkbox).not.toBeChecked();
	});

	it("should be disabled when disabled prop is true", () => {
		render(<Checkbox disabled aria-label="Disabled checkbox" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Disabled checkbox" });
		expect(checkbox).toBeDisabled();
	});

	it("should not be clickable when disabled", async () => {
		const user = userEvent.setup();
		render(<Checkbox disabled aria-label="Disabled checkbox" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Disabled checkbox" });
		await user.click(checkbox);
		
		expect(checkbox).not.toBeChecked();
	});

	it("should have default checked state", () => {
		render(<Checkbox defaultChecked aria-label="Default checked" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Default checked" });
		expect(checkbox).toBeChecked();
	});

	it("should call onCheckedChange when toggled", async () => {
		const user = userEvent.setup();
		let checked = false;
		const handleChange = (value: boolean) => {
			checked = value;
		};
		
		render(
			<Checkbox 
				onCheckedChange={handleChange}
				aria-label="Controlled checkbox"
			/>
		);
		
		const checkbox = screen.getByRole("checkbox", { name: "Controlled checkbox" });
		await user.click(checkbox);
		
		expect(checked).toBe(true);
	});

	it("should apply custom className", () => {
		render(<Checkbox className="custom-class" aria-label="Custom checkbox" />);
		
		const checkbox = screen.getByRole("checkbox", { name: "Custom checkbox" });
		expect(checkbox).toHaveClass("custom-class");
	});

	it("should work with label element", () => {
		render(
			<div>
				<label htmlFor="terms">
					Accept terms and conditions
					<Checkbox id="terms" />
				</label>
			</div>
		);
		
		const checkbox = screen.getByRole("checkbox");
		expect(checkbox).toBeInTheDocument();
		expect(checkbox).toHaveAttribute("id", "terms");
	});
});
