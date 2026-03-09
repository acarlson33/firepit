"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ArrowDown,
    ArrowUp,
    FolderPlus,
    Pencil,
    Save,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Channel, ChannelCategory } from "@/lib/types";
import { apiCache } from "@/lib/cache-utils";

type CategorySettingsPanelProperties = {
    serverId: string;
    canManage: boolean;
};

type CategoriesResponse = {
    categories: ChannelCategory[];
};

type ChannelsResponse = {
    channels: Channel[];
    nextCursor: string | null;
};

function sortCategories(categories: ChannelCategory[]) {
    return [...categories].sort(
        (left, right) => left.position - right.position,
    );
}

function sortChannels(channels: Channel[]) {
    return [...channels].sort((left, right) => {
        const leftPosition = left.position ?? 0;
        const rightPosition = right.position ?? 0;
        if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
        }

        return left.name.localeCompare(right.name);
    });
}

export function CategorySettingsPanel({
    serverId,
    canManage,
}: CategorySettingsPanelProperties) {
    const [categories, setCategories] = useState<ChannelCategory[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [loading, setLoading] = useState(false);
    const [creatingName, setCreatingName] = useState("");
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
        null,
    );
    const [editingName, setEditingName] = useState("");

    useEffect(() => {
        if (!serverId) {
            return;
        }
        void loadData();
    }, [serverId]);

    const uncategorizedChannels = useMemo(
        () => sortChannels(channels.filter((channel) => !channel.categoryId)),
        [channels],
    );

    async function loadData() {
        setLoading(true);
        try {
            const [categoriesResponse, channelsResponse] = await Promise.all([
                fetch(`/api/categories?serverId=${serverId}`),
                fetch(`/api/channels?serverId=${serverId}&limit=100`),
            ]);

            if (!categoriesResponse.ok || !channelsResponse.ok) {
                throw new Error("Failed to load categories");
            }

            const categoriesData =
                (await categoriesResponse.json()) as CategoriesResponse;
            const channelsData =
                (await channelsResponse.json()) as ChannelsResponse;

            setCategories(sortCategories(categoriesData.categories));
            setChannels(channelsData.channels);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to load categories",
            );
        } finally {
            setLoading(false);
        }
    }

    function notifySidebar() {
        apiCache.clear(`categories:${serverId}:initial`);
        apiCache.clear(`channels:${serverId}:initial`);
        window.dispatchEvent(new Event("firepit:categories-changed"));
        window.dispatchEvent(new Event("firepit:channels-changed"));
    }

    function getChannelsForCategory(categoryId: string) {
        return sortChannels(
            channels.filter((channel) => channel.categoryId === categoryId),
        );
    }

    function getNextChannelPosition(categoryId?: string) {
        const categoryChannels = channels.filter(
            (channel) => (channel.categoryId || "") === (categoryId || ""),
        );
        return (
            categoryChannels.reduce(
                (max, channel) => Math.max(max, channel.position ?? 0),
                -1,
            ) + 1
        );
    }

    async function createCategory() {
        const name = creatingName.trim();
        if (!name) {
            return;
        }

        try {
            const response = await fetch("/api/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serverId, name }),
            });

            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error || "Failed to create category");
            }

            setCreatingName("");
            await loadData();
            notifySidebar();
            toast.success("Category created");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to create category",
            );
        }
    }

    async function saveCategoryName(categoryId: string) {
        const name = editingName.trim();
        if (!name) {
            return;
        }

        try {
            const response = await fetch("/api/categories", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ categoryId, name }),
            });

            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error || "Failed to rename category");
            }

            setEditingCategoryId(null);
            setEditingName("");
            await loadData();
            notifySidebar();
            toast.success("Category updated");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to rename category",
            );
        }
    }

    async function moveCategory(categoryId: string, direction: -1 | 1) {
        const orderedCategories = sortCategories(categories);
        const currentIndex = orderedCategories.findIndex(
            (category) => category.$id === categoryId,
        );
        const targetIndex = currentIndex + direction;
        if (
            currentIndex < 0 ||
            targetIndex < 0 ||
            targetIndex >= orderedCategories.length
        ) {
            return;
        }

        const current = orderedCategories[currentIndex];
        const target = orderedCategories[targetIndex];

        try {
            await Promise.all([
                fetch("/api/categories", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        categoryId: current.$id,
                        position: target.position,
                    }),
                }),
                fetch("/api/categories", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        categoryId: target.$id,
                        position: current.position,
                    }),
                }),
            ]);

            await loadData();
            notifySidebar();
        } catch {
            toast.error("Failed to reorder category");
        }
    }

    async function deleteCategory(categoryId: string) {
        try {
            const response = await fetch(
                `/api/categories?categoryId=${encodeURIComponent(categoryId)}`,
                { method: "DELETE" },
            );

            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error || "Failed to delete category");
            }

            await loadData();
            notifySidebar();
            toast.success("Category deleted");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to delete category",
            );
        }
    }

    async function updateChannel(
        channelId: string,
        updates: Record<string, unknown>,
    ) {
        const response = await fetch(
            `/api/channels/${encodeURIComponent(channelId)}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            },
        );

        if (!response.ok) {
            const data = (await response.json()) as { error?: string };
            throw new Error(data.error || "Failed to update channel");
        }
    }

    async function assignChannel(channelId: string, categoryId: string) {
        try {
            await updateChannel(channelId, {
                categoryId: categoryId === "uncategorized" ? null : categoryId,
                position:
                    categoryId === "uncategorized"
                        ? getNextChannelPosition()
                        : getNextChannelPosition(categoryId),
            });
            await loadData();
            notifySidebar();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update channel",
            );
        }
    }

    async function moveChannel(channel: Channel, direction: -1 | 1) {
        const siblingChannels = sortChannels(
            channels.filter(
                (item) =>
                    (item.categoryId || "") === (channel.categoryId || ""),
            ),
        );
        const currentIndex = siblingChannels.findIndex(
            (item) => item.$id === channel.$id,
        );
        const targetIndex = currentIndex + direction;
        if (
            currentIndex < 0 ||
            targetIndex < 0 ||
            targetIndex >= siblingChannels.length
        ) {
            return;
        }

        const current = siblingChannels[currentIndex];
        const target = siblingChannels[targetIndex];

        try {
            await Promise.all([
                updateChannel(current.$id, { position: target.position ?? 0 }),
                updateChannel(target.$id, { position: current.position ?? 0 }),
            ]);
            await loadData();
            notifySidebar();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to reorder channel",
            );
        }
    }

    if (!canManage) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Channel Categories</CardTitle>
                    <CardDescription>
                        Category management is limited to users who can manage
                        channels.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Channel Categories</CardTitle>
                    <CardDescription>
                        Group channels into collapsible sections and control
                        their order.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Label htmlFor="category-name">New category</Label>
                    <div className="flex gap-2">
                        <Input
                            id="category-name"
                            onChange={(event) =>
                                setCreatingName(event.target.value)
                            }
                            placeholder="Announcements"
                            value={creatingName}
                        />
                        <Button
                            onClick={() => void createCategory()}
                            type="button"
                        >
                            <FolderPlus className="h-4 w-4" />
                            Create
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Categories</CardTitle>
                    <CardDescription>
                        Rename, reorder, or delete category sections.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {loading ? (
                        <p className="py-4 text-sm text-muted-foreground">
                            Loading categories...
                        </p>
                    ) : categories.length === 0 ? (
                        <p className="py-4 text-sm text-muted-foreground">
                            No categories created yet.
                        </p>
                    ) : (
                        categories.map((category) => (
                            <div
                                key={category.$id}
                                className="space-y-3 rounded-lg border border-border/60 p-3"
                            >
                                <div className="flex items-center gap-2">
                                    {editingCategoryId === category.$id ? (
                                        <Input
                                            onChange={(event) =>
                                                setEditingName(
                                                    event.target.value,
                                                )
                                            }
                                            value={editingName}
                                        />
                                    ) : (
                                        <div className="flex-1 font-medium">
                                            {category.name}
                                        </div>
                                    )}
                                    <Button
                                        onClick={() =>
                                            void moveCategory(category.$id, -1)
                                        }
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <ArrowUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        onClick={() =>
                                            void moveCategory(category.$id, 1)
                                        }
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <ArrowDown className="h-4 w-4" />
                                    </Button>
                                    {editingCategoryId === category.$id ? (
                                        <Button
                                            onClick={() =>
                                                void saveCategoryName(
                                                    category.$id,
                                                )
                                            }
                                            size="icon"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <Save className="h-4 w-4" />
                                        </Button>
                                    ) : (
                                        <Button
                                            onClick={() => {
                                                setEditingCategoryId(
                                                    category.$id,
                                                );
                                                setEditingName(category.name);
                                            }}
                                            size="icon"
                                            type="button"
                                            variant="ghost"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        onClick={() =>
                                            void deleteCategory(category.$id)
                                        }
                                        size="icon"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {getChannelsForCategory(category.$id).map(
                                        (channel) => (
                                            <div
                                                key={channel.$id}
                                                className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2"
                                            >
                                                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                                                    {channel.name}
                                                </div>
                                                <Button
                                                    onClick={() =>
                                                        void moveChannel(
                                                            channel,
                                                            -1,
                                                        )
                                                    }
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    onClick={() =>
                                                        void moveChannel(
                                                            channel,
                                                            1,
                                                        )
                                                    }
                                                    size="icon"
                                                    type="button"
                                                    variant="ghost"
                                                >
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ),
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Assign Channels</CardTitle>
                    <CardDescription>
                        Move channels into categories or leave them
                        uncategorized.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {sortChannels(channels).map((channel) => (
                        <div
                            key={channel.$id}
                            className="flex items-center gap-3 rounded-lg border border-border/60 p-3"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">
                                    {channel.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {channel.categoryId
                                        ? categories.find(
                                              (category) =>
                                                  category.$id ===
                                                  channel.categoryId,
                                          )?.name || "Unknown category"
                                        : "Uncategorized"}
                                </div>
                            </div>
                            <Select
                                onValueChange={(value) => {
                                    void assignChannel(channel.$id, value);
                                }}
                                value={channel.categoryId || "uncategorized"}
                            >
                                <SelectTrigger className="w-56">
                                    <SelectValue placeholder="Assign category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="uncategorized">
                                        Uncategorized
                                    </SelectItem>
                                    {categories.map((category) => (
                                        <SelectItem
                                            key={category.$id}
                                            value={category.$id}
                                        >
                                            {category.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ))}
                    {uncategorizedChannels.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Uncategorized channels remain visible beneath all
                            categories in the sidebar.
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
