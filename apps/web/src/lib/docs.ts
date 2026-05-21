import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

const DOCS_DIR = join(process.cwd(), "docs");
const OPENAPI_FILE = join(DOCS_DIR, "openapi-doc.yml");

export const docsPages = [
    {
        slug: "product-and-onboarding",
        title: "Product And Onboarding",
        description:
            "Product overview, account setup, onboarding, discovery, and user-facing flows.",
        fileName: "PRODUCT_AND_ONBOARDING.md",
    },
    {
        slug: "chat-and-realtime",
        title: "Chat And Realtime",
        description:
            "Messaging, DMs, reactions, threads, pins, presence, uploads, and notifications.",
        fileName: "CHAT_AND_REALTIME.md",
    },
    {
        slug: "server-administration",
        title: "Server Administration",
        description:
            "Server lifecycle, invites, roles, permission overrides, moderation, and audit logging.",
        fileName: "SERVER_ADMINISTRATION.md",
    },
    {
        slug: "feature-flags",
        title: "Feature Flags",
        description:
            "Current flags, rollout defaults, and how feature-gated behavior is managed.",
        fileName: "FEATURE_FLAGS.md",
    },
    {
        slug: "platform-operations",
        title: "Platform Operations",
        description:
            "Runtime stack, performance strategy, monitoring, releases, and operational notes.",
        fileName: "PLATFORM_OPERATIONS.md",
    },
] as const;

type DocsPageMeta = (typeof docsPages)[number];

type DocsTocEntry = {
    id: string;
    title: string;
    level: 2 | 3;
};

type DocsPage = DocsPageMeta & {
    content: string;
    tableOfContents: DocsTocEntry[];
};

type OpenApiTag = {
    name: string;
    description?: string;
};

type OpenApiSchema = {
    $ref?: string;
    type?: string;
    description?: string;
    format?: string;
    enum?: string[];
    required?: string[];
    default?: unknown;
    items?: OpenApiSchema;
    oneOf?: OpenApiSchema[];
    anyOf?: OpenApiSchema[];
    allOf?: OpenApiSchema[];
    properties?: Record<string, OpenApiSchema>;
    additionalProperties?: boolean | OpenApiSchema;
};

type OpenApiParameter = {
    name?: string;
    in?: string;
    required?: boolean;
    description?: string;
    schema?: OpenApiSchema;
};

type OpenApiMediaType = {
    schema?: OpenApiSchema;
};

type OpenApiRequestBody = {
    required?: boolean;
    content?: Record<string, OpenApiMediaType>;
};

type OpenApiResponse = {
    description?: string;
    content?: Record<string, OpenApiMediaType>;
};

type OpenApiSecurityRequirement = Record<string, unknown>;

type OpenApiOperation = {
    summary?: string;
    description?: string;
    tags?: string[];
    security?: OpenApiSecurityRequirement[];
    parameters?: OpenApiParameter[];
    requestBody?: OpenApiRequestBody;
    responses?: Record<string, OpenApiResponse>;
};

type OpenApiPathItem = {
    get?: OpenApiOperation;
    post?: OpenApiOperation;
    put?: OpenApiOperation;
    patch?: OpenApiOperation;
    delete?: OpenApiOperation;
    parameters?: OpenApiParameter[];
};

type OpenApiSpec = {
    info?: {
        title?: string;
        version?: string;
        description?: string;
    };
    security?: OpenApiSecurityRequirement[];
    servers?: Array<{
        url?: string;
        description?: string;
    }>;
    tags?: OpenApiTag[];
    components?: {
        schemas?: Record<string, OpenApiSchema>;
    };
    paths?: Record<string, OpenApiPathItem>;
};

type ApiOperationSummary = {
    anchorId: string;
    method: string;
    path: string;
    summary: string;
};

export type ApiSchemaField = {
    name: string;
    type: string;
    required: boolean;
    description: string;
    format: string;
    defaultValue: string;
    enumValues: string[];
    children: ApiSchemaField[];
};

export type ApiSchemaSummary = {
    title: string;
    type: string;
    description: string;
    format: string;
    defaultValue: string;
    enumValues: string[];
    variants: string[];
    fields: ApiSchemaField[];
};

type ApiParameterSummary = {
    name: string;
    location: string;
    required: boolean;
    description: string;
    schema: string;
};

type ApiRequestBodySummary = {
    required: boolean;
    contentTypes: string[];
    schema: string;
    schemaDetails: ApiSchemaSummary | null;
};

type ApiResponseSummary = {
    status: string;
    description: string;
    contentTypes: string[];
    schema: string;
    schemaDetails: ApiSchemaSummary | null;
};

