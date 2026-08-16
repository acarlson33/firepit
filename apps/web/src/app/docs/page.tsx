import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import {
    ArrowRight,
    FileCode2,
    Flag,
    Globe2,
    Layers3,
    MessageSquare,
    Monitor,
    Sparkles,
    Rocket,
    Server,
    Shield,
} from "lucide-react";

import { DocsShell } from "@/components/docs-shell";
import { docsPages, getApiReferenceData, getTagAnchorId } from "@/lib/docs";

const DOC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    "product-and-onboarding": Rocket,
    "chat-and-realtime": MessageSquare,
    "server-administration": Server,
    "feature-flags": Flag,
    "platform-operations": Monitor,
};

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
                <section className="grid gap-6 overflow-hidden rounded-4xl border border-border/60 bg-card/75 p-6 shadow-2xl backdrop-blur-sm lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)] lg:p-8">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Docs at a glance
                        </div>
                        <div className="space-y-4">
                            <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                                Everything you need to build, operate, and extend Firepit.
                            </h2>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Start with product and onboarding guidance, move through realtime chat and server administration, and jump into the generated API reference when you need endpoint detail.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/15 transition-transform hover:-translate-y-0.5"
                                href={"/docs/api" as Route}
                            >
                                Open API Reference
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur transition-transform hover:-translate-y-0.5 hover:border-border"
                                href={"/chat" as Route}
                            >
                                Open chat workspace
                            </Link>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Guides
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                                    {docsPages.length}
                                </p>
                            </div>
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Operations
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                                    {apiReference.operationCount}
                                </p>
                            </div>
                            <div className="rounded-3xl border border-border/60 bg-background/70 p-4 shadow-sm">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                    Tags
                                </p>
                                <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                                    {apiReference.tagCount}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-3xl border border-border/60 bg-background/70 p-5 shadow-lg">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <FileCode2 className="h-5 w-5" />
                            </span>
                            <div>
                                <h3 className="text-base font-semibold tracking-tight">
                                    API Reference
                                </h3>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Generated from the in-repo OpenAPI spec and organized by tag.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    OpenAPI version
                                </div>
                                <div className="mt-1 font-mono text-sm font-medium text-foreground">
                                    {apiReference.version}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-card/70 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Featured tags
                                </div>
                                <div className="mt-1 font-mono text-sm font-medium text-foreground">
                                    {featuredTags.length}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-border/50 bg-card/70 p-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Entry points
                            </div>
                            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                <p>Product and onboarding guidance for new operators.</p>
                                <p>Realtime messaging and server administration references.</p>
                                <p>Operations and platform details for deploy-time work.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="grid gap-4 md:grid-cols-2">
                        {docsPages.map((page) => {
                            const Icon = DOC_ICONS[page.slug] ?? Shield;

                            return (
                                <Link
                                    className="group overflow-hidden rounded-4xl border border-border/60 bg-card/75 p-6 shadow-xl backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-2xl"
                                    href={`/docs/${page.slug}` as Route}
                                    key={page.slug}
                                >
                                    <div className="space-y-4">
                                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <div>
                                            <h2 className="text-base font-semibold tracking-tight">
                                                {page.title}
                                            </h2>
                                            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                                                {page.description}
                                            </p>
                                        </div>
                                        <div className="inline-flex items-center text-sm font-medium text-primary">
                                            Open guide
                                            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                    <div className="overflow-hidden rounded-4xl border border-border/60 bg-card/75 p-6 shadow-xl backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <FileCode2 className="h-5 w-5" />
                            </span>
                            <div className="space-y-1">
                                <h2 className="text-base font-semibold tracking-tight">
                                    API Reference
                                </h2>
                                <p className="text-sm leading-6 text-muted-foreground">
                                    Generated from the in-repo OpenAPI spec.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Operations
                                </div>
                                <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                                    {apiReference.operationCount}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Tags
                                </div>
                                <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                                    {apiReference.tagCount}
                                </div>
                            </div>
                        </div>

                        <div className="mt-3 rounded-2xl border border-border/50 bg-background/60 px-4 py-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Version
                            </div>
                            <div className="mt-1 font-mono text-sm font-medium">
                                {apiReference.version}
                            </div>
                        </div>

                        <Link
                            className="mt-5 inline-flex items-center gap-1.5 rounded-2xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                            href={"/docs/api" as Route}
                        >
                            Open API Reference
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                    <section className="overflow-hidden rounded-4xl border border-border/60 bg-card/75 p-6 shadow-xl backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Layers3 className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold tracking-tight">
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
                                    className="group rounded-2xl border border-border/50 bg-background/60 px-4 py-3 transition-colors hover:bg-background/90"
                                    href={`/docs/api#${String(getTagAnchorId(tag.name))}`}
                                    key={tag.name}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-semibold text-foreground">
                                            {tag.name}
                                        </div>
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                            {tag.operations.length}
                                        </span>
                                    </div>
                                    {tag.description ? (
                                        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                                            {tag.description}
                                        </p>
                                    ) : null}
                                </a>
                            ))}
                        </div>
                    </section>

                    <section className="overflow-hidden rounded-4xl border border-border/60 bg-card/75 p-6 shadow-xl backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Globe2 className="h-5 w-5" />
                            </span>
                            <div>
                                <h2 className="text-base font-semibold tracking-tight">
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
                                    className="block rounded-2xl border border-border/50 bg-background/60 px-4 py-3 transition-colors hover:bg-background/90"
                                    href={`/docs/api#${String(operation.anchorId)}`}
                                    key={String(operation.anchorId)}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary ring-1 ring-primary/20">
                                            {operation.method}
                                        </span>
                                        <span className="font-mono text-xs text-foreground">
                                            {operation.path}
                                        </span>
                                    </div>
                                    <div className="mt-1.5 text-sm font-medium text-foreground">
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
