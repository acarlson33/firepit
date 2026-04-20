/**
 * Preset avatar frames system
 * Handles predefined frames (everyone has access) and seasonal frames (earned based on account age)
 */

import type { CSSProperties } from "react";
import { getEnvConfig } from "./appwrite-core";

export type PresetFrame = {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    storageFileId?: string;
    avatarInsetPercent?: number;
    type: "default" | "seasonal";
    season?: string;
    emoji?: string;
    color?: string;
    borderStyle?: "solid" | "dashed" | "double";
    startDate?: string;
    endDate?: string;
};

const PRESET_FRAMES: PresetFrame[] = [
    {
        id: "default-round",
        name: "Round",
        description: "Classic circular frame",
        storageFileId: "default-round",
        avatarInsetPercent: 11,
        type: "default",
        emoji: "⚪",
        color: "#6366f1",
        borderStyle: "solid",
    },
    {
        id: "default-square",
        name: "Square",
        description: "Simple square frame",
        storageFileId: "default-square",
        avatarInsetPercent: 13,
        type: "default",
        emoji: "⬜",
        color: "#8b5cf6",
        borderStyle: "solid",
    },
    {
        id: "default-star",
        name: "Star",
        description: "Star-shaped decorative frame",
        storageFileId: "default-star",
        avatarInsetPercent: 20,
        type: "default",
        emoji: "⭐",
        color: "#f59e0b",
        borderStyle: "solid",
    },
    {
        id: "default-diamond",
        name: "Diamond",
        description: "Diamond-shaped decorative frame",
        storageFileId: "default-diamond",
        avatarInsetPercent: 16,
        type: "default",
        emoji: "💎",
        color: "#06b6d4",
        borderStyle: "solid",
    },
    {
        id: "seasonal-spring-2025",
        name: "Spring 2025",
        description: "Celebrate the arrival of spring",
        storageFileId: "seasonal-spring-2025",
        avatarInsetPercent: 24,
        type: "seasonal",
        season: "spring",
        emoji: "🌸",
        color: "#ec4899",
        borderStyle: "solid",
        startDate: "2025-03-20",
        endDate: "2025-06-20",
    },
    {
        id: "seasonal-summer-2025",
        name: "Summer 2025",
        description: "Enjoy the summer vibes",
        storageFileId: "seasonal-summer-2025",
        avatarInsetPercent: 22,
        type: "seasonal",
        season: "summer",
        emoji: "☀️",
        color: "#f97316",
        borderStyle: "solid",
        startDate: "2025-06-21",
        endDate: "2025-09-22",
    },
    {
        id: "seasonal-fall-2025",
        name: "Fall 2025",
        description: "Cozy autumn vibes",
        storageFileId: "seasonal-fall-2025",
        avatarInsetPercent: 21,
        type: "seasonal",
        season: "fall",
        emoji: "🍂",
        color: "#84cc16",
        borderStyle: "solid",
        startDate: "2025-09-23",
        endDate: "2025-12-21",
    },
    {
        id: "seasonal-winter-2025",
        name: "Winter 2025",
        description: "Winter wonderland",
        storageFileId: "seasonal-winter-2025",
        avatarInsetPercent: 16,
        type: "seasonal",
        season: "winter",
        emoji: "❄️",
        color: "#3b82f6",
        borderStyle: "solid",
        startDate: "2025-12-22",
        endDate: "2026-03-19",
    },
    {
        id: "seasonal-spring-2026",
        name: "Spring 2026",
        description: "Celebrate the arrival of spring",
        storageFileId: "seasonal-spring-2026",
        avatarInsetPercent: 26,
        type: "seasonal",
        season: "spring",
        emoji: "🌸",
        color: "#ec4899",
        borderStyle: "solid",
        startDate: "2026-03-20",
        endDate: "2026-06-20",
    },
    {
        id: "seasonal-summer-2026",
        name: "Summer 2026",
        description: "Golden-hour glow and bright summer energy",
        storageFileId: "seasonal-summer-2026",
        avatarInsetPercent: 18,
        type: "seasonal",
        season: "summer",
        emoji: "☀️",
        color: "#f97316",
        borderStyle: "solid",
        startDate: "2026-06-21",
        endDate: "2026-09-22",
    },
    {
        id: "seasonal-fall-2026",
        name: "Fall 2026",
        description: "Crisp leaves and warm autumn tones",
        storageFileId: "seasonal-fall-2026",
        avatarInsetPercent: 18,
        type: "seasonal",
        season: "fall",
        emoji: "🍂",
        color: "#b45309",
        borderStyle: "solid",
        startDate: "2026-09-23",
        endDate: "2026-12-21",
    },
    {
        id: "seasonal-winter-2026",
        name: "Winter 2026",
        description: "Cool blues and crystal snow details",
        storageFileId: "seasonal-winter-2026",
        avatarInsetPercent: 18,
        type: "seasonal",
        season: "winter",
        emoji: "❄️",
        color: "#3b82f6",
        borderStyle: "solid",
        startDate: "2026-12-22",
        endDate: "2027-03-19",
    },
];

