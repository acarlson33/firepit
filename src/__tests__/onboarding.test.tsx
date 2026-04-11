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

    it("should render continue and skip buttons on first step", () => {
        render(<OnboardingPage />);

        expect(
            screen.getByRole("button", { name: "Continue" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Skip all" }),
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

        const skipButton = screen.getByRole("button", { name: "Skip all" });
        await user.click(skipButton);

        expect(mockPush).toHaveBeenCalledWith("/chat");
    });

    it("should advance to next step when continue is clicked", async () => {
        const user = userEvent.setup();
        render(<OnboardingPage />);

        const displayNameInput = screen.getByLabelText("Display Name *");
        await user.type(displayNameInput, "John Doe");

        const continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        expect(
            screen.getByText("Notification preferences"),
        ).toBeInTheDocument();
    });

    it("should call completeOnboardingAction with form data when submitted on final step", async () => {
        const user = userEvent.setup();
        const mockAction = vi.mocked(completeOnboardingAction);
        mockAction.mockResolvedValue({ success: true });

        render(<OnboardingPage />);

        // Step 1: Fill profile
        const displayNameInput = screen.getByLabelText("Display Name *");
        await user.type(displayNameInput, "John Doe");

        // Click continue to go to step 2
        let continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Step 2: Click continue to go to step 3
        continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Step 3: Click Complete Setup
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

        // Step 1
        const displayNameInput = screen.getByLabelText("Display Name *");
        await user.type(displayNameInput, "John Doe");

        let continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Step 2
        continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Step 3
        const submitButton = screen.getByRole("button", {
            name: "Complete Setup",
        });
        await user.click(submitButton);

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(
                "Profile setup complete!",
            );
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

        // Step 1
        const displayNameInput = screen.getByLabelText("Display Name *");
        await user.type(displayNameInput, "John Doe");

        let continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Step 2
        continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Step 3
        const submitButton = screen.getByRole("button", {
            name: "Complete Setup",
        });
        await user.click(submitButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                "Failed to create profile",
            );
        });
    });

    it("should not advance to next step when display name is empty", async () => {
        const user = userEvent.setup();

        render(<OnboardingPage />);

        // Try to continue without entering display name - form validation should prevent it
        const continueButton = screen.getByRole("button", { name: "Continue" });
        await user.click(continueButton);

        // Should still be on first step (native form validation prevents submit)
        expect(screen.getByText("Welcome to Firepit!")).toBeInTheDocument();
    });
});
