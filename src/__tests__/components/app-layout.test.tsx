import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "../../components/app-layout";

// Mock Next.js router
vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

// Mock auth context
vi.mock("@/contexts/auth-context", () => ({
	useAuth: () => ({
		userData: null,
		userStatus: null,
		loading: false,
		setUserData: vi.fn(),
		updateUserStatus: vi.fn(),
	}),
}));

// Mock theme provider
vi.mock("next-themes", () => ({
	useTheme: () => ({
		theme: "light",
		setTheme: vi.fn(),
	}),
}));

// Mock fetch for custom emojis
global.fetch = vi.fn((url: string | URL) => {
	if (typeof url === "string" && url.includes("/api/custom-emojis")) {
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve([]),
		} as Response);
	}
	return Promise.resolve({
		ok: true,
		json: () => Promise.resolve({}),
	} as Response);
});

// Helper to render with QueryClientProvider
function renderWithQueryClient(component: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			{component}
		</QueryClientProvider>,
	);
}

describe("AppLayout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render header with search button", () => {
		renderWithQueryClient(
			<AppLayout>
				<div>Test Content</div>
			</AppLayout>,
		);

		expect(screen.getByLabelText("Search messages")).toBeInTheDocument();
		expect(screen.getByText("Test Content")).toBeInTheDocument();
	});

	it("should open search dialog when search button is clicked", async () => {
		renderWithQueryClient(
			<AppLayout>
				<div>Test Content</div>
			</AppLayout>,
		);

		const searchButton = screen.getByLabelText("Search messages");
		await userEvent.click(searchButton);

		// Search dialog should be visible
		expect(screen.getByText("Search Messages")).toBeInTheDocument();
	});

	it("should handle keyboard shortcut Ctrl+K", async () => {
		renderWithQueryClient(
			<AppLayout>
				<div>Test Content</div>
			</AppLayout>,
		);

		// Trigger Ctrl+K
		await userEvent.keyboard("{Control>}k{/Control}");

		// Search dialog should be visible
		expect(screen.getByText("Search Messages")).toBeInTheDocument();
	});

	it("should close search dialog when onOpenChange is called with false", async () => {
		renderWithQueryClient(
			<AppLayout>
				<div>Test Content</div>
			</AppLayout>,
		);

		// Open search
		const searchButton = screen.getByLabelText("Search messages");
		await userEvent.click(searchButton);

		expect(screen.getByText("Search Messages")).toBeInTheDocument();

		// Close search by pressing Escape
		await userEvent.keyboard("{Escape}");

		// Search dialog should be closed
		expect(screen.queryByText("Search Messages")).not.toBeInTheDocument();
	});
});
