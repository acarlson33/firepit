import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import Loader from "../../components/loader";

describe("Loader Component", () => {
	it("should render loader spinner", () => {
		const { container } = render(<Loader />);
		
		// Check for the spinner element (SVG with aria-hidden)
		const spinner = container.querySelector("svg");
		expect(spinner).toBeInTheDocument();
		expect(spinner).toHaveClass("lucide-loader-circle");
	});

	it("should have animate-spin class", () => {
		const { container } = render(<Loader />);
		const svg = container.querySelector("svg");
		
		expect(svg).toHaveClass("animate-spin");
	});

	it("should be centered", () => {
		const { container } = render(<Loader />);
		const wrapper = container.firstChild;
		
		expect(wrapper).toHaveClass("flex", "h-full", "items-center", "justify-center");
	});
});
