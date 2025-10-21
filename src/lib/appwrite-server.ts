// Server-only Appwrite client (uses node-appwrite with API key support)
// DO NOT import this in client-side code!

import { Client, Databases, Teams, Storage } from "node-appwrite";
import { AppwriteIntegrationError, getEnvConfig } from "./appwrite-core";

/**
 * Get server-side Appwrite client with API key authentication.
 * This function should ONLY be called from server-side code (server components, API routes, server actions).
 * 
 * @throws {AppwriteIntegrationError} If APPWRITE_API_KEY is not configured
 */
export function getServerClient(): {
  client: Client;
  databases: Databases;
  teams: Teams;
  storage: Storage;
} {
  const env = getEnvConfig();
  const apiKey = process.env.APPWRITE_API_KEY;
  
  if (!apiKey) {
    throw new AppwriteIntegrationError(
      "APPWRITE_API_KEY not configured for server client"
    );
  }
  
  const client = new Client()
    .setEndpoint(env.endpoint)
    .setProject(env.project)
    .setKey(apiKey);
    
  return { 
    client, 
    databases: new Databases(client), 
    teams: new Teams(client),
    storage: new Storage(client),
  };
}
