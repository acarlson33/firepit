import { describe, expect, it } from "vitest";
import {
    getAllPresetFrames,
    getDefaultPresetFrames,
    getSeasonalPresetFrames,
    getPresetFrameById,
    isValidPresetFrameId,
    getSeasonalFramesForUser,
    isUserEligibleForFrame,
    getEligibleFramesForUser,
} from "@/lib/preset-frames";

describe("preset-frames", () => {
    describe("getAllPresetFrames", () => {
        it("returns all preset frames including default and seasonal", () => {
            const frames = getAllPresetFrames();
            expect(frames.length).toBeGreaterThan(0);
            expect(frames.some((f) => f.type === "default")).toBe(true);
            expect(frames.some((f) => f.type === "seasonal")).toBe(true);
        });
    });

    describe("getDefaultPresetFrames", () => {
        it("returns only default frames", () => {
            const frames = getDefaultPresetFrames();
            expect(frames.length).toBeGreaterThan(0);
            expect(frames.every((f) => f.type === "default")).toBe(true);
        });
    });

    describe("getSeasonalPresetFrames", () => {
        it("returns only seasonal frames", () => {
            const frames = getSeasonalPresetFrames();
            expect(frames.length).toBeGreaterThan(0);
            expect(frames.every((f) => f.type === "seasonal")).toBe(true);
        });
    });

    describe("getPresetFrameById", () => {
        it("returns frame when found", () => {
            const frame = getPresetFrameById("default-round");
            expect(frame).toBeDefined();
            expect(frame?.id).toBe("default-round");
        });

        it("returns undefined when not found", () => {
            const frame = getPresetFrameById("nonexistent-frame");
            expect(frame).toBeUndefined();
        });
    });

    describe("isValidPresetFrameId", () => {
        it("returns true for valid frame id", () => {
            expect(isValidPresetFrameId("default-round")).toBe(true);
        });

        it("returns false for invalid frame id", () => {
            expect(isValidPresetFrameId("invalid-frame")).toBe(false);
        });
    });

    describe("getSeasonalFramesForUser", () => {
        it("returns seasonal frames for user created during winter 2025", () => {
            const frames = getSeasonalFramesForUser("2025-12-25T10:00:00.000Z");
            expect(frames.some((f) => f.id === "seasonal-winter-2025")).toBe(
                true,
            );
        });

        it("returns frames for user active across multiple seasons", () => {
            const frames = getSeasonalFramesForUser("2025-01-01T10:00:00.000Z");
            expect(frames.length).toBeGreaterThan(0);
        });

        // Use far-future date so no seasonal frame definition can reach it.
        it("returns empty array for user created after all seasons", () => {
            const frames = getSeasonalFramesForUser("9999-01-01T00:00:00.000Z");
            expect(frames.length).toBe(0);
        });
    });

    describe("isUserEligibleForFrame", () => {
        it("returns true for default frames", () => {
            const eligible = isUserEligibleForFrame(
                "2026-01-01T10:00:00.000Z",
                "default-round",
            );
            expect(eligible).toBe(true);
        });

        it("returns true for seasonal frame when user was active", () => {
            const eligible = isUserEligibleForFrame(
                "2025-12-25T10:00:00.000Z",
                "seasonal-winter-2025",
            );
            expect(eligible).toBe(true);
        });

        it("returns false for seasonal frame when user was not active", () => {
            const eligible = isUserEligibleForFrame(
                "2026-05-01T10:00:00.000Z",
                "seasonal-spring-2025",
            );
            expect(eligible).toBe(false);
        });
    });

    describe("getEligibleFramesForUser", () => {
        it("returns all default frames plus eligible seasonal frames", () => {
            const frames = getEligibleFramesForUser("2025-12-25T10:00:00.000Z");
            const defaultFrames = frames.filter((f) => f.type === "default");
            const seasonalFrames = frames.filter((f) => f.type === "seasonal");

            expect(defaultFrames.length).toBeGreaterThan(0);
            expect(seasonalFrames.length).toBeGreaterThan(0);
            expect(
                seasonalFrames.some((f) => f.id === "seasonal-winter-2025"),
            ).toBe(true);
        });
    });
});
