import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Header from "../../components/header";

const authState = vi.hoisted(() => ({
    userData: null as {
        userId: string;
        name: string;
        email: string;
        roles: { isAdmin: boolean; isModerator: boolean };
    } | null,
    userStatus: null,
    loading: false,
    setUserData: vi.fn(),
    updateUserStatus: vi.fn(),
}));

const mockUseFriends = vi.hoisted(() => vi.fn());
const mockUseDeveloperMode = vi.hoisted(() => vi.fn());

// Mock Next.js router
vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
}));

// Mock auth context
vi.mock("@/contexts/auth-context", () => ({
    useAuth: () => authState,
}));

vi.mock("@/hooks/useFriends", () => ({
    useFriends: (enabled: boolean) => mockUseFriends(enabled),
}));

vi.mock("@/hooks/useDeveloperMode", () => ({
    useDeveloperMode: (userId: string | null) => mockUseDeveloperMode(userId),
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
        authState.userData = null;
        authState.loading = false;
        mockUseFriends.mockReturnValue({
            incoming: [],
            loading: false,
        });
        mockUseDeveloperMode.mockReturnValue({
            developerMode: true,
            isLoaded: true,
            setDeveloperMode: vi.fn(),
        });
    });

    it("should render header without search icon when onSearchClick is not provided", () => {
        renderWithQueryClient(<Header />);

        expect(screen.getByText("firepit")).toBeInTheDocument();
        expect(
            screen.queryByLabelText("Search messages"),
        ).not.toBeInTheDocument();
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
        expect(searchButton).toHaveAttribute(
            "title",
            "Search messages (Ctrl+K)",
        );
    });

    it("should have consistent min-height classes to prevent CLS", () => {
        // Render header in non-loading state
        const { container } = renderWithQueryClient(<Header />);
        const header = container.querySelector("header");

        // Check that header has min-height classes
        expect(header).toHaveClass("min-h-18.25");
        expect(header).toHaveClass("sm:min-h-20.25");
    });

    it("shows the friends nav badge and add friend button for authenticated users", () => {
        authState.userData = {
            userId: "user-1",
            name: "August",
            email: "august@example.com",
            roles: {
                isAdmin: false,
                isModerator: false,
            },
        };
        mockUseFriends.mockReturnValue({
            incoming: [{ friendship: { $id: "f-1" }, user: { userId: "u-2" } }],
            loading: false,
        });

        renderWithQueryClient(<Header />);

        expect(
            screen.getByRole("link", { name: /friends/i }),
        ).toBeInTheDocument();
        expect(screen.getByText("1")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /add friend/i }),
        ).toHaveAttribute("href", "/chat?compose=1");
    });

    it("hides the docs link for authenticated users when developer mode is disabled", () => {
        authState.userData = {
            userId: "user-1",
            name: "August",
            email: "august@example.com",
            roles: {
                isAdmin: false,
                isModerator: false,
            },
        };
        mockUseDeveloperMode.mockReturnValue({
            developerMode: false,
            isLoaded: true,
            setDeveloperMode: vi.fn(),
        });

        renderWithQueryClient(<Header />);

        expect(
            screen.queryByRole("link", { name: "Docs" }),
        ).not.toBeInTheDocument();
    });
});
