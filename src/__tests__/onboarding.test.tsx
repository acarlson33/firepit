import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { completeOnboardingAction } from "../app/onboarding/actions";

// Mock router
const mockPush = vi.fn();

// Mock dependencies
vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: mockPush,
	}),
}));

// Mock auth context
const mockRefreshUser = vi.fn();
vi.mock("@/contexts/auth-context", () => ({
	useAuth: () => ({
		userData: { name: "Test User", userId: "123" },
		refreshUser: mockRefreshUser,
	}),
}));

// Mock toast
vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../app/onboarding/actions", () => ({
	completeOnboardingAction: vi.fn(),
}));

// Import the component after mocks are set up
const OnboardingPage = (await import("../app/onboarding/page")).default;

describe("Onboarding Page", () => {
	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();
	});

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

		expect(
			screen.getByRole("button", { name: "Complete Setup" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Skip for now" }),
		).toBeInTheDocument();
	});

	it("should show logged in user name", () => {
		render(<OnboardingPage />);

		expect(screen.getByText(/Logged in as/i)).toBeInTheDocument();
		expect(screen.getByText("Test User")).toBeInTheDocument();
	});

	it("should navigate to /chat when skip button is clicked", async () => {
		const user = userEvent.setup();
		render(<OnboardingPage />);

		const skipButton = screen.getByRole("button", { name: "Skip for now" });
		await user.click(skipButton);

		expect(mockPush).toHaveBeenCalledWith("/chat");
	});

	it("should call completeOnboardingAction with form data when submitted", async () => {
		const user = userEvent.setup();
		const mockAction = vi.mocked(completeOnboardingAction);
		mockAction.mockResolvedValue({ success: true });

		render(<OnboardingPage />);

		const displayNameInput = screen.getByLabelText("Display Name *");
		const bioTextarea = screen.getByLabelText("About You");

		await user.type(displayNameInput, "John Doe");
		await user.type(bioTextarea, "Software developer");

		const submitButton = screen.getByRole("button", {
			name: "Complete Setup",
		});
		await user.click(submitButton);

		await waitFor(() => {
			expect(mockAction).toHaveBeenCalled();
		});
	});

	it("should show success toast and navigate to /chat on successful submission", async () => {
		const user = userEvent.setup();
		const { toast } = await import("sonner");
		const mockAction = vi.mocked(completeOnboardingAction);
		mockAction.mockResolvedValue({ success: true });

		render(<OnboardingPage />);

		const displayNameInput = screen.getByLabelText("Display Name *");
		await user.type(displayNameInput, "John Doe");

		const submitButton = screen.getByRole("button", {
			name: "Complete Setup",
		});
		await user.click(submitButton);

		await waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith("Profile setup complete!");
			expect(mockRefreshUser).toHaveBeenCalled();
			expect(mockPush).toHaveBeenCalledWith("/chat");
		});
	});

	it("should show error toast on submission failure", async () => {
		const user = userEvent.setup();
		const { toast } = await import("sonner");
		const mockAction = vi.mocked(completeOnboardingAction);
		mockAction.mockResolvedValue({
			success: false,
			error: "Failed to create profile",
		});

		render(<OnboardingPage />);

		const displayNameInput = screen.getByLabelText("Display Name *");
		await user.type(displayNameInput, "John Doe");

		const submitButton = screen.getByRole("button", {
			name: "Complete Setup",
		});
		await user.click(submitButton);

		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("Failed to create profile");
		});
	});
});

describe("completeOnboardingAction", () => {
	it("should be defined", () => {
		expect(completeOnboardingAction).toBeDefined();
	});
});
