import type { Metadata } from "next";
import { GitBranch, Layers3, Link2, Tag, Zap } from "lucide-react";

import { ApiSchemaPanel } from "@/components/api-schema-panel";
import { DocsShell } from "@/components/docs-shell";
import { getApiReferenceData, getTagAnchorId } from "@/lib/docs";

function methodClassName(method: string) {
    switch (method) {
        case "GET": {
            return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30";
        }
        case "POST": {
            return "bg-sky-500/15 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500/30";
        }
        case "PUT":
        case "PATCH": {
            return "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30";
        }
        case "DELETE": {
            return "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30";
        }
        default: {
            return "bg-primary/10 text-primary ring-1 ring-primary/20";
        }
    }
}

function methodBorderColor(method: string) {
    switch (method) {
        case "GET": {
            return "border-l-emerald-400/70";
        }
        case "POST": {
            return "border-l-sky-400/70";
        }
        case "PUT":
        case "PATCH": {
            return "border-l-amber-400/70";
        }
        case "DELETE": {
            return "border-l-rose-400/70";
        }
        default: {
            return "border-l-primary/60";
        }
    }
}

function authLabel(auth: "public" | "session" | "mixed") {
    switch (auth) {
        case "public": {
            return "Public";
        }
        case "mixed": {
            return "Mixed Auth";
        }
        default: {
            return "Session Required";
        }
    }
}

function authBadgeClass(auth: "public" | "session" | "mixed") {
    switch (auth) {
        case "public": {
            return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20";
        }
        case "mixed": {
            return "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20";
        }
        default: {
            return "bg-muted text-muted-foreground ring-1 ring-border/50";
        }
    }
}

function statusClassName(status: string) {
    const code = Number.parseInt(status, 10);

    if (code >= 200 && code < 300) {
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }

    if (code >= 400 && code < 500) {
        return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
    }

    if (code >= 500) {
        return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
    }

    return "bg-muted text-muted-foreground";
}

export const metadata: Metadata = {
    title: "API Reference | Docs | firepit",
    description:
        "OpenAPI-backed API reference with per-endpoint request and response details for Firepit.",
};

