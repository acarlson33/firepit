import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, FileCode2 } from "lucide-react";

import { DocsShell } from "@/components/docs-shell";
import { getApiReferenceData, docsPages } from "@/lib/docs";

export const metadata: Metadata = {
    title: "Docs | firepit",
    description: "Firepit product, operations, and API documentation.",
};

export default async function DocsIndexPage() {
    const apiReference = await getApiReferenceData();

    return (
        <DocsShell
            description="Browse the consolidated Firepit guides and the generated API overview from the in-repo OpenAPI specification."
            title="Documentation Hub"
        >
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
                                {apiReference.operationCount} operations across{" "}
                                {apiReference.tagCount} tags, generated from the
                                current OpenAPI document.
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
        </DocsShell>
    );
}
