import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusIndicator } from "../../components/status-indicator";

describe("StatusIndicator Component", () => {
	describe("Status Colors", () => {
		it("should render online status with green color", () => {
			const { container } = render(<StatusIndicator status="online" />);
			const indicator = container.querySelector("span[title='Online']");
			
			expect(indicator).toHaveClass("bg-green-500");
			expect(indicator).toHaveClass("animate-pulse");
		});

		it("should render away status with yellow color", () => {
			const { container } = render(<StatusIndicator status="away" />);
			const indicator = container.querySelector("span[title='Away']");
			
			expect(indicator).toHaveClass("bg-yellow-500");
			expect(indicator).not.toHaveClass("animate-pulse");
		});

		it("should render busy status with red color", () => {
			const { container } = render(<StatusIndicator status="busy" />);
			const indicator = container.querySelector("span[title='Busy']");
			
			expect(indicator).toHaveClass("bg-red-500");
		});

		it("should render offline status with gray color", () => {
			const { container } = render(<StatusIndicator status="offline" />);
			const indicator = container.querySelector("span[title='Offline']");
			
			expect(indicator).toHaveClass("bg-gray-400");
		});
	});

	describe("Sizes", () => {
		it("should render small size by default as md", () => {
			const { container } = render(<StatusIndicator status="online" />);
			const indicator = container.querySelector("span[title='Online']");
			
			expect(indicator).toHaveClass("size-3");
		});

		it("should render small size", () => {
			const { container } = render(<StatusIndicator status="online" size="sm" />);
			const indicator = container.querySelector("span[title='Online']");
			
			expect(indicator).toHaveClass("size-2");
		});

		it("should render medium size", () => {
			const { container } = render(<StatusIndicator status="online" size="md" />);
			const indicator = container.querySelector("span[title='Online']");
			
			expect(indicator).toHaveClass("size-3");
		});

		it("should render large size", () => {
			const { container } = render(<StatusIndicator status="online" size="lg" />);
			const indicator = container.querySelector("span[title='Online']");
			
			expect(indicator).toHaveClass("size-4");
		});
	});

	describe("Labels", () => {
		it("should not show label by default", () => {
			render(<StatusIndicator status="online" />);
			
			expect(screen.queryByText("Online")).not.toBeInTheDocument();
		});

		it("should show label when showLabel is true", () => {
			render(<StatusIndicator status="online" showLabel />);
			
			expect(screen.getByText("Online")).toBeInTheDocument();
		});

		it("should show correct label for away status", () => {
			render(<StatusIndicator status="away" showLabel />);
			
			expect(screen.getByText("Away")).toBeInTheDocument();
		});

		it("should show correct label for busy status", () => {
			render(<StatusIndicator status="busy" showLabel />);
			
			expect(screen.getByText("Busy")).toBeInTheDocument();
		});

		it("should show correct label for offline status", () => {
			render(<StatusIndicator status="offline" showLabel />);
			
			expect(screen.getByText("Offline")).toBeInTheDocument();
		});
	});

	describe("Custom Classes", () => {
		it("should apply custom className", () => {
			const { container } = render(
				<StatusIndicator status="online" className="custom-class" />
			);
			const wrapper = container.firstChild;
			
			expect(wrapper).toHaveClass("custom-class");
		});

		it("should merge custom className with default classes", () => {
			const { container } = render(
				<StatusIndicator status="online" className="custom-class" />
			);
			const wrapper = container.firstChild;
			
			expect(wrapper).toHaveClass("flex", "items-center", "gap-1.5", "custom-class");
		});
	});

	describe("Accessibility", () => {
		it("should have title attribute for screen readers", () => {
			const { container } = render(<StatusIndicator status="online" />);
			const indicator = container.querySelector("span[title='Online']");
			
			expect(indicator).toHaveAttribute("title", "Online");
		});

		it("should have correct title for each status", () => {
			const statuses: Array<"online" | "away" | "busy" | "offline"> = ["online", "away", "busy", "offline"];
			const labels = ["Online", "Away", "Busy", "Offline"];

			statuses.forEach((status, index) => {
				const { container } = render(<StatusIndicator status={status} />);
				const indicator = container.querySelector(`span[title='${labels[index]}']`);
				
				expect(indicator).toHaveAttribute("title", labels[index]);
			});
		});
	});
});
