"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { ChannelCategory } from "@/lib/types";
import { apiCache, CACHE_TTL } from "@/lib/cache-utils";

type CategoriesResponse = {
    categories: ChannelCategory[];
};

export function useCategories(selectedServer: string | null) {
    const [categories, setCategories] = useState<ChannelCategory[]>([]);

    async function refresh() {
        if (!selectedServer) {
            setCategories([]);
            return;
        }

        apiCache.clear(`categories:${selectedServer}:initial`);
        try {
            const response = await fetch(
                `/api/categories?serverId=${selectedServer}`,
            );
            if (!response.ok) {
                throw new Error("Failed to load categories");
            }

            const data = (await response.json()) as CategoriesResponse;
            setCategories(data.categories);
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to load categories",
            );
        }
    }

    useEffect(() => {
        if (!selectedServer) {
            setCategories([]);
            return;
        }

        void (async () => {
            try {
                const data = await apiCache.swr(
                    `categories:${selectedServer}:initial`,
                    async () => {
                        const response = await fetch(
                            `/api/categories?serverId=${selectedServer}`,
                        );

                        if (!response.ok) {
                            throw new Error("Failed to load categories");
                        }

                        return (await response.json()) as CategoriesResponse;
                    },
                    CACHE_TTL.CATEGORIES,
                    (freshData) => {
                        setCategories(freshData.categories);
                    },
                );

                setCategories(data.categories);
            } catch (error) {
                toast.error(
                    error instanceof Error
                        ? error.message
                        : "Failed to load categories",
                );
            }
        })();
    }, [selectedServer]);

    useEffect(() => {
        const handleRefresh = () => {
            void refresh();
        };

        window.addEventListener("firepit:categories-changed", handleRefresh);
        return () => {
            window.removeEventListener(
                "firepit:categories-changed",
                handleRefresh,
            );
        };
    }, [selectedServer]);

    return { categories, refresh };
}
