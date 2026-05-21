"use client";

import { ChevronDown, ChevronRight, Expand, Minimize2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ApiSchemaField, ApiSchemaSummary } from "@/lib/docs";

type FlattenedSchemaField = ApiSchemaField & {
    ancestors: string[];
    depth: number;
    path: string;
};

const SUMMARY_DEPTH = 1;

function flattenSchemaFields(
    fields: ApiSchemaField[],
    depth = 0,
    parentPath = "",
    ancestors: string[] = [],
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
            ancestors,
            depth,
            path,
        });

        rows.push(
            ...flattenSchemaFields(field.children, depth + 1, path, [
                ...ancestors,
                path,
            ]),
        );
    }

    return rows;
}

function defaultCollapsedPaths(rows: FlattenedSchemaField[]) {
    return rows
        .filter((row) => row.children.length > 0 && row.depth > SUMMARY_DEPTH)
        .map((row) => row.path);
}

function hasCollapsedAncestor(
    row: FlattenedSchemaField,
    collapsedPaths: Set<string>,
) {
    return row.ancestors.some((ancestor) => collapsedPaths.has(ancestor));
}

export function ApiSchemaPanel({
    schema,
}: {
    schema: ApiSchemaSummary | null;
}) {
    const [showFullTree, setShowFullTree] = useState(false);
    const rows = schema ? flattenSchemaFields(schema.fields) : [];
    const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
        () => new Set(defaultCollapsedPaths(rows)),
    );

    if (!schema) {
        return (
            <p className="text-sm text-muted-foreground">
                No schema details are defined.
            </p>
        );
    }

    const hasDeepFields = rows.some((row) => row.depth > SUMMARY_DEPTH);
    const visibleRows = rows.filter((row) => {
        if (!showFullTree && row.depth > SUMMARY_DEPTH) {
            return false;
        }

        return !hasCollapsedAncestor(row, collapsedPaths);
    });

    function toggleBranch(path: string) {
        setCollapsedPaths((current) => {
            const next = new Set(current);

            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }

            return next;
        });
    }

    function toggleDetailMode() {
        setShowFullTree((current) => !current);
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

            {hasDeepFields ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/60 px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                        {showFullTree
                            ? "Showing the full schema tree. Nested sections can be collapsed individually."
                            : "Showing a summary of the top schema levels. Expand to inspect every nested field."}
                    </p>
                    <Button
                        onClick={toggleDetailMode}
                        size="sm"
                        type="button"
                        variant="outline"
                    >
                        {showFullTree ? <Minimize2 /> : <Expand />}
                        {showFullTree
                            ? "Show summarized view"
                            : "Show full field tree"}
                    </Button>
                </div>
            ) : null}

            {visibleRows.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
                    <div className="hidden gap-x-4 border-b border-border/50 bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(0,1fr)]">
                        <div>Field</div>
                        <div>Type</div>
                        <div>Notes</div>
                    </div>

                    <div className="divide-y divide-border/40">
                        {visibleRows.map((field) => {
                            const isCollapsed = collapsedPaths.has(field.path);
                            const canCollapse = field.children.length > 0;

                            return (
                                <div
                                    className="grid grid-cols-1 gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.7fr)_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0"
                                    key={field.path}
                                >
                                    <div className="min-w-0">
                                        <div
                                            className="flex min-w-0 flex-wrap items-start gap-2"
                                            style={{
                                                paddingLeft: `${field.depth * 16}px`,
                                            }}
                                        >
                                            {canCollapse ? (
                                                <button
                                                    aria-expanded={!isCollapsed}
                                                    className="inline-flex items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                                                    onClick={() =>
                                                        toggleBranch(field.path)
                                                    }
                                                    type="button"
                                                >
                                                    {isCollapsed ? (
                                                        <ChevronRight className="size-4" />
                                                    ) : (
                                                        <ChevronDown className="size-4" />
                                                    )}
                                                </button>
                                            ) : field.depth > 0 ? (
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
                                                {field.required
                                                    ? "required"
                                                    : "optional"}
                                            </span>
                                        </div>

                                        <div
                                            className="mt-1 text-xs text-muted-foreground"
                                            style={{
                                                paddingLeft: `${field.depth * 16}px`,
                                            }}
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
                                            <p className="text-xs">
                                                No description
                                            </p>
                                        )}

                                        {field.defaultValue ||
                                        field.enumValues.length > 0 ? (
                                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                                {field.defaultValue ? (
                                                    <span className="rounded-full bg-muted px-2 py-1">
                                                        default:{" "}
                                                        {field.defaultValue}
                                                    </span>
                                                ) : null}
                                                {field.enumValues.length > 0 ? (
                                                    <span className="rounded-full bg-muted px-2 py-1">
                                                        enum:{" "}
                                                        {field.enumValues.join(
                                                            ", ",
                                                        )}
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    No structured fields are defined for this schema.
                </p>
            )}
        </div>
    );
}
