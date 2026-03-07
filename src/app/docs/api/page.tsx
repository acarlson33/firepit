import type { Metadata } from "next";

import { DocsShell } from "@/components/docs-shell";
import { getApiReferenceData } from "@/lib/docs";

export const metadata: Metadata = {
    title: "API Reference | Docs | firepit",
    description: "OpenAPI-backed API reference summary for Firepit.",
};

export default async function DocsApiPage() {
    const apiReference = await getApiReferenceData();

    return (
        <DocsShell
            description="This page is generated from the in-repo OpenAPI document and gives a high-level map of the current first-party API surface."
            title="API Reference"
        >
            <div className="space-y-8">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Spec Version
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight">
                            {apiReference.version}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Operations
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight">
                            {apiReference.operationCount}
                        </div>
                    </div>
                    <div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Tags
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-tight">
                            {apiReference.tagCount}
                        </div>
                    </div>
                </div>

                <div className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm">
                    <h2 className="text-lg font-semibold tracking-tight">
                        Servers
                    </h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {apiReference.servers.map((server) => (
                            <div
                                className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3"
                                key={server.url}
                            >
                                <div className="font-mono text-sm text-foreground">
                                    {server.url}
                                </div>
                                <div className="mt-1 text-sm text-muted-foreground">
                                    {server.description}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4">
                    {apiReference.tags.map((tag) => (
                        <section
                            className="rounded-3xl border border-border/60 bg-background/70 p-5 shadow-sm"
                            key={tag.name}
                        >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-lg font-semibold tracking-tight">
                                        {tag.name}
                                    </h2>
                                    {tag.description ? (
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {tag.description}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    {tag.operations.length} operations
                                </div>
                            </div>

                            <div className="mt-4 overflow-hidden rounded-2xl border border-border/50">
                                <table className="min-w-full border-collapse text-left text-sm">
                                    <thead className="bg-muted/60">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold text-foreground">
                                                Method
                                            </th>
                                            <th className="px-4 py-3 font-semibold text-foreground">
                                                Path
                                            </th>
                                            <th className="px-4 py-3 font-semibold text-foreground">
                                                Summary
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tag.operations.map((operation) => (
                                            <tr
                                                key={`${operation.method}-${operation.path}`}
                                            >
                                                <td className="border-t border-border/50 px-4 py-3 align-top">
                                                    <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-primary">
                                                        {operation.method}
                                                    </span>
                                                </td>
                                                <td className="border-t border-border/50 px-4 py-3 font-mono text-xs text-foreground sm:text-sm">
                                                    {operation.path}
                                                </td>
                                                <td className="border-t border-border/50 px-4 py-3 text-muted-foreground">
                                                    {operation.summary}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </DocsShell>
    );
}
