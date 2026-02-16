import { NextResponse, type NextRequest } from "next/server";
import { Client, Databases, Query, ID } from "node-appwrite";
import type { Role } from "@/lib/types";
import { getEnvConfig } from "@/lib/appwrite-core";
import { enforceSingleDefaultRole } from "@/lib/default-role";
import { getServerSession } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import { getServerPermissionsForUser } from "@/lib/server-channel-access";

const env = getEnvConfig();
const endpoint = env.endpoint;
const project = env.project;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = env.databaseId || "main";
const rolesCollectionId = "roles";

if (!endpoint || !project || !apiKey) {
    throw new Error("Missing Appwrite configuration");
}

// Initialize Appwrite client
const client = new Client().setEndpoint(endpoint).setProject(project);
if (
    typeof (client as unknown as { setKey?: (k: string) => void }).setKey ===
    "function"
) {
    (client as unknown as { setKey: (k: string) => void }).setKey(apiKey);
}
const databases = new Databases(client);

async function requireManageRolesAccess(serverId: string) {
    const session = await getServerSession();
    if (!session?.$id) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const access = await getServerPermissionsForUser(
        databases,
        env,
        serverId,
        session.$id,
    );

    if (!access.isMember || !access.permissions.manageRoles) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return null;
}

// GET: List roles for a server
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

        const authError = await requireManageRolesAccess(serverId);
        if (authError) {
            return authError;
        }

        const response = await databases.listDocuments(
            databaseId,
            rolesCollectionId,
            [
                Query.equal("serverId", serverId),
                Query.orderDesc("position"),
                Query.limit(100),
            ],
        );

        return NextResponse.json({ roles: response.documents });
    } catch (error) {
        logger.error("Failed to list roles", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to list roles" },
            { status: 500 },
        );
    }
}

// POST: Create a new role
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            serverId,
            name,
            color,
            position,
            readMessages,
            sendMessages,
            manageMessages,
            manageChannels,
            manageRoles,
            manageServer,
            mentionEveryone,
            administrator,
            mentionable,
            defaultOnJoin,
        } = body;

        if (!serverId || !name) {
            return NextResponse.json(
                { error: "serverId and name are required" },
                { status: 400 },
            );
        }

        const authError = await requireManageRolesAccess(serverId);
        if (authError) {
            return authError;
        }

        const roleData = {
            serverId,
            name,
            color: color || "#5865F2",
            position: position ?? 0,
            readMessages: readMessages ?? true,
            sendMessages: sendMessages ?? true,
            manageMessages: manageMessages ?? false,
            manageChannels: manageChannels ?? false,
            manageRoles: manageRoles ?? false,
            manageServer: manageServer ?? false,
            mentionEveryone: mentionEveryone ?? false,
            administrator: administrator ?? false,
            mentionable: mentionable ?? true,
            defaultOnJoin: defaultOnJoin ?? false,
            memberCount: 0,
        };

        const role = await databases.createDocument(
            databaseId,
            rolesCollectionId,
            ID.unique(),
            roleData,
        );

        if (roleData.defaultOnJoin) {
            await enforceSingleDefaultRole(
                databases,
                databaseId,
                serverId,
                String(role.$id),
            );
        }

        return NextResponse.json({ role }, { status: 201 });
    } catch (error) {
        logger.error("Failed to create role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to create role" },
            { status: 500 },
        );
    }
}

// PUT: Update an existing role
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            $id,
            name,
            color,
            position,
            readMessages,
            sendMessages,
            manageMessages,
            manageChannels,
            manageRoles,
            manageServer,
            mentionEveryone,
            administrator,
            mentionable,
            defaultOnJoin,
        } = body;

        if (!$id) {
            return NextResponse.json(
                { error: "Role ID is required" },
                { status: 400 },
            );
        }

        const existingRole = await databases.getDocument(
            databaseId,
            rolesCollectionId,
            $id,
        );
        const authError = await requireManageRolesAccess(
            String(existingRole.serverId),
        );
        if (authError) {
            return authError;
        }

        const updateData: Partial<Role> = {};
        if (name !== undefined) {
            updateData.name = name;
        }
        if (color !== undefined) {
            updateData.color = color;
        }
        if (position !== undefined) {
            updateData.position = position;
        }
        if (readMessages !== undefined) {
            updateData.readMessages = readMessages;
        }
        if (sendMessages !== undefined) {
            updateData.sendMessages = sendMessages;
        }
        if (manageMessages !== undefined) {
            updateData.manageMessages = manageMessages;
        }
        if (manageChannels !== undefined) {
            updateData.manageChannels = manageChannels;
        }
        if (manageRoles !== undefined) {
            updateData.manageRoles = manageRoles;
        }
        if (manageServer !== undefined) {
            updateData.manageServer = manageServer;
        }
        if (mentionEveryone !== undefined) {
            updateData.mentionEveryone = mentionEveryone;
        }
        if (administrator !== undefined) {
            updateData.administrator = administrator;
        }
        if (mentionable !== undefined) {
            updateData.mentionable = mentionable;
        }
        if (defaultOnJoin !== undefined) {
            updateData.defaultOnJoin = defaultOnJoin;
        }

        const role = await databases.updateDocument(
            databaseId,
            rolesCollectionId,
            $id,
            updateData,
        );

        if (defaultOnJoin) {
            await enforceSingleDefaultRole(
                databases,
                databaseId,
                role.serverId,
                $id,
            );
        }

        return NextResponse.json({ role });
    } catch (error) {
        logger.error("Failed to update role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to update role" },
            { status: 500 },
        );
    }
}

// DELETE: Delete a role
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const roleId = searchParams.get("roleId");

        if (!roleId) {
            return NextResponse.json(
                { error: "roleId is required" },
                { status: 400 },
            );
        }

        const existingRole = await databases.getDocument(
            databaseId,
            rolesCollectionId,
            roleId,
        );
        const authError = await requireManageRolesAccess(
            String(existingRole.serverId),
        );
        if (authError) {
            return authError;
        }

        await databases.deleteDocument(databaseId, rolesCollectionId, roleId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Failed to delete role", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Failed to delete role" },
            { status: 500 },
        );
    }
}
