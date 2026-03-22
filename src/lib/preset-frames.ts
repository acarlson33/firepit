/**
 * Preset avatar frames system
 * Handles predefined frames (everyone has access) and seasonal frames (earned based on account age)
 */

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
];

function getPresetFrameBucketUrl(fileId: string): string {
    const env = getEnvConfig();
    return `${env.endpoint}/storage/buckets/${env.buckets.avatarFramesPredefined || "a"}/files/${fileId}/view?project=${env.project}`;
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
    const frame = PRESET_FRAMES.find((candidate) => candidate.id === id);
    if (!frame) {
        return undefined;
    }

    return frame.storageFileId ?? frame.id;
}

export function getPresetFrameImageUrl(id: string): string | undefined {
    const storageFileId = getPresetFrameStorageFileId(id);
    if (!storageFileId) {
        return undefined;
    }

    return getPresetFrameBucketUrl(storageFileId);
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
    const frame = PRESET_FRAMES.find((candidate) => candidate.id === id);
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
    const createdDate = new Date(accountCreatedAt);
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

        const userWasActiveDuringSeason =
            createdDate <= seasonEnd && now >= seasonStart;

        return userWasActiveDuringSeason;
    }).map(hydrateFrameWithImageUrl);
}

export function isUserEligibleForFrame(
    accountCreatedAt: string,
    frameId: string,
): boolean {
    const frame = getPresetFrameById(frameId);
    if (!frame || frame.type !== "seasonal") {
        return true;
    }

    const eligibleFrames = getSeasonalFramesForUser(accountCreatedAt);
    return eligibleFrames.some((f) => f.id === frameId);
}

export function getEligibleFramesForUser(
    accountCreatedAt: string,
): PresetFrame[] {
    const defaultFrames = getDefaultPresetFrames();
    const seasonalFrames = getSeasonalFramesForUser(accountCreatedAt);

    return [...defaultFrames, ...seasonalFrames];
}

export function getFramePreviewStyle(frame: PresetFrame): React.CSSProperties {
    if (frame.imageUrl) {
        return {
            backgroundImage: `url(${frame.imageUrl})`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
        };
    }

    return {
        borderColor: frame.color || "#6366f1",
        borderStyle: frame.borderStyle || "solid",
    };
}
