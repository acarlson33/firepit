import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, FileCode2, Globe2, Layers3 } from "lucide-react";

import { DocsShell } from "@/components/docs-shell";
import { docsPages, getApiReferenceData, getTagAnchorId } from "@/lib/docs";

export const metadata: Metadata = {
    title: "Docs | firepit",
    description: "Firepit product, operations, and API documentation.",
};

export default async function DocsIndexPage() {
    const apiReference = await getApiReferenceData();
    const populatedTags = apiReference.tags.filter(
        (tag) => tag.operations.length > 0,
    );
    const featuredTags = populatedTags.slice(0, 6);
    const featuredOperations = populatedTags
        .flatMap((tag) => tag.operations.slice(0, 1))
        .slice(0, 6);

    return (
        <DocsShell
            description="Browse the consolidated Firepit guides and the generated API overview from the in-repo OpenAPI specification."
            title="Documentation Hub"
        >
            <div className="space-y-8">
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="grid gap-4 md:grid-cols-2">
                        {docsPages.map((page) => (
                            <Link
                                className="group rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm transition-transform hover:-translate-y-0.5"
                                href={`/docs/${page.slug}` as Route}
                                key={page.slug}
                            >
                                <div className="space-y-3">
                                    <div>
                                        <h2 className="text-lg font-semibold tracking-tight">
                                            {page.title}
                                        </h2>
                                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                            {page.description}
                                        </p>
                                    </div>
                                    <div className="inline-flex items-center text-sm font-medium text-primary">
                                        Open guide
                                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>

                    <div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <FileCode2 className="h-5 w-5" />
                            </span>
                            <div className="space-y-2">
                                <h2 className="text-lg font-semibold tracking-tight">
                                    API Reference
                                </h2>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    {apiReference.operationCount} operations
                                    across {apiReference.tagCount} tags,
                                    generated from the current OpenAPI document.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                            <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Title
                                </div>
                                <div className="mt-1 text-sm font-medium">
                                    {apiReference.title}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Version
                                </div>
                                <div className="mt-1 text-sm font-medium">
                                    {apiReference.version}
                                </div>
                            </div>
                        </div>

                        <Link
                            className="mt-5 inline-flex items-center text-sm font-medium text-primary"
                            href={"/docs/api" as Route}
                        >
                            Open API overview
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                    <section className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Layers3 className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight">
                                    API Domains
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    The main endpoint groups exposed by the
                                    current spec.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            {featuredTags.map((tag) => (
                                <a
                                    className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3 transition-colors hover:bg-card"
                                    href={`/docs/api#${String(getTagAnchorId(tag.name))}`}
                                    key={tag.name}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="font-medium text-foreground">
                                            {tag.name}
                                        </div>
                                        <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                            {tag.operations.length}
                                        </div>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        {tag.description}
                                    </p>
                                </a>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Globe2 className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-lg font-semibold tracking-tight">
                                    Start With These Endpoints
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Quick entry points into the authenticated
                                    and public API surface.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            {featuredOperations.map((operation) => (
                                <a
                                    className="block rounded-2xl border border-border/50 bg-card/60 px-4 py-3 transition-colors hover:bg-card"
                                    href={`/docs/api#${String(operation.anchorId)}`}
                                    key={String(operation.anchorId)}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                                            {operation.method}
                                        </span>
                                        <span className="font-mono text-xs text-foreground sm:text-sm">
                                            {operation.path}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-sm font-medium text-foreground">
                                        {operation.summary}
                                    </div>
                                </a>
                            ))}
                        </div>

                        <div className="mt-5 rounded-2xl border border-border/50 bg-card/60 p-4">
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Servers
                            </div>
                            <div className="mt-3 space-y-3">
                                {apiReference.servers.map((server) => (
                                    <div key={server.url}>
                                        <div className="font-mono text-xs text-foreground sm:text-sm">
                                            {server.url}
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {server.description}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </DocsShell>
    );
}
