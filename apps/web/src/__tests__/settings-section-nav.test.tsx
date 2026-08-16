/**
 * @vitest-environment happy-dom
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsSectionNav } from "@/components/settings-section-nav";

const sections = [
    {
        description: "Profile settings section.",
        href: "#profile",
        title: "Profile",
    },
    {
        description: "Interface settings section.",
        href: "#interface",
        title: "Interface",
    },
] as const;

class MockIntersectionObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
}

describe("SettingsSectionNav", () => {
    beforeEach(() => {
        vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
        document.body.innerHTML = `
            <section id="profile"></section>
            <section id="interface"></section>
        `;
        window.location.hash = "#interface";
    });

    it("renders the sidebar variant with section descriptions", () => {
        render(<SettingsSectionNav sections={sections} />);

        expect(screen.getByText("On this page")).toBeTruthy();
        expect(screen.getByText("Profile settings section.")).toBeTruthy();
        expect(screen.getByText("Interface settings section.")).toBeTruthy();
    });

    it("renders the compact variant with the active section selected", () => {
        render(<SettingsSectionNav sections={sections} variant="compact" />);

        expect(screen.getByText("Jump to section")).toBeTruthy();
        expect(
            screen.getByRole("combobox", {
                name: "Jump to settings section",
            }),
        ).toBeTruthy();
        expect(screen.getAllByText("Interface").length).toBeGreaterThan(0);
    });
});
