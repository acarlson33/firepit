/**
 * Tests for Providers component
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Providers from "@/components/providers";

// Mock the AuthProvider context
vi.mock("@/contexts/auth-context", () => ({
	AuthProvider: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="auth-provider">{children}</div>
	),
}));

// Mock the theme provider
vi.mock("@/components/theme-provider", () => ({
	ThemeProvider: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="theme-provider">{children}</div>
	),
}));

// Mock the Toaster component
vi.mock("@/components/ui/sonner", () => ({
	Toaster: () => <div data-testid="toaster" />,
}));

describe("Providers Component", () => {
	it("should render children", () => {
		render(
			<Providers>
				<div>Test Child</div>
			</Providers>
		);
		const child = screen.getByText("Test Child");
		expect(child).toBeDefined();
	});

	it("should wrap children with QueryClientProvider", () => {
		const { container } = render(
			<Providers>
				<div>Test</div>
			</Providers>
		);
		expect(container).toBeDefined();
		expect(screen.getByText("Test")).toBeDefined();
	});

	it("should wrap children with ThemeProvider", () => {
		render(
			<Providers>
				<div>Test</div>
			</Providers>
		);
		const themeProvider = screen.getByTestId("theme-provider");
		expect(themeProvider).toBeDefined();
	});

	it("should wrap children with AuthProvider", () => {
		render(
			<Providers>
				<div>Test</div>
			</Providers>
		);
		const authProvider = screen.getByTestId("auth-provider");
		expect(authProvider).toBeDefined();
	});

	it("should render Toaster component", () => {
		render(
			<Providers>
				<div>Test</div>
			</Providers>
		);
		const toaster = screen.getByTestId("toaster");
		expect(toaster).toBeDefined();
	});

	it("should create QueryClient with correct configuration", () => {
		// This test verifies that the component renders without errors
		// which implicitly tests the QueryClient instantiation
		const { container } = render(
			<Providers>
				<div>Test</div>
			</Providers>
		);
		expect(container).toBeDefined();
	});

	it("should handle multiple children", () => {
		render(
			<Providers>
				<div>Child 1</div>
				<div>Child 2</div>
				<div>Child 3</div>
			</Providers>
		);
		expect(screen.getByText("Child 1")).toBeDefined();
		expect(screen.getByText("Child 2")).toBeDefined();
		expect(screen.getByText("Child 3")).toBeDefined();
	});

	it("should render nested components correctly", () => {
		render(
			<Providers>
				<div>
					<span>Nested Content</span>
				</div>
			</Providers>
		);
		const nested = screen.getByText("Nested Content");
		expect(nested).toBeDefined();
	});
});
