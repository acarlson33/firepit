import { NextResponse, type NextRequest } from "next/server";
import { Client, Databases, ID, Query } from "node-appwrite";

import { getEnvConfig } from "@/lib/appwrite-core";
import { getServerSession } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const env = getEnvConfig();
const endpoint = env.endpoint;
const project = env.project;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = env.databaseId || "main";
const categoriesCollectionId = env.collections.categories;
const channelsCollectionId = env.collections.channels;

if (!endpoint || !project || !apiKey) {
    throw new Error("Missing Appwrite configuration");
}

const client = new Client().setEndpoint(endpoint).setProject(project);
if (
    typeof (client as unknown as { setKey?: (key: string) => void }).setKey ===
    "function"
) {
    (client as unknown as { setKey: (key: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

async function requireServerMembership(serverId: string) {
    const session = await getServerSession();
    if (!session?.$id) {
        return {
            response: NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            ),
        };
    }

    const access = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        session.$id,
    );

    if (!access.isMember) {
        return {
            response: NextResponse.json(
                { error: "Forbidden" },
                { status: 403 },
            ),
        };
    }

    return { access, userId: session.$id };
}

async function requireManageChannelsAccess(serverId: string) {
    const result = await requireServerMembership(serverId);
    if ("response" in result) {
        return result;
    }

    if (!result.access.permissions.manageChannels) {
        return {
            response: NextResponse.json(
                { error: "Forbidden" },
                { status: 403 },
            ),
        };
    }

    return { access: result.access, userId: result.userId };
}

async function getNextCategoryPosition(serverId: string) {
    const result = await databases.listDocuments(
        databaseId,
        categoriesCollectionId,
        [
            Query.equal("serverId", serverId),
            Query.orderDesc("position"),
            Query.limit(1),
        ],
    );

    const current = result.documents[0];
    return typeof current?.position === "number" ? current.position + 1 : 0;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const serverId = searchParams.get("serverId");

        if (!serverId) {
            return NextResponse.json(
                { error: "serverId is required" },
                { status: 400 },
            );
        }

        const auth = await requireServerMembership(serverId);
        if ("response" in auth) {
            return auth.response;
        }

        const categories = await databases.listDocuments(
            databaseId,
            categoriesCollectionId,
            [
                Query.equal("serverId", serverId),
                Query.orderAsc("position"),
                Query.limit(100),
            ],
        );

        return NextResponse.json({ categories: categories.documents });
    } catch (error) {
        logger.error("Failed to list categories", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list categories" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            serverId?: string;
            name?: string;
        };
        const serverId = body.serverId?.trim();
        const name = body.name?.trim();

        if (!serverId || !name) {
            return NextResponse.json(
                { error: "serverId and name are required" },
                { status: 400 },
            );
        }

        const auth = await requireManageChannelsAccess(serverId);
        if ("response" in auth) {
            return auth.response;
        }

        const category = await databases.createDocument(
            databaseId,
            categoriesCollectionId,
            ID.unique(),
            {
                serverId,
                name,
                createdBy: auth.userId,
                position: await getNextCategoryPosition(serverId),
            },
        );

        return NextResponse.json({ category }, { status: 201 });
    } catch (error) {
        logger.error("Failed to create category", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to create category" },
            { status: 500 },
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            categoryId?: string;
            name?: string;
            position?: number;
        };

        if (!body.categoryId) {
            return NextResponse.json(
                { error: "categoryId is required" },
                { status: 400 },
            );
        }

        const existingCategory = await databases.getDocument(
            databaseId,
            categoriesCollectionId,
            body.categoryId,
        );

        const auth = await requireManageChannelsAccess(
            String(existingCategory.serverId),
        );
        if ("response" in auth) {
            return auth.response;
        }

        const updateData: Record<string, string | number> = {};
        if (body.name !== undefined) {
            const nextName = body.name.trim();
            if (!nextName) {
                return NextResponse.json(
                    { error: "Category name cannot be empty" },
                    { status: 400 },
                );
            }
            updateData.name = nextName;
        }
        if (body.position !== undefined) {
            if (!Number.isInteger(body.position) || body.position < 0) {
                return NextResponse.json(
                    { error: "position must be a non-negative integer" },
                    { status: 400 },
                );
            }
            updateData.position = body.position;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No category updates provided" },
                { status: 400 },
            );
        }

        const category = await databases.updateDocument(
            databaseId,
            categoriesCollectionId,
            body.categoryId,
            updateData,
        );

        return NextResponse.json({ category });
    } catch (error) {
        logger.error("Failed to update category", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update category" },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryId = searchParams.get("categoryId");

        if (!categoryId) {
            return NextResponse.json(
                { error: "categoryId is required" },
                { status: 400 },
            );
        }

        const existingCategory = await databases.getDocument(
            databaseId,
            categoriesCollectionId,
            categoryId,
        );

        const auth = await requireManageChannelsAccess(
            String(existingCategory.serverId),
        );
        if ("response" in auth) {
            return auth.response;
        }

        const linkedChannels = await databases.listDocuments(
            databaseId,
            channelsCollectionId,
            [Query.equal("categoryId", categoryId), Query.limit(100)],
        );

        for (const channel of linkedChannels.documents) {
            await databases.updateDocument(
                databaseId,
                channelsCollectionId,
                String(channel.$id),
                { categoryId: "", position: 0 },
            );
        }

        await databases.deleteDocument(
            databaseId,
            categoriesCollectionId,
            categoryId,
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete category", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to delete category" },
            { status: 500 },
        );
    }
}
