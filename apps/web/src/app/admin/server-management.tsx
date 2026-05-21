"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

import {
    createServerAction,
    createChannelAction,
    listServersAction,
    listChannelsAction,
    deleteServerAction,
    deleteChannelAction,
    setDefaultSignupServerAction,
} from "./server-actions";

type Server = {
    $id: string;
    name: string;
    ownerId: string;
    createdAt: string;
    defaultOnSignup?: boolean;
};

type Channel = {
    $id: string;
    name: string;
    type: "text" | "voice" | "announcement";
    serverId: string;
    createdAt: string;
};

type ServerManagementProperties = {
    isAdmin: boolean;
    isModerator: boolean;
};

export function ServerManagement({
    isAdmin,
    isModerator,
}: ServerManagementProperties) {
    const [serverName, setServerName] = useState("");
    const [channelName, setChannelName] = useState("");
    const [channelType, setChannelType] = useState<"text" | "announcement">(
        "text",
    );
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [servers, setServers] = useState<Server[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [isCreatingServer, setIsCreatingServer] = useState(false);
    const [isCreatingChannel, setIsCreatingChannel] = useState(false);
    const [isLoadingServers, setIsLoadingServers] = useState(false);
    const [isLoadingChannels, setIsLoadingChannels] = useState(false);
    const [selectedDefaultSignupServerId, setSelectedDefaultSignupServerId] =
        useState<string>("");
    const [isSavingDefaultSignupServer, setIsSavingDefaultSignupServer] =
        useState(false);

    // Load servers on mount
    useEffect(() => {
        if (isAdmin || isModerator) {
            void loadServers();
        }
    }, [isAdmin, isModerator]);

    // Load channels when server is selected
    useEffect(() => {
        if (selectedServerId && (isAdmin || isModerator)) {
            void loadChannels(selectedServerId);
        } else {
            setChannels([]);
        }
    }, [selectedServerId, isAdmin, isModerator]);

    const loadServers = async () => {
        setIsLoadingServers(true);
        try {
            const result = await listServersAction();
            setServers(result.servers);
            const defaultSignupServer = result.servers.find(
                (server) => server.defaultOnSignup === true,
            );
            setSelectedDefaultSignupServerId(defaultSignupServer?.$id ?? "");
            setSelectedServerId(
                (previousSelectedServerId) => {
                    const hasPreviousSelection =
                        previousSelectedServerId.length > 0 &&
                        result.servers.some(
                            (server) => server.$id === previousSelectedServerId,
                        );

                    return hasPreviousSelection
                        ? previousSelectedServerId
                        : (result.servers[0]?.$id ?? "");
                },
            );
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to load servers",
            );
        } finally {
            setIsLoadingServers(false);
        }
    };

    const loadChannels = async (serverId: string) => {
        setIsLoadingChannels(true);
        try {
            const result = await listChannelsAction(serverId);
            setChannels(result.channels);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to load channels",
            );
        } finally {
            setIsLoadingChannels(false);
        }
    };

    const handleCreateServer = async () => {
        if (!serverName.trim()) {
            toast.error("Server name is required");
            return;
        }

        setIsCreatingServer(true);
        try {
            const result = await createServerAction(serverName);
            if (result.success) {
                toast.success(
                    `Server "${result.serverName}" created successfully!`,
                );
                setServerName("");
                await loadServers();
            } else {
                toast.error(
                    "error" in result
                        ? result.error
                        : "Failed to create server",
                );
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to create server",
            );
        } finally {
            setIsCreatingServer(false);
        }
    };

    const handleCreateChannel = async () => {
        if (!channelName.trim()) {
            toast.error("Channel name is required");
            return;
        }

        if (!selectedServerId) {
            toast.error("Please select a server first");
            return;
        }

        setIsCreatingChannel(true);
        try {
            const result = await createChannelAction(
                selectedServerId,
                channelName,
                channelType,
            );
            if (result.success) {
                toast.success(
                    `Channel "${result.channelName}" (${result.channelType}) created successfully!`,
                );
                setChannelName("");
                setChannelType("text");
                await loadChannels(selectedServerId);
            } else {
                toast.error(
                    "error" in result
                        ? result.error
                        : "Failed to create channel",
                );
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to create channel",
            );
        } finally {
            setIsCreatingChannel(false);
        }
    };

    const handleDeleteServer = async (serverId: string, serverName: string) => {
        if (
            !confirm(
                `Are you sure you want to delete "${serverName}"? This will also delete all its channels.`,
            )
        ) {
            return;
        }

        try {
            const result = await deleteServerAction(serverId);
            if (result.success) {
                toast.success("Server deleted successfully");
                // Clear selection if deleted server was selected
                if (selectedServerId === serverId) {
                    setSelectedServerId("");
                    setChannels([]);
                }
                // Reload servers
                await loadServers();
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to delete server",
            );
        }
    };

    const handleDeleteChannel = async (
        channelId: string,
        channelName: string,
    ) => {
        if (!confirm(`Are you sure you want to delete "#${channelName}"?`)) {
            return;
        }

        try {
            const result = await deleteChannelAction(channelId);
            if (result.success) {
                toast.success("Channel deleted successfully");
                // Reload channels for current server
                if (selectedServerId) {
                    await loadChannels(selectedServerId);
                }
            } else {
                toast.error(result.error);
            }
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to delete channel",
            );
        }
    };

    const currentDefaultSignupServerId =
        servers.find((server) => server.defaultOnSignup === true)?.$id ?? "";

    const handleSaveDefaultSignupServer = async () => {
        setIsSavingDefaultSignupServer(true);
        try {
            const result = await setDefaultSignupServerAction(
                selectedDefaultSignupServerId || null,
            );
            if (!result.success) {
                toast.error(result.error);
                return;
            }

            toast.success("Updated default signup server");
            await loadServers();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update default signup server",
            );
        } finally {
            setIsSavingDefaultSignupServer(false);
        }
    };

    return (
        <section className="space-y-6">
            {isAdmin && (
                <Card>
                    <CardHeader>
                        <CardTitle>Default Signup Server</CardTitle>
                        <CardDescription>
                            Choose which server new accounts should join by
                            default.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="default-signup-server">
                                Server
                            </Label>
                            <select
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isLoadingServers || isSavingDefaultSignupServer}
                                id="default-signup-server"
                                value={selectedDefaultSignupServerId}
                                onChange={(event) =>
                                    setSelectedDefaultSignupServerId(
                                        event.target.value,
                                    )
                                }
                            >
                                <option value="">No default server</option>
                                {servers.map((server) => (
                                    <option key={server.$id} value={server.$id}>
                                        {server.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <Button
                            className="w-full"
                            disabled={
                                isLoadingServers ||
                                isSavingDefaultSignupServer ||
                                currentDefaultSignupServerId ===
                                    selectedDefaultSignupServerId
                            }
                            onClick={handleSaveDefaultSignupServer}
                            type="button"
                        >
                            {isSavingDefaultSignupServer
                                ? "Saving..."
                                : "Save Default Signup Server"}
                        </Button>

                        <p className="text-muted-foreground text-xs">
                            This is an instance-wide setting. Selecting a server
                            here clears the default flag on all other servers.
                        </p>
                    </CardContent>
                </Card>
            )}

            <section className="grid gap-6 md:grid-cols-2">
                {/* Create Server (Admin Only) */}
                {isAdmin && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Create Server</CardTitle>
                            <CardDescription>
                                Create a new server for organizing channels
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="server-name">Server Name</Label>
                                <Input
                                    disabled={isCreatingServer}
                                    id="server-name"
                                    placeholder="My Awesome Server"
                                    value={serverName}
                                    onChange={(e) =>
                                        setServerName(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            void handleCreateServer();
                                        }
                                    }}
                                />
                            </div>
                            <Button
                                className="w-full"
                                disabled={
                                    isCreatingServer || !serverName.trim()
                                }
                                onClick={handleCreateServer}
                                type="button"
                            >
                                {isCreatingServer
                                    ? "Creating..."
                                    : "Create Server"}
                            </Button>

                            {/* Server List */}
                            <div className="space-y-2 border-t pt-4">
                                <Label>Existing Servers ({servers.length})</Label>
                                {isLoadingServers ? (
                                    <p className="text-muted-foreground text-sm">
                                        Loading...
                                    </p>
                                ) : servers.length > 0 ? (
                                    <div className="max-h-48 space-y-1 overflow-y-auto rounded border bg-muted/50 p-2">
                                        {servers.map((server) => (
                                            <div
                                                key={server.$id}
                                                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-muted"
                                            >
                                                <button
                                                    className="flex-1 cursor-pointer text-left"
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedServerId(
                                                            server.$id,
                                                        )
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            selectedServerId ===
                                                            server.$id
                                                                ? "font-semibold"
                                                                : ""
                                                        }
                                                    >
                                                        {server.name}
                                                    </span>
                                                </button>
                                                <Button
                                                    aria-label={`Delete ${server.name}`}
                                                    size="sm"
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void handleDeleteServer(
                                                            server.$id,
                                                            server.name,
                                                        );
                                                    }}
                                                >
                                                    ✕
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground text-sm">
                                        No servers yet. Create one!
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Create Channel (Server Owner Only) */}
                {(isAdmin || isModerator) && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Create Channel</CardTitle>
                            <CardDescription>
                                Add a new channel to the selected server. Only
                                that server's owner can create channels.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {isLoadingServers && servers.length === 0 && (
                            <p className="text-muted-foreground text-sm">
                                Loading servers...
                            </p>
                            )}

                            {servers.length > 0 ? (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="server-select">
                                            Select Server
                                        </Label>
                                        <select
                                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={isCreatingChannel}
                                            id="server-select"
                                            value={selectedServerId}
                                            onChange={(e) =>
                                                setSelectedServerId(
                                                    e.target.value,
                                                )
                                            }
                                        >
                                            <option value="">
                                                Select a server...
                                            </option>
                                            {servers.map((server) => (
                                                <option
                                                    key={server.$id}
                                                    value={server.$id}
                                                >
                                                    {server.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                <div className="space-y-2">
                                    <Label htmlFor="channel-name">
                                        Channel Name
                                    </Label>
                                    <Input
                                        disabled={
                                            isCreatingChannel ||
                                            !selectedServerId
                                        }
                                        id="channel-name"
                                        placeholder="general"
                                        value={channelName}
                                        onChange={(e) =>
                                            setChannelName(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                void handleCreateChannel();
                                            }
                                        }}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="channel-type">
                                        Channel Type
                                    </Label>
                                    <select
                                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={
                                            isCreatingChannel ||
                                            !selectedServerId
                                        }
                                        id="channel-type"
                                        value={channelType}
                                        onChange={(e) =>
                                            setChannelType(
                                                e.target.value as
                                                    | "text"
                                                    | "announcement",
                                            )
                                        }
                                    >
                                        <option value="text">Text</option>
                                        <option value="announcement">
                                            Announcement
                                        </option>
                                    </select>
                                </div>

                                <Button
                                    className="w-full"
                                    disabled={
                                        isCreatingChannel ||
                                        !channelName.trim() ||
                                        !selectedServerId
                                    }
                                    onClick={handleCreateChannel}
                                    type="button"
                                >
                                    {isCreatingChannel
                                        ? "Creating..."
                                        : "Create Channel"}
                                </Button>

                                {/* Channel List */}
                                <div className="space-y-2 border-t pt-4">
                                    <Label>
                                        Channels in Selected Server (
                                        {channels.length})
                                    </Label>
                                    {isLoadingChannels ? (
                                        <p className="text-muted-foreground text-sm">
                                            Loading...
                                        </p>
                                    ) : channels.length > 0 ? (
                                        <div className="max-h-48 space-y-1 overflow-y-auto rounded border bg-muted/50 p-2">
                                            {channels.map((channel) => (
                                                <div
                                                    key={channel.$id}
                                                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm"
                                                >
                                                    <span>
                                                        # {channel.name}
                                                    </span>
                                                    <span className="rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                        {channel.type}
                                                    </span>
                                                    <Button
                                                        aria-label={`Delete ${channel.name}`}
                                                        size="sm"
                                                        type="button"
                                                        variant="ghost"
                                                        onClick={() =>
                                                            void handleDeleteChannel(
                                                                channel.$id,
                                                                channel.name,
                                                            )
                                                        }
                                                    >
                                                        ✕
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : selectedServerId ? (
                                        <p className="text-muted-foreground text-sm">
                                            No channels yet. Create one!
                                        </p>
                                    ) : (
                                        <p className="text-muted-foreground text-sm">
                                            Select a server to see channels.
                                        </p>
                                    )}
                                </div>
                                </>
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    {isAdmin
                                        ? "Create a server first to add channels."
                                        : "No servers available. Contact an admin."}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </section>
        </section>
    );
}
