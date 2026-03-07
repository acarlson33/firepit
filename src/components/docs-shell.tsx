import type { Route } from "next";
import Link from "next/link";
import { BookOpenText, FileCode2 } from "lucide-react";

import { docsPages } from "@/lib/docs";

type DocsShellProps = {
    title: string;
    description: string;
    currentSlug?: string;
    children: React.ReactNode;
    aside?: React.ReactNode;
};

export function DocsShell({
    title,
    description,
    currentSlug,
    children,
    aside,
}: DocsShellProps) {
    return (
        <div className="mx-auto w-full max-w-7xl px-6 py-10">
            <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                    <div className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <BookOpenText className="h-5 w-5" />
                            </span>
                            <div>
                                <p className="text-sm font-semibold tracking-tight">
                                    Firepit Docs
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Product and API guidance
                                </p>
                            </div>
                        </div>
                    </div>

                    <nav className="rounded-3xl border border-border/60 bg-card/70 p-3 shadow-sm backdrop-blur-sm">
                        <div className="mb-2 px-3 pt-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Guides
                        </div>
                        <div className="space-y-1">
                            <Link
                                className={`block rounded-2xl px-3 py-2 text-sm transition-colors ${
                                    currentSlug === undefined
                                        ? "bg-primary/10 text-foreground"
                                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                }`}
                                href={"/docs" as Route}
                            >
                                Overview
                            </Link>
                            {docsPages.map((page) => (
                                <Link
                                    className={`block rounded-2xl px-3 py-2 text-sm transition-colors ${
                                        currentSlug === page.slug
                                            ? "bg-primary/10 text-foreground"
                                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                                    }`}
                                    href={`/docs/${page.slug}` as Route}
                                    key={page.slug}
                                >
                                    {page.title}
                                </Link>
                            ))}
                        </div>
                    </nav>

                    <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
                        <Link
                            className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            href={"/docs/api" as Route}
                        >
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted/70 text-primary">
                                <FileCode2 className="h-4 w-4" />
                            </span>
                            <span>
                                <span className="block font-medium text-foreground">
                                    API Reference
                                </span>
                                <span className="block text-xs">
                                    OpenAPI-driven endpoint overview
                                </span>
                            </span>
                        </Link>
                    </div>

                    {aside}
                </aside>

                <div className="space-y-6">
                    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur-sm">
                        <div className="max-w-3xl space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                Documentation
                            </p>
                            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                                {title}
                            </h1>
                            <p className="text-base leading-7 text-muted-foreground">
                                {description}
                            </p>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-border/60 bg-card/70 p-8 shadow-sm backdrop-blur-sm">
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}