function getPresetFrameBucketUrl(fileId: string): string {
    const env = getEnvConfig();
    const bucketId = env.buckets.avatarFramesPredefined;
    if (!bucketId) {
        throw new Error(
            "Missing env config: buckets.avatarFramesPredefined is not configured",
        );
    }
    const encodedBucketId = encodeURIComponent(bucketId);
    const encodedFileId = encodeURIComponent(fileId);
    const encodedProjectId = encodeURIComponent(env.project);
    return `${env.endpoint}/storage/buckets/${encodedBucketId}/files/${encodedFileId}/view?project=${encodedProjectId}`;
}

function hydrateFrameWithImageUrl(frame: PresetFrame): PresetFrame {
    const storageFileId = frame.storageFileId ?? frame.id;
    return {
        ...frame,
        imageUrl: getPresetFrameBucketUrl(storageFileId),
        storageFileId,
    };
}

export function getPresetFrameStorageFileId(id: string): string | undefined {
    const frame = getPresetFrameMetaById(id);
    if (!frame) {
        return undefined;
    }

    return frame.storageFileId ?? frame.id;
}

function getPresetFrameMetaById(id: string): PresetFrame | undefined {
    return PRESET_FRAMES.find((candidate) => candidate.id === id);
}

export function getPresetFrameImageUrl(id: string): string | undefined {
    const storageFileId = getPresetFrameStorageFileId(id);
    if (!storageFileId) {
        return undefined;
    }

    try {
        return getPresetFrameBucketUrl(storageFileId);
    } catch {
        return undefined;
    }
}

export function getAllPresetFrames(): PresetFrame[] {
    return PRESET_FRAMES.map(hydrateFrameWithImageUrl);
}

export function getDefaultPresetFrames(): PresetFrame[] {
    return PRESET_FRAMES.filter((frame) => frame.type === "default").map(
        hydrateFrameWithImageUrl,
    );
}

export function getSeasonalPresetFrames(): PresetFrame[] {
    return PRESET_FRAMES.filter((frame) => frame.type === "seasonal").map(
        hydrateFrameWithImageUrl,
    );
}

export function getPresetFrameById(id: string): PresetFrame | undefined {
    const frame = getPresetFrameMetaById(id);
    if (!frame) {
        return undefined;
    }

    return hydrateFrameWithImageUrl(frame);
}

export function isValidPresetFrameId(id: string): boolean {
    return PRESET_FRAMES.some((frame) => frame.id === id);
}

export function getSeasonalFramesForUser(
    accountCreatedAt: string,
): PresetFrame[] {
    const frameIds = getSeasonalFrameIdsForUser(accountCreatedAt);

    return frameIds
        .map((frameId) => getPresetFrameById(frameId))
        .filter((frame): frame is PresetFrame => frame !== undefined);
}

function getSeasonalFrameIdsForUser(accountCreatedAt: string): string[] {
    const createdDate = new Date(accountCreatedAt);
    if (Number.isNaN(createdDate.getTime())) {
        return [];
    }

    const now = new Date();

    return PRESET_FRAMES.filter((frame) => {
        if (frame.type !== "seasonal") {
            return false;
        }

        if (!frame.startDate || !frame.endDate) {
            return false;
        }

        const seasonStart = new Date(frame.startDate);
        const seasonEnd = new Date(frame.endDate);
        if (
            Number.isNaN(seasonStart.getTime()) ||
            Number.isNaN(seasonEnd.getTime())
        ) {
            return false;
        }

        const userWasActiveDuringSeason =
            createdDate <= seasonEnd && now >= seasonStart;

        return userWasActiveDuringSeason;
    }).map((frame) => frame.id);
}

export function isUserEligibleForFrame(
    accountCreatedAt: string,
    frameId: string,
): boolean {
    const frame = getPresetFrameMetaById(frameId);
    if (!frame) {
        return false;
    }

    if (frame.type !== "seasonal") {
        return true;
    }

    const eligibleFrameIds = getSeasonalFrameIdsForUser(accountCreatedAt);
    return eligibleFrameIds.includes(frameId);
}

export function getEligibleFramesForUser(
    accountCreatedAt: string,
): PresetFrame[] {
    const defaultFrames = getDefaultPresetFrames();
    const seasonalFrames = getSeasonalFramesForUser(accountCreatedAt);

    return [...defaultFrames, ...seasonalFrames];
}

export function getFramePreviewStyle(frame: PresetFrame): CSSProperties {
    if (frame.imageUrl) {
        const encodedImageUrl = encodeURI(frame.imageUrl)
            .replaceAll('"', "%22")
            .replaceAll("'", "%27")
            .replaceAll("\\", "%5C")
            .replaceAll("\n", "")
            .replaceAll("\r", "");

        return {
            backgroundImage: `url("${encodedImageUrl}")`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
        };
    }

    return {
        borderColor: frame.color || "#6366f1",
        borderStyle: frame.borderStyle || "solid",
        borderWidth: "2px",
    };
}
