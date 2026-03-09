"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    const [refreshing, setRefreshing] = useState(false);
    const [creatingName, setCreatingName] = useState("");
    const [creatingCategory, setCreatingCategory] = useState(false);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
        null,
    );
    const [editingName, setEditingName] = useState("");
    const [pendingCategoryIds, setPendingCategoryIds] = useState<string[]>([]);
    const [pendingChannelIds, setPendingChannelIds] = useState<string[]>([]);
    const loadRequestId = useRef(0);

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

    function setCategoryPending(categoryIds: string[], pending: boolean) {
        setPendingCategoryIds((currentValue) => {
            if (pending) {
                return [...new Set([...currentValue, ...categoryIds])];
            }

            return currentValue.filter((value) => !categoryIds.includes(value));
        });
    }

    function setChannelPending(channelIds: string[], pending: boolean) {
        setPendingChannelIds((currentValue) => {
            if (pending) {
                return [...new Set([...currentValue, ...channelIds])];
            }

            return currentValue.filter((value) => !channelIds.includes(value));
        });
    }

    async function loadData(options?: { silent?: boolean }) {
        const requestId = ++loadRequestId.current;
        if (options?.silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

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

            if (requestId !== loadRequestId.current) {
                return;
            }

            setCategories(sortCategories(categoriesData.categories));
            setChannels(sortChannels(channelsData.channels));
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to load categories",
            );
        } finally {
            if (requestId === loadRequestId.current) {
                if (options?.silent) {
                    setRefreshing(false);
                } else {
                    setLoading(false);
                }
            }
        }
    }

    function notifySidebar() {
        apiCache.clear(`categories:${serverId}:initial`);
        apiCache.clear(`channels:${serverId}:initial`);
        window.dispatchEvent(new Event("firepit:categories-changed"));
        window.dispatchEvent(new Event("firepit:channels-changed"));
    }

    function refreshAfterMutation() {
        notifySidebar();
        void loadData({ silent: true });
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
        if (!name || creatingCategory) {
            return;
        }

        setCreatingCategory(true);
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

            const data = (await response.json()) as {
                category: ChannelCategory;
            };

            setCreatingName("");
            setCategories((currentValue) =>
                sortCategories([...currentValue, data.category]),
            );
            refreshAfterMutation();
            toast.success("Category created");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to create category",
            );
        } finally {
            setCreatingCategory(false);
        }
    }

    async function saveCategoryName(categoryId: string) {
        const name = editingName.trim();
        if (!name) {
            return;
        }

        const previousCategories = categories;
        setCategoryPending([categoryId], true);
        setCategories((currentValue) =>
            currentValue.map((category) =>
                category.$id === categoryId ? { ...category, name } : category,
            ),
        );
        setEditingCategoryId(null);
        setEditingName("");

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

            refreshAfterMutation();
            toast.success("Category updated");
        } catch (error) {
            setCategories(previousCategories);
            setEditingCategoryId(categoryId);
            setEditingName(name);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to rename category",
            );
        } finally {
            setCategoryPending([categoryId], false);
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
        const previousCategories = categories;

        setCategoryPending([current.$id, target.$id], true);
        setCategories(
            sortCategories(
                orderedCategories.map((category) => {
                    if (category.$id === current.$id) {
                        return { ...category, position: target.position };
                    }

                    if (category.$id === target.$id) {
                        return { ...category, position: current.position };
                    }

                    return category;
                }),
            ),
        );

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

            refreshAfterMutation();
        } catch {
            setCategories(previousCategories);
            toast.error("Failed to reorder category");
        } finally {
            setCategoryPending([current.$id, target.$id], false);
        }
    }

    async function deleteCategory(categoryId: string) {
        const previousCategories = categories;
        const previousChannels = channels;
        let nextUncategorizedPosition = getNextChannelPosition();

        setCategoryPending([categoryId], true);
        setCategories((currentValue) =>
            currentValue.filter((category) => category.$id !== categoryId),
        );
        setChannels((currentValue) =>
            sortChannels(
                currentValue.map((channel) => {
                    if (channel.categoryId !== categoryId) {
                        return channel;
                    }

                    const updatedChannel = {
                        ...channel,
                        categoryId: undefined,
                        position: nextUncategorizedPosition,
                    };
                    nextUncategorizedPosition += 1;
                    return updatedChannel;
                }),
            ),
        );

        try {
            const response = await fetch(
                `/api/categories?categoryId=${encodeURIComponent(categoryId)}`,
                { method: "DELETE" },
            );

            if (!response.ok) {
                const data = (await response.json()) as { error?: string };
                throw new Error(data.error || "Failed to delete category");
            }

            refreshAfterMutation();
            toast.success("Category deleted");
        } catch (error) {
            setCategories(previousCategories);
            setChannels(previousChannels);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to delete category",
            );
        } finally {
            setCategoryPending([categoryId], false);
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
        const previousChannels = channels;
        const normalizedCategoryId =
            categoryId === "uncategorized" ? undefined : categoryId;
        const channel = channels.find((item) => item.$id === channelId);
        if (!channel) {
            return;
        }

        if ((channel.categoryId || undefined) === normalizedCategoryId) {
            return;
        }

        const nextPosition = normalizedCategoryId
            ? getNextChannelPosition(normalizedCategoryId)
            : getNextChannelPosition();

        setChannelPending([channelId], true);
        setChannels((currentValue) =>
            sortChannels(
                currentValue.map((item) =>
                    item.$id === channelId
                        ? {
                              ...item,
                              categoryId: normalizedCategoryId,
                              position: nextPosition,
                          }
                        : item,
                ),
            ),
        );

        try {
            await updateChannel(channelId, {
                categoryId: normalizedCategoryId ?? null,
                position: nextPosition,
            });
            refreshAfterMutation();
        } catch (error) {
            setChannels(previousChannels);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update channel",
            );
        } finally {
            setChannelPending([channelId], false);
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
        const previousChannels = channels;

        setChannelPending([current.$id, target.$id], true);
        setChannels(
            sortChannels(
                channels.map((item) => {
                    if (item.$id === current.$id) {
                        return { ...item, position: target.position ?? 0 };
                    }

                    if (item.$id === target.$id) {
                        return { ...item, position: current.position ?? 0 };
                    }

                    return item;
                }),
            ),
        );

        try {
            await Promise.all([
                updateChannel(current.$id, { position: target.position ?? 0 }),
                updateChannel(target.$id, { position: current.position ?? 0 }),
            ]);
            refreshAfterMutation();
        } catch (error) {
            setChannels(previousChannels);
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to reorder channel",
            );
        } finally {
            setChannelPending([current.$id, target.$id], false);
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
            {refreshing && (
                <p className="px-1 text-xs text-muted-foreground">
                    Syncing category changes...
                </p>
            )}
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
                            disabled={creatingCategory}
                            id="category-name"
                            onChange={(event) =>
                                setCreatingName(event.target.value)
                            }
                            placeholder="Announcements"
                            value={creatingName}
                        />
                        <Button
                            disabled={creatingCategory || !creatingName.trim()}
                            onClick={() => void createCategory()}
                            type="button"
                        >
                            <FolderPlus className="h-4 w-4" />
                            {creatingCategory ? "Creating..." : "Create"}
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
                                    {pendingCategoryIds.includes(
                                        category.$id,
                                    ) && (
                                        <span className="text-xs text-muted-foreground">
                                            Saving...
                                        </span>
                                    )}
                                    <Button
                                        disabled={pendingCategoryIds.includes(
                                            category.$id,
                                        )}
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
                                        disabled={pendingCategoryIds.includes(
                                            category.$id,
                                        )}
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
                                            disabled={
                                                pendingCategoryIds.includes(
                                                    category.$id,
                                                ) || !editingName.trim()
                                            }
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
                                            disabled={pendingCategoryIds.includes(
                                                category.$id,
                                            )}
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
                                        disabled={pendingCategoryIds.includes(
                                            category.$id,
                                        )}
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
                                                    disabled={pendingChannelIds.includes(
                                                        channel.$id,
                                                    )}
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
                                                    disabled={pendingChannelIds.includes(
                                                        channel.$id,
                                                    )}
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
                                disabled={pendingChannelIds.includes(
                                    channel.$id,
                                )}
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
