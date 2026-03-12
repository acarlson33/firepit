import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { listInboxItems } from "@/lib/inbox";
import type { InboxItemKind } from "@/lib/types";
import { Query } from "node-appwrite";

const VALID_KINDS: InboxItemKind[] = ["mention", "thread"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const env = getEnvConfig();

function parseKinds(searchParams: URLSearchParams) {
    const requested = searchParams
        .getAll("kind")
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean);

    if (requested.length === 0) {
        return VALID_KINDS;
    }

    const invalidKinds = requested.filter(
        (value) => !VALID_KINDS.includes(value as InboxItemKind),
    );

    if (invalidKinds.length > 0) {
        return null;
    }

    return Array.from(new Set(requested)) as InboxItemKind[];
}

function parseLimit(value: string | null) {
    if (!value) {
        return DEFAULT_LIMIT;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
        return null;
    }

    return parsed;
}

export async function GET(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const kinds = parseKinds(searchParams);
    if (!kinds) {
        return NextResponse.json(
            { error: "kind must be one or more of mention,thread" },
            { status: 400 },
        );
    }

    const limit = parseLimit(searchParams.get("limit"));
    if (!limit) {
        return NextResponse.json(
            { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
            { status: 400 },
        );
    }

    const inbox = await listInboxItems({
        kinds,
        limit,
        userId: session.$id,
    });

    return NextResponse.json(inbox);
}

export async function PATCH(request: NextRequest) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const body = (await request.json().catch(() => null)) as {
        itemIds?: unknown;
    } | null;
    const itemIds = Array.isArray(body?.itemIds)
        ? body.itemIds.filter(
              (value): value is string =>
                  typeof value === "string" && value.trim().length > 0,
          )
        : [];

    if (itemIds.length === 0) {
        return NextResponse.json(
            { error: "itemIds must contain at least one inbox item id" },
            { status: 400 },
        );
    }

    const { databases } = getAdminClient();
    const documents = await databases.listDocuments(
        env.databaseId,
        env.collections.inboxItems,
        [
            Query.equal("$id", itemIds),
            Query.equal("userId", session.$id),
            Query.limit(itemIds.length),
        ],
    );

    const readAt = new Date().toISOString();
    await Promise.all(
        documents.documents.map((document) =>
            databases.updateDocument(
                env.databaseId,
                env.collections.inboxItems,
                String(document.$id),
                { readAt },
            ),
        ),
    );

    return NextResponse.json({ ok: true, readAt });
}
