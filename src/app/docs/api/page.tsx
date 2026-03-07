import type { Metadata } from "next";

import { DocsShell } from "@/components/docs-shell";
import type { ApiSchemaField, ApiSchemaSummary } from "@/lib/docs";
import { getApiReferenceData, getTagAnchorId } from "@/lib/docs";

function methodClassName(method: string) {
    switch (method) {
        case "GET": {
            return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
        }
        case "POST": {
            return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
        }
        case "PUT":
        case "PATCH": {
            return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
        }
        case "DELETE": {
            return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
        }
        default: {
            return "bg-primary/10 text-primary";
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

type FlattenedSchemaField = ApiSchemaField & {
    depth: number;
    path: string;
};

export const metadata: Metadata = {
    title: "API Reference | Docs | firepit",
    description:
        "OpenAPI-backed API reference with per-endpoint request and response details for Firepit.",
};

function flattenSchemaFields(
    fields: ApiSchemaField[],
    depth = 0,
    parentPath = "",
): FlattenedSchemaField[] {
    const rows: FlattenedSchemaField[] = [];

    for (const field of fields) {
        const isArrayItem = field.name === "item";
        const path = isArrayItem
            ? `${String(parentPath)}[]`
            : parentPath
              ? `${String(parentPath)}.${String(field.name)}`
              : String(field.name);

        rows.push({
            ...field,
            depth,
            path,
        });

        rows.push(...flattenSchemaFields(field.children, depth + 1, path));
    }

    return rows;
}

function SchemaFieldRows({ fields }: { fields: ApiSchemaField[] }) {
    const rows = flattenSchemaFields(fields);

    if (rows.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No structured fields are defined for this schema.
            </p>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
            <div className="hidden gap-x-4 border-b border-border/50 bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(0,1fr)]">
                <div>Field</div>
                <div>Type</div>
                <div>Notes</div>
            </div>

            <div className="divide-y divide-border/40">
                {rows.map((field) => (
                    <div
                        className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0"
                        key={field.path}
                    >
                        <div className="min-w-0">
                            <div
                                className="flex min-w-0 flex-wrap items-start gap-2"
                                style={{ paddingLeft: `${field.depth * 16}px` }}
                            >
                                {field.depth > 0 ? (
                                    <span className="text-xs text-muted-foreground">
                                        {"└"}
                                    </span>
                                ) : null}
                                <span className="min-w-0 break-all font-mono text-xs text-foreground sm:text-sm">
                                    {field.path}
                                </span>
                                <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                                        field.required
                                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                                            : "bg-muted text-muted-foreground"
                                    }`}
                                >
                                    {field.required ? "required" : "optional"}
                                </span>
                            </div>

                            <div
                                className="mt-1 text-xs text-muted-foreground"
                                style={{ paddingLeft: `${field.depth * 16}px` }}
                            >
                                {field.name === "item"
                                    ? "Array item"
                                    : field.children.length > 0
                                      ? `${String(field.children.length)} nested fields`
                                      : "Leaf field"}
                            </div>
                        </div>

                        <div className="min-w-0">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:hidden">
                                Type
                            </div>
                            <div className="font-mono text-xs text-muted-foreground sm:text-sm">
                                {field.type}
                            </div>
                            {field.format ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                    format: {field.format}
                                </div>
                            ) : null}
                        </div>

                        <div className="min-w-0 text-sm text-muted-foreground">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:hidden">
                                Notes
                            </div>
                            {field.description ? (
                                <p className="wrap-break-word">
                                    {field.description}
                                </p>
                            ) : (
                                <p className="text-xs">No description</p>
                            )}

                            {field.defaultValue ||
                            field.enumValues.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                    {field.defaultValue ? (
                                        <span className="rounded-full bg-muted px-2 py-1">
                                            default: {field.defaultValue}
                                        </span>
                                    ) : null}
                                    {field.enumValues.length > 0 ? (
                                        <span className="rounded-full bg-muted px-2 py-1">
                                            enum: {field.enumValues.join(", ")}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SchemaPanel({ schema }: { schema: ApiSchemaSummary | null }) {
    if (!schema) {
        return (
            <p className="text-sm text-muted-foreground">
                No schema details are defined.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">
                    {schema.title}
                </span>
                <span className="font-mono text-xs text-muted-foreground sm:text-sm">
                    {schema.type}
                </span>
            </div>

            {schema.description ? (
                <p className="text-sm text-muted-foreground">
                    {schema.description}
                </p>
            ) : null}

            {schema.format ||
            schema.defaultValue ||
            schema.enumValues.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {schema.format ? (
                        <span className="rounded-full bg-muted px-2 py-1">
                            format: {schema.format}
                        </span>
                    ) : null}
                    {schema.defaultValue ? (
                        <span className="rounded-full bg-muted px-2 py-1">
                            default: {schema.defaultValue}
                        </span>
                    ) : null}
                    {schema.enumValues.length > 0 ? (
                        <span className="rounded-full bg-muted px-2 py-1">
                            enum: {schema.enumValues.join(", ")}
                        </span>
                    ) : null}
                </div>
            ) : null}

            {schema.variants.length > 0 ? (
                <div className="rounded-xl border border-border/50 bg-background/70 p-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                        Variants:
                    </span>{" "}
                    {schema.variants.join(" | ")}
                </div>
            ) : null}

            <SchemaFieldRows fields={schema.fields} />
        </div>
    );
}

export default async function DocsApiPage() {
    const apiReference = await getApiReferenceData();
    const operationTags = apiReference.tags.filter(
        (tag) => tag.operations.length > 0,
    );

    return (
        <DocsShell
            aside={
                <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Jump To Tag
                    </div>
                    <div className="space-y-2">
                        {operationTags.map((tag) => (
                            <a
                                className="block rounded-xl px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                href={`#${String(getTagAnchorId(tag.name))}`}
                                key={tag.name}
                            >
                                {tag.name}
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
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {apiReference.operationCount} total endpoints
                        </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        {operationTags.map((tag) => (
                            <div
                                className="rounded-2xl border border-border/50 bg-card/60 p-4"
                                key={`${tag.name}-index`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="font-semibold tracking-tight text-foreground">
                                        {tag.name}
                                    </h3>
                                    <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                        {tag.operations.length}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-2">
                                    {tag.operations.map((operation) => (
                                        <a
                                            className="flex items-start gap-2 rounded-xl px-2 py-2 text-sm transition-colors hover:bg-background/70"
                                            href={`#${String(operation.anchorId)}`}
                                            key={[
                                                String(operation.anchorId),
                                                "index",
                                            ].join("-")}
                                        >
                                            <span
                                                className={`inline-flex min-w-14 justify-center rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.14em] ${methodClassName(operation.method)}`}
                                            >
                                                {operation.method}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate font-mono text-xs text-foreground sm:text-sm">
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
                            id={getTagAnchorId(tag.name)}
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

                            {tag.operations.length > 0 ? (
                                <div className="mt-5 space-y-4">
                                    {tag.operations.map((operation) => (
                                        <article
                                            className="rounded-2xl border border-border/50 bg-card/60 p-5"
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
                                                        <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tracking-wide text-muted-foreground">
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
                                                            className="text-xs font-semibold uppercase tracking-[0.16em] text-primary hover:underline"
                                                            href={`#${String(operation.anchorId)}`}
                                                        >
                                                            Deep link
                                                        </a>
                                                    </div>
                                                    <div className="font-mono text-xs text-foreground sm:text-sm">
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
                                                                    <SchemaPanel
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
                                                                        <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tracking-wide text-foreground">
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
                                                                            <SchemaPanel
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
