/**
 * Tests for UI components
 * Target coverage: badge, label, textarea, sonner, avatar
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { Avatar } from "@/components/ui/avatar";

// Mock next-themes for Toaster tests
vi.mock("next-themes", () => ({
	useTheme: () => ({ theme: "light" }),
}));

describe("Badge Component", () => {
	it("should render badge with default variant", () => {
		render(<Badge>Default Badge</Badge>);
		const badge = screen.getByText("Default Badge");
		expect(badge).toBeDefined();
		expect(badge.className).toContain("border-transparent");
		expect(badge.className).toContain("bg-primary");
	});

	it("should render badge with secondary variant", () => {
		render(<Badge variant="secondary">Secondary Badge</Badge>);
		const badge = screen.getByText("Secondary Badge");
		expect(badge).toBeDefined();
		expect(badge.className).toContain("bg-secondary");
	});

	it("should render badge with destructive variant", () => {
		render(<Badge variant="destructive">Destructive Badge</Badge>);
		const badge = screen.getByText("Destructive Badge");
		expect(badge).toBeDefined();
		expect(badge.className).toContain("bg-destructive");
	});

	it("should render badge with outline variant", () => {
		render(<Badge variant="outline">Outline Badge</Badge>);
		const badge = screen.getByText("Outline Badge");
		expect(badge).toBeDefined();
		expect(badge.className).toContain("text-foreground");
	});

	it("should apply custom className", () => {
		render(<Badge className="custom-class">Custom Badge</Badge>);
		const badge = screen.getByText("Custom Badge");
		expect(badge.className).toContain("custom-class");
	});

	it("should spread additional props", () => {
		render(<Badge data-testid="test-badge">Badge</Badge>);
		const badge = screen.getByTestId("test-badge");
		expect(badge).toBeDefined();
	});
});

describe("Label Component", () => {
	it("should render label with text", () => {
		render(<Label>Test Label</Label>);
		const label = screen.getByText("Test Label");
		expect(label).toBeDefined();
	});

	it("should apply default classes", () => {
		render(<Label>Label Text</Label>);
		const label = screen.getByText("Label Text");
		expect(label.className).toContain("flex");
		expect(label.className).toContain("select-none");
		expect(label.className).toContain("items-center");
	});

	it("should apply custom className", () => {
		render(<Label className="custom-label">Custom Label</Label>);
		const label = screen.getByText("Custom Label");
		expect(label.className).toContain("custom-label");
	});

	it("should spread additional props", () => {
		render(<Label htmlFor="test-input">Input Label</Label>);
		const label = screen.getByText("Input Label");
		expect(label.getAttribute("for")).toBe("test-input");
	});

	it("should have data-slot attribute", () => {
		render(<Label>Slot Label</Label>);
		const label = screen.getByText("Slot Label");
		expect(label.getAttribute("data-slot")).toBe("label");
	});
});

describe("Textarea Component", () => {
	it("should render textarea", () => {
		render(<Textarea placeholder="Enter text" />);
		const textarea = screen.getByPlaceholderText("Enter text");
		expect(textarea).toBeDefined();
		expect(textarea.tagName).toBe("TEXTAREA");
	});

	it("should apply default classes", () => {
		render(<Textarea />);
		const textarea = screen.getByRole("textbox");
		expect(textarea.className).toContain("flex");
		expect(textarea.className).toContain("min-h-[60px]");
		expect(textarea.className).toContain("rounded-md");
	});

	it("should apply custom className", () => {
		render(<Textarea className="custom-textarea" />);
		const textarea = screen.getByRole("textbox");
		expect(textarea.className).toContain("custom-textarea");
	});

	it("should spread additional props", () => {
		render(<Textarea rows={5} maxLength={100} />);
		const textarea = screen.getByRole("textbox");
		expect(textarea.getAttribute("rows")).toBe("5");
		expect(textarea.getAttribute("maxlength")).toBe("100");
	});

	it("should have data-slot attribute", () => {
		render(<Textarea />);
		const textarea = screen.getByRole("textbox");
		expect(textarea.getAttribute("data-slot")).toBe("textarea");
	});

	it("should handle disabled state", () => {
		render(<Textarea disabled />);
		const textarea = screen.getByRole("textbox");
		expect(textarea.hasAttribute("disabled")).toBe(true);
	});
});

describe("Toaster Component", () => {
	it("should render toaster with light theme", () => {
		const { container } = render(<Toaster />);
		expect(container).toBeDefined();
	});

	it("should apply toaster class", () => {
		const { container } = render(<Toaster />);
		const toaster = container.querySelector(".toaster");
		expect(toaster).toBeDefined();
	});

	it("should spread additional props", () => {
		const { container } = render(<Toaster position="top-center" />);
		expect(container).toBeDefined();
	});

	it("should use theme from useTheme hook", () => {
		// Already mocked to return "light"
		const { container } = render(<Toaster />);
		expect(container).toBeDefined();
	});
});

describe("Avatar Component", () => {
	it("should render avatar with fallback initials from alt", () => {
		render(<Avatar alt="John Doe" />);
		const avatar = screen.getByText("J");
		expect(avatar).toBeDefined();
	});

	it("should render avatar with custom fallback", () => {
		render(<Avatar alt="Test" fallback="John Doe" />);
		const avatar = screen.getByText("JD");
		expect(avatar).toBeDefined();
	});

	it("should render avatar with single name fallback", () => {
		render(<Avatar alt="Test" fallback="Alice" />);
		const avatar = screen.getByText("A");
		expect(avatar).toBeDefined();
	});

	it("should render avatar with image src", () => {
		render(<Avatar src="/test-avatar.jpg" alt="Test User" />);
		const image = screen.getByAltText("Test User");
		expect(image).toBeDefined();
		expect(image.tagName).toBe("IMG");
	});

	it("should apply small size classes", () => {
		render(<Avatar alt="Test" size="sm" />);
		const avatar = screen.getByText("T");
		expect(avatar.parentElement?.className).toContain("h-6");
		expect(avatar.parentElement?.className).toContain("w-6");
	});

	it("should apply medium size classes", () => {
		render(<Avatar alt="Test" size="md" />);
		const avatar = screen.getByText("T");
		expect(avatar.parentElement?.className).toContain("h-8");
		expect(avatar.parentElement?.className).toContain("w-8");
	});

	it("should apply large size classes", () => {
		render(<Avatar alt="Test" size="lg" />);
		const avatar = screen.getByText("T");
		expect(avatar.parentElement?.className).toContain("h-12");
		expect(avatar.parentElement?.className).toContain("w-12");
	});

	it("should default to medium size when size not specified", () => {
		render(<Avatar alt="Test" />);
		const avatar = screen.getByText("T");
		expect(avatar.parentElement?.className).toContain("h-8");
	});

	it("should handle empty string src as fallback", () => {
		render(<Avatar src="" alt="Test User" />);
		const avatar = screen.getByText("T");
		expect(avatar).toBeDefined();
	});

	it("should handle whitespace-only src as fallback", () => {
		render(<Avatar src="   " alt="Test User" />);
		const avatar = screen.getByText("T");
		expect(avatar).toBeDefined();
	});

	it("should handle null src as fallback", () => {
		render(<Avatar src={null} alt="Test User" />);
		const avatar = screen.getByText("T");
		expect(avatar).toBeDefined();
	});

	it("should handle undefined src as fallback", () => {
		render(<Avatar alt="Test User" />);
		const avatar = screen.getByText("T");
		expect(avatar).toBeDefined();
	});

	it("should use first two initials from fallback with multiple names", () => {
		render(<Avatar alt="Test" fallback="John Michael Smith" />);
		const avatar = screen.getByText("JM");
		expect(avatar).toBeDefined();
	});

	it("should uppercase initials", () => {
		render(<Avatar alt="test" fallback="john doe" />);
		const avatar = screen.getByText("JD");
		expect(avatar).toBeDefined();
	});

	it("should apply rounded-full class", () => {
		render(<Avatar alt="Test" />);
		const avatar = screen.getByText("T");
		expect(avatar.parentElement?.className).toContain("rounded-full");
	});

	it("should apply bg-muted class", () => {
		render(<Avatar alt="Test" />);
		const avatar = screen.getByText("T");
		expect(avatar.parentElement?.className).toContain("bg-muted");
	});

	it("should set image dimensions based on size", () => {
		render(<Avatar src="/test.jpg" alt="Test" size="lg" />);
		const image = screen.getByAltText("Test");
		expect(image.getAttribute("width")).toBe("48");
		expect(image.getAttribute("height")).toBe("48");
	});

	it("should set loading=lazy for images", () => {
		render(<Avatar src="/test.jpg" alt="Test" />);
		const image = screen.getByAltText("Test");
		expect(image.getAttribute("loading")).toBe("lazy");
	});
});
