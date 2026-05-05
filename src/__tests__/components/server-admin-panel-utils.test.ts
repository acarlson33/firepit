/// <reference lib="dom" />

import { describe, expect, it } from "vitest";

import { getAuditUserLabel } from "../../components/server-admin-panel-utils";

describe("getAuditUserLabel", () => {
    it("prefers the member username when the actor is still in the server", () => {
        const label = getAuditUserLabel({
            fallbackName: "Display Name",
            members: [
                {
                    userId: "user-1",
                    userName: "traceable-user",
                    displayName: "Display Name",
                },
            ],
            userId: "user-1",
        });

        expect(label).toBe("traceable-user");
    });

    it("falls back to the existing audit payload name when no member match exists", () => {
        const label = getAuditUserLabel({
            fallbackName: "Audit Payload Name",
            members: [],
            userId: "user-1",
        });

        expect(label).toBe("Audit Payload Name");
    });

    it("falls back to a short id when no name data is available", () => {
        const label = getAuditUserLabel({
            defaultLabel: "Moderator",
            members: [],
            userId: "69ac786400343ac28bc1",
        });

        expect(label).toBe("69ac7864");
    });
});
