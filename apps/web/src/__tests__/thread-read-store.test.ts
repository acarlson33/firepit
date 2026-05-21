import { describe, expect, it } from "vitest";

import { mergeThreadReadsByMax } from "@/lib/thread-read-store";

describe("thread-read-store", () => {
    it("keeps the newer timestamp when incoming is older", () => {
        const merged = mergeThreadReadsByMax({
            existingReads: {
                "message-1": "2026-03-13T12:00:00.000Z",
            },
            incomingReads: {
                "message-1": "2026-03-13T11:00:00.000Z",
            },
        });

        expect(merged).toEqual({
            "message-1": "2026-03-13T12:00:00.000Z",
        });
    });

    it("updates a key when incoming timestamp is newer", () => {
        const merged = mergeThreadReadsByMax({
            existingReads: {
                "message-1": "2026-03-13T11:00:00.000Z",
            },
            incomingReads: {
                "message-1": "2026-03-13T12:00:00.000Z",
            },
        });

        expect(merged).toEqual({
            "message-1": "2026-03-13T12:00:00.000Z",
        });
    });

    it("keeps the existing value when incoming timestamp is equal", () => {
        const merged = mergeThreadReadsByMax({
            existingReads: {
                "message-1": "2026-03-13T12:00:00.000Z",
            },
            incomingReads: {
                "message-1": "2026-03-13T12:00:00.000Z",
            },
        });

        expect(merged).toEqual({
            "message-1": "2026-03-13T12:00:00.000Z",
        });
    });

    it("merges non-overlapping message keys", () => {
        const merged = mergeThreadReadsByMax({
            existingReads: {
                "message-1": "2026-03-13T11:00:00.000Z",
            },
            incomingReads: {
                "message-2": "2026-03-13T12:00:00.000Z",
            },
        });

        expect(merged).toEqual({
            "message-1": "2026-03-13T11:00:00.000Z",
            "message-2": "2026-03-13T12:00:00.000Z",
        });
    });

    it("does not mutate existingReads input object", () => {
        const existingReads = {
            "message-1": "2026-03-13T11:00:00.000Z",
        };
        const snapshot = { ...existingReads };

        mergeThreadReadsByMax({
            existingReads,
            incomingReads: {
                "message-2": "2026-03-13T12:00:00.000Z",
            },
        });

        expect(existingReads).toStrictEqual(snapshot);
    });
});
