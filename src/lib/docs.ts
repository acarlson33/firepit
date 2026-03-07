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

export type DocsPageMeta = (typeof docsPages)[number];

export type DocsTocEntry = {
    id: string;
    title: string;
    level: 2 | 3;
};

export type DocsPage = DocsPageMeta & {
    content: string;
    tableOfContents: DocsTocEntry[];
};

type OpenApiTag = {
    name: string;
    description?: string;
};

type OpenApiOperation = {
    summary?: string;
    tags?: string[];
};

type OpenApiSpec = {
    info?: {
        title?: string;
        version?: string;
        description?: string;
    };
    servers?: Array<{
        url?: string;
        description?: string;
    }>;
    tags?: OpenApiTag[];
    paths?: Record<string, Record<string, OpenApiOperation>>;
};

export type ApiOperationSummary = {
    method: string;
    path: string;
    summary: string;
};

export type ApiTagSummary = {
    name: string;
    description: string;
    operations: ApiOperationSummary[];
};

export type ApiReferenceData = {
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

function slugifyHeading(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

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

function stripLeadingTitle(content: string) {
    return content.replace(/^#\s+.+\n+/, "");
}

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

export async function getApiReferenceData(): Promise<ApiReferenceData> {
    const raw = await readFile(OPENAPI_FILE, "utf8");
    const parsed = parse(raw) as OpenApiSpec;
    const pathEntries = Object.entries(parsed.paths || {});
    const methodNames = ["get", "post", "put", "patch", "delete"] as const;

    const operations = pathEntries.flatMap(([path, value]) =>
        methodNames.flatMap((method) => {
            const operation = value[method];
            if (!operation) {
                return [];
            }

            return [
                {
                    method: method.toUpperCase(),
                    path,
                    summary:
                        operation.summary || `${method.toUpperCase()} ${path}`,
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
                .sort((left, right) => left.path.localeCompare(right.path));

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
