/// <reference lib="dom" />

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteManagerDialog } from "@/app/chat/components/InviteManagerDialog";
import { CreateInviteDialog } from "@/app/chat/components/CreateInviteDialog";
import { toast } from "sonner";

// Store original fetch
const originalFetch = global.fetch;
const getMockFetch = () => global.fetch as ReturnType<typeof vi.fn>;
const testGlobal = globalThis as {
    window?: Partial<Window>;
    navigator?: Partial<Navigator>;
};

function createMockResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as Response;
}

function getFetchBodyPayload<T = unknown>(callIndex = 0): T {
    const options = getMockFetch().mock.calls[callIndex]?.[1] as
        | { body?: string }
        | undefined;
    const payloadText = typeof options?.body === "string" ? options.body : "{}";
    return JSON.parse(payloadText) as T;
}

// Mock window and navigator for browser APIs
if (!testGlobal.window) {
    testGlobal.window = {};
}
if (!testGlobal.navigator) {
    testGlobal.navigator = {};
}

// Set up location mock
Object.defineProperty(testGlobal.window, "location", {
    value: { origin: "http://localhost:3000" },
    writable: true,
});

// Set up clipboard mock
Object.defineProperty(testGlobal.navigator, "clipboard", {
    value: {
        writeText: vi.fn(() => Promise.resolve()),
    },
    writable: true,
});

// Mock toast - need to use a factory function to access vi
vi.mock("sonner", () => {
    const mockToastFn = {
        success: vi.fn(),
        error: vi.fn(),
    };
    return {
        toast: mockToastFn,
    };
});

describe("InviteManagerDialog Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn(async () => createMockResponse([]));
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("should render dialog when open", () => {
        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        expect(screen.getByText("Server Invites")).toBeInTheDocument();
    });

    it("should not render when closed", () => {
        render(
            <InviteManagerDialog
                open={false}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should load and display invites", async () => {
        const mockInvites = [
            {
                $id: "invite-1",
                code: "abc123xyz7",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 5,
                maxUses: 10,
                expiresAt: new Date(Date.now() + 3600000).toISOString(),
                temporary: false,
                $createdAt: new Date().toISOString(),
            },
            {
                $id: "invite-2",
                code: "def456uvw8",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 0,
                maxUses: null,
                temporary: false,
                $createdAt: new Date().toISOString(),
            },
        ];

        getMockFetch().mockResolvedValueOnce(createMockResponse(mockInvites));

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("abc123xyz7")).toBeInTheDocument();
            expect(screen.getByText("def456uvw8")).toBeInTheDocument();
        });

        expect(global.fetch).toHaveBeenCalledWith(
            "/api/servers/server-1/invites",
            expect.objectContaining({
                signal: expect.anything(),
            }),
        );
    });

    it("should display loading state while request is pending", async () => {
        getMockFetch().mockImplementationOnce(
            () =>
                new Promise(() => {
                    // Never resolves to keep pending state visible.
                }),
        );

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        await waitFor(() => {
            expect(getMockFetch()).toHaveBeenCalledWith(
                "/api/servers/server-1/invites",
                expect.objectContaining({
                    signal: expect.anything(),
                }),
            );
            expect(screen.getByRole("status")).toBeInTheDocument();
        });

        expect(screen.queryByText("No invites yet")).not.toBeInTheDocument();
    });

    it("should show usage information correctly", async () => {
        const mockInvites = [
            {
                $id: "invite-1",
                code: "limited123",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 8,
                maxUses: 10,
                temporary: false,
                $createdAt: new Date().toISOString(),
            },
            {
                $id: "invite-2",
                code: "unlimited1",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 100,
                maxUses: null,
                temporary: false,
                $createdAt: new Date().toISOString(),
            },
        ];

        getMockFetch().mockResolvedValueOnce(createMockResponse(mockInvites));

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("8/10 uses")).toBeInTheDocument();
            expect(screen.getByText("100 uses")).toBeInTheDocument();
        });
    });

    it("should call onCreateInvite when create button is clicked", async () => {
        const mockOnCreate = vi.fn();

        getMockFetch().mockResolvedValueOnce(createMockResponse([]));

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={mockOnCreate}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Create Invite")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByText("Create Invite"));
        expect(mockOnCreate).toHaveBeenCalled();
    });

    it("should copy invite code to clipboard", async () => {
        const mockInvites = [
            {
                $id: "invite-1",
                code: "copytest123",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 0,
                maxUses: null,
                temporary: false,
                $createdAt: new Date().toISOString(),
            },
        ];

        getMockFetch().mockResolvedValueOnce(createMockResponse(mockInvites));

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("copytest123")).toBeInTheDocument();
        });

        const copyButton = screen.getByRole("button", {
            name: /copy invite copytest123/i,
        });
        await userEvent.click(copyButton);

        await waitFor(() => {
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                expect.stringContaining("copytest123"),
            );
        });
    });

    it("should revoke invite when delete button is clicked", async () => {
        const mockInvites = [
            {
                $id: "invite-1",
                code: "delete123",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 0,
                maxUses: null,
                temporary: false,
                $createdAt: new Date().toISOString(),
            },
        ];

        getMockFetch()
            .mockResolvedValueOnce(createMockResponse(mockInvites))
            .mockResolvedValueOnce(createMockResponse({ success: true }))
            .mockResolvedValueOnce(createMockResponse([]));

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("delete123")).toBeInTheDocument();
        });

        const deleteButton = screen.getByRole("button", {
            name: /delete invite delete123/i,
        });
        await userEvent.click(deleteButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/invites/delete123",
                expect.objectContaining({
                    method: "DELETE",
                }),
            );
        });
    });

    it("should handle error when loading invites fails", async () => {
        getMockFetch().mockRejectedValueOnce(
            new Error("Failed to load invites"),
        );

        render(
            <InviteManagerDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onCreateInvite={() => {}}
            />,
        );

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Failed to load invites");
        });
    });
});

