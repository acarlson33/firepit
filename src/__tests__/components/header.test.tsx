import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Header from "../../components/header";

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

// Helper to render with QueryClientProvider
function renderWithQueryClient(component: React.ReactElement<any>) {
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

describe("Header", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render header without search icon when onSearchClick is not provided", () => {
		renderWithQueryClient(<Header />);

		expect(screen.getByText("firepit")).toBeInTheDocument();
		expect(screen.queryByLabelText("Search messages")).not.toBeInTheDocument();
	});

	it("should render search icon when onSearchClick is provided", () => {
		const onSearchClick = vi.fn();
		renderWithQueryClient(<Header onSearchClick={onSearchClick} />);

		expect(screen.getByLabelText("Search messages")).toBeInTheDocument();
	});

	it("should call onSearchClick when search button is clicked", async () => {
		const onSearchClick = vi.fn();
		renderWithQueryClient(<Header onSearchClick={onSearchClick} />);

		const searchButton = screen.getByLabelText("Search messages");
		await userEvent.click(searchButton);

		expect(onSearchClick).toHaveBeenCalledTimes(1);
	});

	it("should have correct tooltip for search button", () => {
		const onSearchClick = vi.fn();
		renderWithQueryClient(<Header onSearchClick={onSearchClick} />);

		const searchButton = screen.getByLabelText("Search messages");
		expect(searchButton).toHaveAttribute("title", "Search messages (Ctrl+K)");
	});
});