type ApiOperationDetail = ApiOperationSummary & {
    description: string;
    auth: "public" | "session" | "mixed";
    parameters: ApiParameterSummary[];
    requestBody: ApiRequestBodySummary | null;
    responses: ApiResponseSummary[];
};

type ApiTagSummary = {
    name: string;
    description: string;
    operations: ApiOperationDetail[];
};

type ApiReferenceData = {
    title: string;
    version: string;
    description: string;
    servers: Array<{
        url: string;
        description: string;
    }>;
    operationCount: number;
    tagCount: number;
    tags: ApiTagSummary[];
};

const docsPageMap = new Map<string, DocsPageMeta>(
    docsPages.map((page) => [page.slug, page]),
);

/**
 * Handles slugify heading.
 *
 * @param {string} value - The value value.
 * @returns {string} The return value.
 */
function slugifyHeading(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

/**
 * Handles extract table of contents.
 *
 * @param {string} content - The content value.
 * @returns {DocsTocEntry[]} The return value.
 */
function extractTableOfContents(content: string): DocsTocEntry[] {
    const entries: DocsTocEntry[] = [];

    for (const line of content.split("\n")) {
        if (line.startsWith("## ")) {
            const title = line.slice(3).trim();
            entries.push({ id: slugifyHeading(title), title, level: 2 });
        }

        if (line.startsWith("### ")) {
            const title = line.slice(4).trim();
            entries.push({ id: slugifyHeading(title), title, level: 3 });
        }
    }

    return entries;
}

/**
 * Handles strip leading title.
 *
 * @param {string} content - The content value.
 * @returns {string} The return value.
 */
function stripLeadingTitle(content: string) {
    return content.replace(/^#\s+.+\n+/, "");
}

/**
 * Returns ref name.
 *
 * @param {string} ref - The ref value.
 * @returns {string} The return value.
 */
function getRefName(ref: string) {
    const parts = ref.split("/");
    return parts.at(-1) || ref;
}

/**
 * Handles unique strings.
 *
 * @param {string[]} values - The values value.
 * @returns {string[]} The return value.
 */
function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}

/**
 * Handles format default value.
 *
 * @param {unknown} value - The value value.
 * @returns {string} The return value.
 */
function formatDefaultValue(value: unknown) {
    if (value === undefined) {
        return "";
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return String(value);
    }

    return JSON.stringify(value);
}

/**
 * Handles describe schema.
 *
 * @param {OpenApiSchema | undefined} schema - The schema value, if provided.
 * @returns {string} The return value.
 */
function describeSchema(schema?: OpenApiSchema): string {
    if (!schema) {
        return "none";
    }

    if (schema.$ref) {
        return getRefName(schema.$ref);
    }

    if (schema.enum && schema.enum.length > 0) {
        return schema.enum.join(" | ");
    }

    if (schema.oneOf && schema.oneOf.length > 0) {
        return schema.oneOf.map((item) => describeSchema(item)).join(" | ");
    }

    if (schema.anyOf && schema.anyOf.length > 0) {
        return schema.anyOf.map((item) => describeSchema(item)).join(" | ");
    }

    if (schema.allOf && schema.allOf.length > 0) {
        return schema.allOf.map((item) => describeSchema(item)).join(" & ");
    }

    if (schema.type === "array") {
        return `array<${describeSchema(schema.items)}>`;
    }

    if (schema.type === "object") {
        if (schema.properties && Object.keys(schema.properties).length > 0) {
            return `object{${Object.keys(schema.properties).join(", ")}}`;
        }

        if (
            schema.additionalProperties &&
            typeof schema.additionalProperties === "object"
        ) {
            return `record<string, ${describeSchema(schema.additionalProperties)}>`;
        }

        return "object";
    }

    return schema.type || "unknown";
}

/**
 * Handles merge all of schemas.
 *
 * @param {OpenApiSchema[]} schemas - The schemas value.
 * @param {OpenApiSchema | undefined} baseSchema - The base schema value, if provided.
 * @returns {{ $ref?: string | undefined; type?: string | undefined; description?: string | undefined; format?: string | undefined; enum?: string[] | undefined; required?: string[] | undefined; default?: unknown; items?: OpenApiSchema | undefined; oneOf?: OpenApiSchema[] | undefined; anyOf?: OpenApiSchema[] | undefined; allOf?: OpenApiSchema[] | undefined; properties?: Record<string, OpenApiSchema> | undefined; additionalProperties?: boolean | OpenApiSchema | undefined; }} The return value.
 */
function mergeAllOfSchemas(
    schemas: OpenApiSchema[],
    baseSchema?: OpenApiSchema,
): OpenApiSchema {
    const merged: OpenApiSchema = {
        ...baseSchema,
        allOf: undefined,
        properties: {},
        required: [],
    };

    for (const schema of schemas) {
        if (!merged.type && schema.type) {
            merged.type = schema.type;
        }

        if (!merged.description && schema.description) {
            merged.description = schema.description;
        }

        if (!merged.format && schema.format) {
            merged.format = schema.format;
        }

        if (merged.default === undefined && schema.default !== undefined) {
            merged.default = schema.default;
        }

        if (!merged.enum && schema.enum) {
            merged.enum = schema.enum;
        }

        if (!merged.items && schema.items) {
            merged.items = schema.items;
        }

        if (
            merged.additionalProperties === undefined &&
            schema.additionalProperties !== undefined
        ) {
            merged.additionalProperties = schema.additionalProperties;
        }

        if (schema.properties) {
            merged.properties = {
                ...(merged.properties || {}),
                ...schema.properties,
            };
        }

        if (schema.required) {
            merged.required = uniqueStrings([
                ...(merged.required || []),
                ...schema.required,
            ]);
        }
    }

    if (merged.properties && Object.keys(merged.properties).length > 0) {
        merged.type = "object";
    }

    return merged;
}

/**
 * Handles resolve schema.
 *
 * @param {OpenApiSchema | undefined} schema - The schema value.
 * @param {{ [x: string]: OpenApiSchema; }} schemas - The schemas value.
 * @param {Set<string>} seenRefs - The seen refs value, if provided.
 * @returns {OpenApiSchema | undefined} The return value.
 */
function resolveSchema(
    schema: OpenApiSchema | undefined,
    schemas: Record<string, OpenApiSchema>,
    seenRefs = new Set<string>(),
): OpenApiSchema | undefined {
    if (!schema) {
        return undefined;
    }

    if (schema.$ref) {
        const refName = getRefName(schema.$ref);
        if (seenRefs.has(refName)) {
            return schema;
        }

        const referencedSchema = schemas[refName];
        if (!referencedSchema) {
            return schema;
        }

        const { $ref: _ref, ...overrides } = schema;
        return resolveSchema(
            { ...referencedSchema, ...overrides },
            schemas,
            new Set([...seenRefs, refName]),
        );
    }

    const resolvedSchema: OpenApiSchema = {
        ...schema,
    };

    if (resolvedSchema.allOf && resolvedSchema.allOf.length > 0) {
        return mergeAllOfSchemas(
            resolvedSchema.allOf
                .map((item) => resolveSchema(item, schemas, seenRefs))
                .filter((item): item is OpenApiSchema => Boolean(item)),
            resolvedSchema,
        );
    }

    if (resolvedSchema.items) {
        resolvedSchema.items = resolveSchema(
            resolvedSchema.items,
            schemas,
            seenRefs,
        );
    }

    if (resolvedSchema.oneOf) {
        resolvedSchema.oneOf = resolvedSchema.oneOf
            .map((item) => resolveSchema(item, schemas, seenRefs))
            .filter((item): item is OpenApiSchema => Boolean(item));
    }

    if (resolvedSchema.anyOf) {
        resolvedSchema.anyOf = resolvedSchema.anyOf
            .map((item) => resolveSchema(item, schemas, seenRefs))
            .filter((item): item is OpenApiSchema => Boolean(item));
    }

    if (resolvedSchema.properties) {
        resolvedSchema.properties = Object.fromEntries(
            Object.entries(resolvedSchema.properties).map(([key, value]) => [
                key,
                resolveSchema(value, schemas, seenRefs) || value,
            ]),
        );
    }

    if (
        resolvedSchema.additionalProperties &&
        typeof resolvedSchema.additionalProperties === "object"
    ) {
        resolvedSchema.additionalProperties =
            resolveSchema(
                resolvedSchema.additionalProperties,
                schemas,
                seenRefs,
            ) || resolvedSchema.additionalProperties;
    }

    return resolvedSchema;
}

/**
 * Returns schema variants.
 *
 * @param {OpenApiSchema | undefined} schema - The schema value.
 * @returns {string[]} The return value.
 */
function getSchemaVariants(schema: OpenApiSchema | undefined): string[] {
    if (!schema) {
        return [];
    }

    if (schema.oneOf && schema.oneOf.length > 0) {
        return schema.oneOf.map((item) => describeSchema(item));
    }

    if (schema.anyOf && schema.anyOf.length > 0) {
        return schema.anyOf.map((item) => describeSchema(item));
    }

    return [];
}

/**
 * Returns schema fields.
 *
 * @param {OpenApiSchema | undefined} schema - The schema value.
 * @param {{ [x: string]: OpenApiSchema; }} schemas - The schemas value.
 * @returns {ApiSchemaField[]} The return value.
 */
function getSchemaFields(
    schema: OpenApiSchema | undefined,
    schemas: Record<string, OpenApiSchema>,
): ApiSchemaField[] {
    const resolvedSchema = resolveSchema(schema, schemas);

    if (!resolvedSchema) {
        return [];
    }

    if (resolvedSchema.properties) {
        const requiredFields = new Set(resolvedSchema.required || []);

        return Object.entries(resolvedSchema.properties).map(
            ([name, propertySchema]) => {
                const resolvedProperty = resolveSchema(propertySchema, schemas);
                const childSchema =
                    resolvedProperty?.type === "array"
                        ? resolvedProperty.items
                        : resolvedProperty;

                return {
                    name,
                    type: describeSchema(resolvedProperty),
                    required: requiredFields.has(name),
                    description: resolvedProperty?.description || "",
                    format: resolvedProperty?.format || "",
                    defaultValue: formatDefaultValue(resolvedProperty?.default),
                    enumValues: resolvedProperty?.enum || [],
                    children:
                        childSchema === resolvedProperty
                            ? getSchemaFields(
                                  childSchema?.properties
                                      ? childSchema
                                      : undefined,
                                  schemas,
                              )
                            : getSchemaFields(childSchema, schemas),
                };
            },
        );
    }

    if (resolvedSchema.type === "array" && resolvedSchema.items) {
        const resolvedItems = resolveSchema(resolvedSchema.items, schemas);
        return [
            {
                name: "item",
                type: describeSchema(resolvedItems),
                required: true,
                description: resolvedItems?.description || "",
                format: resolvedItems?.format || "",
                defaultValue: formatDefaultValue(resolvedItems?.default),
                enumValues: resolvedItems?.enum || [],
                children: getSchemaFields(resolvedItems, schemas),
            },
        ];
    }

    return [];
}

/**
 * Returns schema summary.
 *
 * @param {OpenApiSchema | undefined} schema - The schema value.
 * @param {{ [x: string]: OpenApiSchema; }} schemas - The schemas value.
 * @returns {ApiSchemaSummary | null} The return value.
 */
function getSchemaSummary(
    schema: OpenApiSchema | undefined,
    schemas: Record<string, OpenApiSchema>,
): ApiSchemaSummary | null {
    const resolvedSchema = resolveSchema(schema, schemas);

    if (!resolvedSchema) {
        return null;
    }

    return {
        title: schema?.$ref
            ? getRefName(schema.$ref)
            : describeSchema(resolvedSchema),
        type: describeSchema(resolvedSchema),
        description: resolvedSchema.description || "",
        format: resolvedSchema.format || "",
        defaultValue: formatDefaultValue(resolvedSchema.default),
        enumValues: resolvedSchema.enum || [],
        variants: getSchemaVariants(resolvedSchema),
        fields: getSchemaFields(resolvedSchema, schemas),
    };
}

/**
 * Handles summarize content.
 *
 * @param {Record<string, OpenApiMediaType> | undefined} content - The content value.
 * @param {{ [x: string]: OpenApiSchema; }} schemas - The schemas value.
 * @returns {{ contentTypes: string[]; schema: string; schemaDetails: ApiSchemaSummary | null; }} The return value.
 */
function summarizeContent(
    content: Record<string, OpenApiMediaType> | undefined,
    schemas: Record<string, OpenApiSchema>,
): {
    contentTypes: string[];
    schema: string;
    schemaDetails: ApiSchemaSummary | null;
} {
    const entries = Object.entries(content || {});

    if (entries.length === 0) {
        return {
            contentTypes: [],
            schema: "none",
            schemaDetails: null,
        };
    }

    const contentTypes = entries.map(([contentType]) => contentType);
    const schemaDescriptions = Array.from(
        new Set(
            entries.map(([, mediaType]) => describeSchema(mediaType.schema)),
        ),
    );
    const primarySchema = entries[0]?.[1].schema;

    return {
        contentTypes,
        schema:
            schemaDescriptions.length === 1
                ? schemaDescriptions[0]
                : schemaDescriptions.join(" | "),
        schemaDetails: getSchemaSummary(primarySchema, schemas),
    };
}

/**
 * Returns auth type.
 *
 * @param {OpenApiSecurityRequirement[] | undefined} operationSecurity - The operation security value.
 * @param {boolean} hasGlobalSecurity - The has global security value.
 * @returns {'public' | 'session' | 'mixed'} The return value.
 */
function getAuthType(
    operationSecurity: OpenApiSecurityRequirement[] | undefined,
    hasGlobalSecurity: boolean,
): "public" | "session" | "mixed" {
    if (!operationSecurity) {
        return hasGlobalSecurity ? "session" : "public";
    }

    if (operationSecurity.length === 0) {
        return "public";
    }

    if (operationSecurity.some((entry) => Object.keys(entry).length === 0)) {
        return "mixed";
    }

    return "session";
}

/**
 * Returns tag anchor id.
 *
 * @param {string} name - The name value.
 * @returns {string} The return value.
 */
function getTagAnchorId(name: string) {
    return `tag-${slugifyHeading(name)}`;
}

/**
 * Returns operation anchor id.
 *
 * @param {string} method - The method value.
 * @param {string} path - The path value.
 * @returns {string} The return value.
 */
function getOperationAnchorId(method: string, path: string) {
    return `operation-${slugifyHeading(`${method}-${path}`)}`;
}

/**
 * Returns doc page.
 *
 * @param {string} slug - The slug value.
 * @returns {Promise<DocsPage | null>} The return value.
 */
export async function getDocPage(slug: string): Promise<DocsPage | null> {
    const page = docsPageMap.get(slug);
    if (!page) {
        return null;
    }

    const rawContent = await readFile(join(DOCS_DIR, page.fileName), "utf8");
    const content = stripLeadingTitle(rawContent);

    return {
        ...page,
        content,
        tableOfContents: extractTableOfContents(content),
    };
}

/**
 * Returns api reference data.
 * @returns {Promise<ApiReferenceData>} The return value.
 */
export async function getApiReferenceData(): Promise<ApiReferenceData> {
    const raw = await readFile(OPENAPI_FILE, "utf8");
    const parsed = parse(raw) as OpenApiSpec;
    const pathEntries = Object.entries(parsed.paths || {});
    const methodNames = ["get", "post", "put", "patch", "delete"] as const;
    const hasGlobalSecurity = Boolean(
        parsed.security && parsed.security.length > 0,
    );
    const schemas = parsed.components?.schemas || {};

    const operations = pathEntries.flatMap(([path, value]) =>
        methodNames.flatMap((method) => {
            const operation = value[method];
            if (!operation) {
                return [];
            }

            const parameters = [
                ...(value.parameters || []),
                ...(operation.parameters || []),
            ].map((parameter) => ({
                name: parameter.name || "unknown",
                location: parameter.in || "unknown",
                required: Boolean(parameter.required),
                description: parameter.description || "",
                schema: describeSchema(parameter.schema),
            }));

            const requestBody = operation.requestBody
                ? {
                      required: Boolean(operation.requestBody.required),
                      ...summarizeContent(
                          operation.requestBody.content,
                          schemas,
                      ),
                  }
                : null;

            const responses = Object.entries(operation.responses || {})
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([status, response]) => ({
                    status,
                    description: response.description || "",
                    ...summarizeContent(response.content, schemas),
                }));

            return [
                {
                    anchorId: getOperationAnchorId(method.toUpperCase(), path),
                    method: method.toUpperCase(),
                    path,
                    summary:
                        operation.summary || `${method.toUpperCase()} ${path}`,
                    description: operation.description || "",
                    auth: getAuthType(operation.security, hasGlobalSecurity),
                    parameters,
                    requestBody,
                    responses,
                    tags: operation.tags || ["Other"],
                },
            ];
        }),
    );

    const knownTags = parsed.tags || [];
    const tagNames = new Set<string>(knownTags.map((tag) => tag.name));

    for (const operation of operations) {
        for (const tag of operation.tags) {
            tagNames.add(tag);
        }
    }

    const tags = Array.from(tagNames)
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
            const matchedTag = knownTags.find((tag) => tag.name === name);
            const tagOperations = operations
                .filter((operation) => operation.tags.includes(name))
                .map(({ tags: _tags, ...operation }) => operation)
                .sort((left, right) => {
                    const pathOrder = left.path.localeCompare(right.path);
                    if (pathOrder !== 0) {
                        return pathOrder;
                    }

                    return left.method.localeCompare(right.method);
                });

            return {
                name,
                description: matchedTag?.description || "",
                operations: tagOperations,
            };
        });

    return {
        title: parsed.info?.title || "API Reference",
        version: parsed.info?.version || "0.0.0",
        description: parsed.info?.description || "",
        servers: (parsed.servers || []).map((server) => ({
            url: server.url || "",
            description: server.description || "",
        })),
        operationCount: operations.length,
        tagCount: tags.length,
        tags,
    };
}

export { getTagAnchorId };
