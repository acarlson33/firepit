// Server-only Appwrite client (uses node-appwrite with API key support)
// DO NOT import this in client-side code!

import { Client, Databases, TablesDB, Teams, Storage } from "node-appwrite";
import { AppwriteIntegrationError, getEnvConfig } from "./appwrite-core";

// Tracked dependency alignment: https://github.com/acarlson33/firepit/issues?q=is%3Aissue+is%3Aopen+node-appwrite

/**
 * Get server-side Appwrite client with API key authentication.
 * This function should ONLY be called from server-side code (server components, API routes, server actions).
 * @returns {{ client: Client; databases: Databases; tablesDB: TablesDB; teams: Teams; storage: Storage; }} The return value.
 */
export function getServerClient(): {
    client: Client;
    databases: Databases;
    tablesDB: TablesDB;
    teams: Teams;
    storage: Storage;
} {
    const env = getEnvConfig();
    const apiKey = process.env.APPWRITE_API_KEY?.trim();

    if (!env.project) {
        throw new AppwriteIntegrationError(
            "APPWRITE_PROJECT_ID not configured for server client",
        );
    }

    if (!apiKey) {
        throw new AppwriteIntegrationError(
            "APPWRITE_API_KEY not configured for server client",
        );
    }

    const client = new Client()
        .setEndpoint(env.endpoint)
        .setProject(env.project)
        .setKey(apiKey);

    return {
        client,
        databases: new Databases(client),
        tablesDB: new TablesDB(client),
        teams: new Teams(client),
        storage: new Storage(client),
    };
}
