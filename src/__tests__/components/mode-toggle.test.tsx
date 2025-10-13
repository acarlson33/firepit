import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModeToggle } from "../../components/mode-toggle";

// Mock next-themes
const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
	useTheme: () => ({
		setTheme: mockSetTheme,
		theme: "light",
	}),
	ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("ModeToggle Component", () => {
	it("should render the toggle button", () => {
		render(<ModeToggle />);
		
		const button = screen.getByRole("button", { name: /toggle theme/i });
		expect(button).toBeInTheDocument();
	});

	it("should show theme options when clicked", async () => {
		const user = userEvent.setup();
		render(<ModeToggle />);
		
		const button = screen.getByRole("button", { name: /toggle theme/i });
		await user.click(button);
		
		expect(screen.getByText("Light")).toBeInTheDocument();
		expect(screen.getByText("Dark")).toBeInTheDocument();
		expect(screen.getByText("System")).toBeInTheDocument();
	});

	it("should call setTheme with 'light' when Light is clicked", async () => {
		const user = userEvent.setup();
		render(<ModeToggle />);
		
		const button = screen.getByRole("button", { name: /toggle theme/i });
		await user.click(button);
		
		const lightOption = screen.getByText("Light");
		await user.click(lightOption);
		
		expect(mockSetTheme).toHaveBeenCalledWith("light");
	});

	it("should call setTheme with 'dark' when Dark is clicked", async () => {
		const user = userEvent.setup();
		render(<ModeToggle />);
		
		const button = screen.getByRole("button", { name: /toggle theme/i });
		await user.click(button);
		
		const darkOption = screen.getByText("Dark");
		await user.click(darkOption);
		
		expect(mockSetTheme).toHaveBeenCalledWith("dark");
	});

	it("should call setTheme with 'system' when System is clicked", async () => {
		const user = userEvent.setup();
		render(<ModeToggle />);
		
		const button = screen.getByRole("button", { name: /toggle theme/i });
		await user.click(button);
		
		const systemOption = screen.getByText("System");
		await user.click(systemOption);
		
		expect(mockSetTheme).toHaveBeenCalledWith("system");
	});

	it("should have sun and moon icons", () => {
		const { container } = render(<ModeToggle />);
		
		// Check for SVG elements (icons)
		const svgs = container.querySelectorAll("svg");
		expect(svgs.length).toBeGreaterThanOrEqual(2);
	});

	it("should have accessible label", () => {
		render(<ModeToggle />);
		
		const srOnly = screen.getByText("Toggle theme");
		expect(srOnly).toBeInTheDocument();
		expect(srOnly).toHaveClass("sr-only");
	});
});