describe("CreateInviteDialog Component", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn(async () => createMockResponse({ success: true }));
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("should render dialog when open", () => {
        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={() => {}}
            />,
        );

        expect(screen.getByText("Create Invite")).toBeInTheDocument();
        expect(
            screen.getByText("Generate an invite link for your server"),
        ).toBeInTheDocument();
    });

    it("should create invite with default settings", async () => {
        const mockOnCreated = vi.fn();

        getMockFetch().mockResolvedValueOnce(
            createMockResponse({
                $id: "invite-1",
                code: "newcode123",
                serverId: "server-1",
                creatorId: "user-1",
                currentUses: 0,
                temporary: false,
                $createdAt: new Date().toISOString(),
            }),
        );

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={mockOnCreated}
            />,
        );

        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/servers/server-1/invites",
                expect.objectContaining({
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                }),
            );
            expect(mockOnCreated).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(toast.success).toHaveBeenCalledWith(
                "Invite link generated successfully",
            );
        });

        // Should show generated invite link
        await waitFor(() => {
            expect(screen.getByText("Invite Link")).toBeInTheDocument();
            expect(
                screen.getByText(/\/invite\/newcode123/),
            ).toBeInTheDocument();
        });
    });

    it("should display loading state during creation", async () => {
        getMockFetch().mockImplementation(
            () =>
                new Promise(() => {
                    // Never resolves
                }),
        );

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={() => {}}
            />,
        );

        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(screen.getByText("Creating...")).toBeInTheDocument();
            expect(
                screen.getByRole("button", { name: /creating/i }),
            ).toBeDisabled();
        });
    });

    it("should handle temporary membership checkbox", async () => {
        const mockOnCreated = vi.fn();

        getMockFetch().mockResolvedValueOnce(
            createMockResponse({
                code: "tempcode123",
                temporary: true,
            }),
        );

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={mockOnCreated}
            />,
        );

        // Find and click the temporary checkbox
        const temporaryCheckbox = screen.getByRole("checkbox", {
            name: /temporary membership/i,
        });
        await userEvent.click(temporaryCheckbox);

        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                "/api/servers/server-1/invites",
                expect.objectContaining({ method: "POST" }),
            );
        });

        expect(getFetchBodyPayload<{ temporary?: boolean }>()).toEqual(
            expect.objectContaining({
                temporary: true,
            }),
        );
    });

    it("should handle creation error from API", async () => {
        getMockFetch().mockResolvedValueOnce(
            createMockResponse({ error: "Server not found" }, 500),
        );

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={() => {}}
            />,
        );

        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Server not found");
        });
    });

    it("should handle network error during creation", async () => {
        getMockFetch().mockRejectedValueOnce(new Error("Network error"));

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={() => {}}
            />,
        );

        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Network error");
        });
    });

    it("should copy invite link to clipboard", async () => {
        getMockFetch().mockResolvedValueOnce(
            createMockResponse({
                code: "copytest123",
            }),
        );

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={() => {}}
                serverId="server-1"
                onInviteCreated={() => {}}
            />,
        );

        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(screen.getByText("Invite Link")).toBeInTheDocument();
        });

        const copyButton = screen.getByRole("button", {
            name: "Copy invite link",
        });
        await userEvent.click(copyButton);

        await waitFor(() => {
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                "http://localhost:3000/invite/copytest123",
            );
            expect(toast.success).toHaveBeenCalledWith(
                "Invite link copied to clipboard",
            );
        });
    });

    it("should reset form when dialog closes", async () => {
        const mockOnOpenChange = vi.fn();

        getMockFetch().mockResolvedValueOnce(
            createMockResponse({ code: "test123" }),
        );

        render(
            <CreateInviteDialog
                open={true}
                onOpenChange={mockOnOpenChange}
                serverId="server-1"
                onInviteCreated={() => {}}
            />,
        );

        // Create an invite
        const generateButton = screen.getByRole("button", {
            name: /generate invite/i,
        });
        await userEvent.click(generateButton);

        await waitFor(() => {
            expect(screen.getByText("Done")).toBeInTheDocument();
        });

        // Click Done to close
        const doneButton = screen.getByRole("button", { name: /done/i });
        await userEvent.click(doneButton);

        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
});