export default async function DocsApiPage() {
    const apiReference = await getApiReferenceData();
    const operationTags = apiReference.tags.filter(
        (tag) => tag.operations.length > 0,
    );

    return (
        <DocsShell
            aside={
                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
                    <div className="mb-3 flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Jump To Tag
                        </span>
                    </div>
                    <div className="space-y-1">
                        {operationTags.map((tag) => (
                            <a
                                className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                href={`#${String(getTagAnchorId(tag.name))}`}
                                key={tag.name}
                            >
                                <span>{tag.name}</span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                                    {tag.operations.length}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            }
            description="This page is generated from the in-repo OpenAPI document and now includes per-endpoint parameters, request bodies, response contracts, and deep links for the current first-party API surface."
            title="API Reference"
        >
            <div className="space-y-8">
                <div className="grid gap-4 md:grid-cols-3">
                    <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <GitBranch className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Version
                            </div>
                            <div className="mt-1 font-mono text-xl font-semibold tracking-tight">
                                {apiReference.version}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Zap className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Operations
                            </div>
                            <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                                {apiReference.operationCount}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                            <Layers3 className="h-5 w-5" />
                        </span>
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Tags
                            </div>
                            <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                                {apiReference.tagCount}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight">
                                Endpoint Index
                            </h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Jump directly to a specific operation using its
                                method and path.
                            </p>
                        </div>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
                            {apiReference.operationCount} total endpoints
                        </span>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        {operationTags.map((tag) => (
                            <div
                                className="overflow-hidden rounded-2xl border border-border/50 bg-background/60 p-4"
                                key={`${tag.name}-index`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="font-semibold tracking-tight text-foreground">
                                        {tag.name}
                                    </h3>
                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                        {tag.operations.length}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-1.5">
                                    {tag.operations.map((operation) => (
                                        <a
                                            className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-card/60"
                                            href={`#${String(operation.anchorId)}`}
                                            key={[
                                                String(operation.anchorId),
                                                "index",
                                            ].join("-")}
                                        >
                                            <span
                                                className={`inline-flex min-w-16 justify-center rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide ${methodClassName(operation.method)}`}
                                            >
                                                {operation.method}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate font-mono text-xs text-foreground">
                                                    {operation.path}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {operation.summary}
                                                </span>
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
                    <h2 className="text-lg font-semibold tracking-tight">
                        Servers
                    </h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {apiReference.servers.map((server) => (
                            <div
                                className="overflow-hidden rounded-2xl border border-border/50 bg-background/60 px-4 py-3"
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
                            className="overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm"
                            id={getTagAnchorId(tag.name)}
                            key={tag.name}
                        >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Layers3 className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <h2 className="text-lg font-semibold tracking-tight">
                                            {tag.name}
                                        </h2>
                                        {tag.description ? (
                                            <p className="mt-0.5 text-sm text-muted-foreground">
                                                {tag.description}
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground">
                                    {tag.operations.length} operations
                                </span>
                            </div>

                            {tag.operations.length > 0 ? (
                                <div className="mt-5 space-y-4">
                                    {tag.operations.map((operation) => (
                                        <article
                                            className={`rounded-2xl border border-border/50 border-l-4 ${methodBorderColor(operation.method)} bg-card/60 p-5`}
                                            id={operation.anchorId}
                                            key={`${operation.method}-${operation.path}`}
                                        >
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${methodClassName(operation.method)}`}
                                                        >
                                                            {operation.method}
                                                        </span>
                                                        <span
                                                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ${authBadgeClass(operation.auth)}`}
                                                        >
                                                            {authLabel(
                                                                operation.auth,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <h3 className="text-base font-semibold tracking-tight text-foreground">
                                                            {operation.summary}
                                                        </h3>
                                                        <a
                                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                                            href={`#${String(operation.anchorId)}`}
                                                        >
                                                            <Link2 className="h-3 w-3" />
                                                            <span>
                                                                Permalink
                                                            </span>
                                                        </a>
                                                    </div>
                                                    <div className="inline-flex items-center rounded-lg border border-border/50 bg-muted/50 px-3 py-1.5 font-mono text-xs text-foreground">
                                                        {operation.path}
                                                    </div>
                                                    {operation.description ? (
                                                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                                                            {
                                                                operation.description
                                                            }
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                                                <div className="space-y-4">
                                                    <section className="rounded-2xl border border-border/50 bg-background/70 p-4">
                                                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                            Parameters
                                                        </div>
                                                        {operation.parameters
                                                            .length > 0 ? (
                                                            <div className="mt-3 overflow-hidden rounded-xl border border-border/50">
                                                                <table className="min-w-full border-collapse text-left text-sm">
                                                                    <thead className="bg-muted/60">
                                                                        <tr>
                                                                            <th className="px-3 py-2 font-semibold text-foreground">
                                                                                Name
                                                                            </th>
                                                                            <th className="px-3 py-2 font-semibold text-foreground">
                                                                                In
                                                                            </th>
                                                                            <th className="px-3 py-2 font-semibold text-foreground">
                                                                                Type
                                                                            </th>
                                                                            <th className="px-3 py-2 font-semibold text-foreground">
                                                                                Notes
                                                                            </th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {operation.parameters.map(
                                                                            (
                                                                                parameter,
                                                                            ) => (
                                                                                <tr
                                                                                    key={[
                                                                                        operation.method,
                                                                                        operation.path,
                                                                                        String(
                                                                                            parameter.location,
                                                                                        ),
                                                                                        String(
                                                                                            parameter.name,
                                                                                        ),
                                                                                    ].join(
                                                                                        "-",
                                                                                    )}
                                                                                >
                                                                                    <td className="border-t border-border/50 px-3 py-2 align-top">
                                                                                        <div className="font-medium text-foreground">
                                                                                            {
                                                                                                parameter.name
                                                                                            }
                                                                                        </div>
                                                                                        {parameter.required ? (
                                                                                            <div className="mt-1 text-xs uppercase tracking-wide text-rose-600 dark:text-rose-300">
                                                                                                required
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </td>
                                                                                    <td className="border-t border-border/50 px-3 py-2 text-muted-foreground">
                                                                                        {
                                                                                            parameter.location
                                                                                        }
                                                                                    </td>
                                                                                    <td className="border-t border-border/50 px-3 py-2 font-mono text-xs text-muted-foreground sm:text-sm">
                                                                                        {
                                                                                            parameter.schema
                                                                                        }
                                                                                    </td>
                                                                                    <td className="border-t border-border/50 px-3 py-2 text-sm text-muted-foreground">
                                                                                        {parameter.description ||
                                                                                            "-"}
                                                                                    </td>
                                                                                </tr>
                                                                            ),
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <p className="mt-3 text-sm text-muted-foreground">
                                                                No explicit
                                                                parameters.
                                                            </p>
                                                        )}
                                                    </section>

                                                    <section className="rounded-2xl border border-border/50 bg-background/70 p-4">
                                                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                            Request Body
                                                        </div>
                                                        {operation.requestBody ? (
                                                            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                                                                <div>
                                                                    <span className="font-medium text-foreground">
                                                                        Required:
                                                                    </span>{" "}
                                                                    {operation
                                                                        .requestBody
                                                                        .required
                                                                        ? "yes"
                                                                        : "no"}
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-foreground">
                                                                        Content
                                                                        types:
                                                                    </span>{" "}
                                                                    {operation
                                                                        .requestBody
                                                                        .contentTypes
                                                                        .length >
                                                                    0
                                                                        ? operation.requestBody.contentTypes.join(
                                                                              ", ",
                                                                          )
                                                                        : "none"}
                                                                </div>
                                                                <div>
                                                                    <span className="font-medium text-foreground">
                                                                        Schema:
                                                                    </span>{" "}
                                                                    <span className="font-mono text-xs sm:text-sm">
                                                                        {
                                                                            operation
                                                                                .requestBody
                                                                                .schema
                                                                        }
                                                                    </span>
                                                                </div>
                                                                <div className="rounded-xl border border-border/50 bg-card/50 p-3">
                                                                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                                        Body
                                                                        Fields
                                                                    </div>
                                                                    <ApiSchemaPanel
                                                                        schema={
                                                                            operation
                                                                                .requestBody
                                                                                .schemaDetails
                                                                        }
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="mt-3 text-sm text-muted-foreground">
                                                                No request body.
                                                            </p>
                                                        )}
                                                    </section>
                                                </div>

                                                <section className="rounded-2xl border border-border/50 bg-background/70 p-4">
                                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                        Responses
                                                    </div>
                                                    <div className="mt-3 space-y-3">
                                                        {operation.responses.map(
                                                            (response) => (
                                                                <div
                                                                    className="rounded-xl border border-border/50 bg-card/60 p-3"
                                                                    key={[
                                                                        operation.method,
                                                                        operation.path,
                                                                        String(
                                                                            response.status,
                                                                        ),
                                                                    ].join("-")}
                                                                >
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span
                                                                            className={`inline-flex rounded-full px-2.5 py-1 font-mono text-xs font-semibold tracking-wide ${statusClassName(String(response.status))}`}
                                                                        >
                                                                            {
                                                                                response.status
                                                                            }
                                                                        </span>
                                                                        {response.description ? (
                                                                            <span className="text-sm text-muted-foreground">
                                                                                {
                                                                                    response.description
                                                                                }
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                                                                        <div>
                                                                            <span className="font-medium text-foreground">
                                                                                Content
                                                                                types:
                                                                            </span>{" "}
                                                                            {response
                                                                                .contentTypes
                                                                                .length >
                                                                            0
                                                                                ? response.contentTypes.join(
                                                                                      ", ",
                                                                                  )
                                                                                : "none"}
                                                                        </div>
                                                                        <div>
                                                                            <span className="font-medium text-foreground">
                                                                                Schema:
                                                                            </span>{" "}
                                                                            <span className="font-mono text-xs sm:text-sm">
                                                                                {
                                                                                    response.schema
                                                                                }
                                                                            </span>
                                                                        </div>
                                                                        <div className="rounded-xl border border-border/50 bg-background/70 p-3">
                                                                            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                                                                Response
                                                                                Fields
                                                                            </div>
                                                                            <ApiSchemaPanel
                                                                                schema={
                                                                                    response.schemaDetails
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ),
                                                        )}
                                                    </div>
                                                </section>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    No operations are currently grouped under
                                    this tag.
                                </p>
                            )}
                        </section>
                    ))}
                </div>
            </div>
        </DocsShell>
    );
}
