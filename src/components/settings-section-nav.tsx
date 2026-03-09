"use client";

import { useEffect, useState } from "react";

type SettingsSection = {
    description: string;
    href: `#${string}`;
    title: string;
};

interface SettingsSectionNavProps {
    sections: readonly SettingsSection[];
}

function getInitialActiveHref(sections: readonly SettingsSection[]) {
    if (typeof window === "undefined") {
        return sections[0]?.href ?? "#";
    }

    const hash = window.location.hash;
    const matchingSection = sections.find((section) => section.href === hash);
    return matchingSection?.href ?? sections[0]?.href ?? "#";
}

export function SettingsSectionNav({ sections }: SettingsSectionNavProps) {
    const [activeHref, setActiveHref] = useState(() =>
        getInitialActiveHref(sections),
    );

    useEffect(() => {
        setActiveHref(getInitialActiveHref(sections));

        const handleHashChange = () => {
            setActiveHref(getInitialActiveHref(sections));
        };

        window.addEventListener("hashchange", handleHashChange);

        const observer = new IntersectionObserver(
            (entries) => {
                const visibleEntries = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (left, right) =>
                            right.intersectionRatio - left.intersectionRatio,
                    );

                const nextEntry = visibleEntries[0];
                if (!nextEntry?.target.id) {
                    return;
                }

                setActiveHref(`#${nextEntry.target.id}`);
            },
            {
                rootMargin: "-20% 0px -60% 0px",
                threshold: [0.1, 0.25, 0.5, 0.75],
            },
        );

        const observedElements = sections
            .map((section) => {
                const element = document.getElementById(section.href.slice(1));
                if (element) {
                    observer.observe(element);
                }
                return element;
            })
            .filter((element): element is HTMLElement => Boolean(element));

        return () => {
            window.removeEventListener("hashchange", handleHashChange);
            for (const element of observedElements) {
                observer.unobserve(element);
            }
            observer.disconnect();
        };
    }, [sections]);

    return (
        <div className="rounded-3xl border border-border/60 bg-card/75 p-5 shadow-lg backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                On this page
            </p>
            <nav aria-label="Settings sections" className="mt-4">
                <ul className="space-y-2">
                    {sections.map((section) => {
                        const isActive = section.href === activeHref;

                        return (
                            <li key={section.href}>
                                <a
                                    aria-current={
                                        isActive ? "location" : undefined
                                    }
                                    className={`group block rounded-2xl border px-4 py-3 transition-colors ${
                                        isActive
                                            ? "border-primary/40 bg-primary/10 shadow-sm"
                                            : "border-transparent bg-background/40 hover:border-border/60 hover:bg-background/80"
                                    }`}
                                    href={section.href}
                                    onClick={() => setActiveHref(section.href)}
                                >
                                    <p
                                        className={`text-sm font-medium transition-colors ${
                                            isActive
                                                ? "text-primary"
                                                : "text-foreground group-hover:text-primary"
                                        }`}
                                    >
                                        {section.title}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                        {section.description}
                                    </p>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </div>
    );
}
