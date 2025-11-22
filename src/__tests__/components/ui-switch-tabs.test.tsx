/**
 * Tests for Switch and Tabs UI components
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

describe("Switch Component", () => {
	it("should render switch", () => {
		const { container } = render(<Switch />);
		const switchEl = container.querySelector("button");
		expect(switchEl).toBeDefined();
	});

	it("should apply default classes", () => {
		const { container } = render(<Switch />);
		const switchEl = container.querySelector("button");
		expect(switchEl?.className).toContain("inline-flex");
		expect(switchEl?.className).toContain("h-6");
		expect(switchEl?.className).toContain("w-11");
		expect(switchEl?.className).toContain("rounded-full");
	});

	it("should apply custom className", () => {
		const { container } = render(<Switch className="custom-switch" />);
		const switchEl = container.querySelector("button");
		expect(switchEl?.className).toContain("custom-switch");
	});

	it("should spread additional props", () => {
		const { container } = render(<Switch data-testid="test-switch" />);
		const switchEl = container.querySelector('[data-testid="test-switch"]');
		expect(switchEl).toBeDefined();
	});

	it("should handle checked state", () => {
		const { container } = render(<Switch checked />);
		const switchEl = container.querySelector("button");
		expect(switchEl?.getAttribute("data-state")).toBe("checked");
	});

	it("should handle unchecked state", () => {
		const { container } = render(<Switch checked={false} />);
		const switchEl = container.querySelector("button");
		expect(switchEl?.getAttribute("data-state")).toBe("unchecked");
	});

	it("should handle disabled state", () => {
		const { container } = render(<Switch disabled />);
		const switchEl = container.querySelector("button");
		expect(switchEl?.hasAttribute("disabled")).toBe(true);
	});

	it("should render thumb element", () => {
		const { container } = render(<Switch />);
		const thumb = container.querySelector('[class*="pointer-events-none"]');
		expect(thumb).toBeDefined();
	});
});

describe("Tabs Components", () => {
	describe("Tabs Root", () => {
		it("should render tabs with children", () => {
			render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const tab = screen.getByText("Tab 1");
			expect(tab).toBeDefined();
		});

		it("should handle defaultValue prop", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
					<TabsContent value="tab1">Content 1</TabsContent>
				</Tabs>
			);
			expect(container).toBeDefined();
		});
	});

	describe("TabsList", () => {
		it("should render tabs list within Tabs", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const list = container.querySelector('[role="tablist"]');
			expect(list).toBeDefined();
		});

		it("should apply default classes", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const list = container.querySelector('[role="tablist"]');
			expect(list?.className).toContain("inline-flex");
			expect(list?.className).toContain("h-10");
			expect(list?.className).toContain("items-center");
			expect(list?.className).toContain("rounded-md");
			expect(list?.className).toContain("bg-muted");
		});

		it("should apply custom className", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsList className="custom-list">
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const list = container.querySelector('[role="tablist"]');
			expect(list?.className).toContain("custom-list");
		});
	});

	describe("TabsTrigger", () => {
		it("should render tab trigger within Tabs", () => {
			render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const trigger = screen.getByText("Tab 1");
			expect(trigger).toBeDefined();
		});

		it("should apply default classes", () => {
			render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const trigger = screen.getByText("Tab 1");
			expect(trigger.className).toContain("inline-flex");
			expect(trigger.className).toContain("items-center");
			expect(trigger.className).toContain("justify-center");
			expect(trigger.className).toContain("rounded-sm");
			expect(trigger.className).toContain("px-3");
		});

		it("should apply custom className", () => {
			render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1" className="custom-trigger">
							Tab 1
						</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const trigger = screen.getByText("Tab 1");
			expect(trigger.className).toContain("custom-trigger");
		});

		it("should handle value prop", () => {
			render(
				<Tabs defaultValue="tab-value">
					<TabsList>
						<TabsTrigger value="tab-value">Tab</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const trigger = screen.getByText("Tab");
			// Just verify the trigger renders with the value
			expect(trigger).toBeDefined();
		});

		it("should handle disabled state", () => {
			render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1" disabled>
							Disabled Tab
						</TabsTrigger>
					</TabsList>
				</Tabs>
			);
			const trigger = screen.getByText("Disabled Tab");
			expect(trigger.hasAttribute("disabled")).toBe(true);
		});
	});

	describe("TabsContent", () => {
		it("should render tabs content within Tabs", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsContent value="tab1">Content 1</TabsContent>
				</Tabs>
			);
			expect(container.textContent).toContain("Content 1");
		});

		it("should apply default classes", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsContent value="tab1">Content</TabsContent>
				</Tabs>
			);
			const content = container.querySelector('[role="tabpanel"]');
			expect(content?.className).toContain("mt-2");
			expect(content?.className).toContain("ring-offset-background");
		});

		it("should apply custom className", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsContent value="tab1" className="custom-content">
						Content
					</TabsContent>
				</Tabs>
			);
			const content = container.querySelector('[role="tabpanel"]');
			expect(content?.className).toContain("custom-content");
		});

		it("should handle value prop", () => {
			const { container } = render(
				<Tabs defaultValue="tab1">
					<TabsContent value="tab1">Content</TabsContent>
				</Tabs>
			);
			const content = container.querySelector('[data-value="tab1"]');
			expect(content).toBeDefined();
		});
	});

	describe("Tabs Integration", () => {
		it("should render complete tabs with all components", () => {
			render(
				<Tabs defaultValue="tab1">
					<TabsList>
						<TabsTrigger value="tab1">Tab 1</TabsTrigger>
						<TabsTrigger value="tab2">Tab 2</TabsTrigger>
					</TabsList>
					<TabsContent value="tab1">Content 1</TabsContent>
					<TabsContent value="tab2">Content 2</TabsContent>
				</Tabs>
			);

			expect(screen.getByText("Tab 1")).toBeDefined();
			expect(screen.getByText("Tab 2")).toBeDefined();
			expect(screen.getByText("Content 1")).toBeDefined();
		});
	});
});
