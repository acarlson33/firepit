import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { completeOnboardingAction } from "../app/onboarding/actions";

// Mock dependencies
vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

vi.mock("@/contexts/auth-context", () => ({
	useAuth: () => ({
		userData: { name: "Test User", userId: "123" },
		refreshUser: vi.fn(),
	}),
}));

vi.mock("../app/onboarding/actions", () => ({
	completeOnboardingAction: vi.fn(),
}));

// Import the component after mocks are set up
const OnboardingPage = (await import("../app/onboarding/page")).default;

describe("Onboarding Page", () => {
	it("should render onboarding form with welcome message", () => {
		render(<OnboardingPage />);

		expect(screen.getByText("Welcome to Firepit!")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Let's set up your profile so others can get to know you better.",
			),
		).toBeInTheDocument();
	});

	it("should render display name input", () => {
		render(<OnboardingPage />);

		const displayNameInput = screen.getByLabelText("Display Name *");
		expect(displayNameInput).toBeInTheDocument();
		expect(displayNameInput).toHaveAttribute("required");
	});

	it("should render bio textarea", () => {
		render(<OnboardingPage />);

		const bioTextarea = screen.getByLabelText("About You");
		expect(bioTextarea).toBeInTheDocument();
		expect(bioTextarea).not.toHaveAttribute("required");
	});

	it("should render submit and skip buttons", () => {
		render(<OnboardingPage />);

		expect(screen.getByRole("button", { name: "Complete Setup" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();
	});

	it("should show logged in user name", () => {
		render(<OnboardingPage />);

		expect(screen.getByText(/Logged in as/i)).toBeInTheDocument();
		expect(screen.getByText("Test User")).toBeInTheDocument();
	});
});

describe("completeOnboardingAction", () => {
	it("should be defined", () => {
		expect(completeOnboardingAction).toBeDefined();
	});
});
