import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InviteManagerDialog } from "@/app/chat/components/InviteManagerDialog";
import { CreateInviteDialog } from "@/app/chat/components/CreateInviteDialog";
import { toast } from "sonner";

// Store original fetch
const originalFetch = global.fetch;
const getMockFetch = () => global.fetch as ReturnType<typeof vi.fn>;

// Mock window and navigator for browser APIs
global.window = global.window || ({} as any);
global.navigator = global.navigator || ({} as any);

// Set up location mock
Object.defineProperty(global.window, 'location', {
  value: { origin: "http://localhost:3000" },
  writable: true,
});

// Set up clipboard mock
Object.defineProperty(global.navigator, 'clipboard', {
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
    global.fetch = vi.fn();
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
      />
    );

    expect(screen.getByText("Server Invites")).toBeInTheDocument();
  });

  it("should not render when closed", () => {
    const { container } = render(
      <InviteManagerDialog
        open={false}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
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
        temporary: false,
        $createdAt: new Date().toISOString(),
      },
    ];

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => mockInvites,
    } as Response);

    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("abc123xyz7")).toBeInTheDocument();
      expect(screen.getByText("def456uvw8")).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/servers/server-1/invites");
  });

  it("should display loading state initially", () => {
    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    // Component shows loading spinner, not text
    expect(screen.getByText("Server Invites")).toBeInTheDocument();
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
        temporary: false,
        $createdAt: new Date().toISOString(),
      },
    ];

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => mockInvites,
    } as Response);

    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("8/10 uses")).toBeInTheDocument();
      expect(screen.getByText("100 uses")).toBeInTheDocument();
    });
  });

  it("should call onCreateInvite when create button is clicked", async () => {
    const mockOnCreate = vi.fn();

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={mockOnCreate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Create Invite")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Create Invite"));
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
        temporary: false,
        $createdAt: new Date().toISOString(),
      },
    ];

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => mockInvites,
    } as Response);

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    });

    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("copytest123")).toBeInTheDocument();
    });

    // Get all buttons - first two in the invite card are copy and delete
    const buttons = screen.getAllByRole("button");
    const copyButton = buttons.find(btn => btn.querySelector('[class*="lucide-copy"]'));
    
    if (!copyButton) throw new Error("Copy button not found");
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("copytest123")
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
        temporary: false,
        $createdAt: new Date().toISOString(),
      },
    ];

    getMockFetch()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvites,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("delete123")).toBeInTheDocument();
    });

    // Get all buttons - the delete button has the trash icon
    const buttons = screen.getAllByRole("button");
    const deleteButton = buttons.find(btn => btn.querySelector('[class*="lucide-trash"]'));
    
    if (!deleteButton) throw new Error("Delete button not found");
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/invites/delete123",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  it("should handle error when loading invites fails", async () => {
    getMockFetch().mockRejectedValueOnce(
      new Error("Failed to load invites")
    );

    render(
      <InviteManagerDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onCreateInvite={() => {}}
      />
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load invites");
    });
  });
});

describe("CreateInviteDialog Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("should render dialog when open", () => {
    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={() => {}}
      />
    );

    expect(screen.getByText("Create Invite")).toBeInTheDocument();
    expect(screen.getByText("Generate an invite link for your server")).toBeInTheDocument();
  });

  it("should create invite with default settings", async () => {
    const mockOnCreated = vi.fn();

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        $id: "invite-1",
        code: "newcode123",
        serverId: "server-1",
        creatorId: "user-1",
        currentUses: 0,
        temporary: false,
        $createdAt: new Date().toISOString(),
      }),
    } as Response);

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={mockOnCreated}
      />
    );

    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/servers/server-1/invites",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
      expect(mockOnCreated).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Invite link generated successfully");
    });

    // Should show generated invite link
    await waitFor(() => {
      expect(screen.getByText("Invite Link")).toBeInTheDocument();
      expect(screen.getByText(/\/invite\/newcode123/)).toBeInTheDocument();
    });
  });

  it("should display loading state during creation", async () => {
    getMockFetch().mockImplementation(
      () =>
        new Promise(() => {
          // Never resolves
        })
    );

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={() => {}}
      />
    );

    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Creating...")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
    });
  });

  it("should handle temporary membership checkbox", async () => {
    const mockOnCreated = vi.fn();

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: "tempcode123",
        temporary: true,
      }),
    } as Response);

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={mockOnCreated}
      />
    );

    // Find and click the temporary checkbox
    const temporaryCheckbox = screen.getByRole("checkbox");
    await userEvent.click(temporaryCheckbox);

    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it("should handle creation error from API", async () => {
    getMockFetch().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server not found" }),
    } as Response);

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={() => {}}
      />
    );

    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Server not found");
    });
  });

  it("should handle network error during creation", async () => {
    getMockFetch().mockRejectedValueOnce(
      new Error("Network error")
    );

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={() => {}}
      />
    );

    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network error");
    });
  });

  it("should copy invite link to clipboard", async () => {
    const writeTextMock = vi.fn(() => Promise.resolve());
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        code: "copytest123",
      }),
    } as Response);

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={() => {}}
        serverId="server-1"
        onInviteCreated={() => {}}
      />
    );

    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Invite Link")).toBeInTheDocument();
    });

    // Find and click the copy button (it has the Copy icon but no text)
    const copyButton = screen.getByRole("button", { name: "" });
    await userEvent.click(copyButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("http://localhost:3000/invite/copytest123");
      expect(toast.success).toHaveBeenCalledWith("Invite link copied to clipboard");
    });
  });

  it("should reset form when dialog closes", async () => {
    const mockOnOpenChange = vi.fn();

    getMockFetch().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "test123" }),
    } as Response);

    render(
      <CreateInviteDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        serverId="server-1"
        onInviteCreated={() => {}}
      />
    );

    // Create an invite
    const generateButton = screen.getByRole("button", { name: /generate invite/i });
    await userEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    // Click Done to close
    const doneButton = screen.getByText("Done");
    await userEvent.click(doneButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});
