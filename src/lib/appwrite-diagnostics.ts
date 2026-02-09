import { Account, Client, Databases } from "appwrite";

import { getEnvConfig } from "./appwrite-core";

/*
 Diagnostic helpers to pinpoint common causes of:
   "The current user is not authorized to perform the requested action."

 Usage (temporary):
   import { runAuthDiagnostics } from "@/lib/appwrite-diagnostics";
   const report = await runAuthDiagnostics();
   console.log(report);
 Remove after resolving permission issues.
*/

export type AuthDiagnosticReport = {
    browserClientConfigured: boolean;
    accountSession?: {
        ok: boolean;
        error?: string;
        userId?: string;
    };
    collectionsTried: Array<{
        id: string;
        ok: boolean;
        error?: string;
        total?: number;
    }>;
};

function makeBrowserClient(): Client | null {
    try {
        const env = getEnvConfig();
        if (!(env.endpoint && env.project)) {
            return null;
        }
        const client = new Client()
            .setEndpoint(env.endpoint)
            .setProject(env.project);
        // Helpful diagnostics in dev
        if (process.env.NODE_ENV !== "production") {
            (
                client as Client & {
                    setLogLevel?: (
                        lvl: "debug" | "info" | "warning" | "error" | "none",
                    ) => Client;
                }
            ).setLogLevel?.("debug");
        }
        return client;
    } catch {
        return null;
    }
}

export async function runAuthDiagnostics(): Promise<AuthDiagnosticReport> {
    const client = makeBrowserClient();
    if (!client) {
        return {
            browserClientConfigured: false,
            collectionsTried: [],
        };
    }
    const account = new Account(client);
    const databases = new Databases(client);
    const env = getEnvConfig();
    const dbId = env.databaseId;
    const collections = [
        env.collections.servers,
        env.collections.channels,
        env.collections.messages,
        env.collections.memberships || "memberships",
        env.collections.audit,
    ];

    const report: AuthDiagnosticReport = {
        browserClientConfigured: true,
        collectionsTried: [],
    };

    // Session check
    try {
        const me = await account.get();
        report.accountSession = { ok: true, userId: me.$id };
    } catch (e) {
        report.accountSession = {
            ok: false,
            error: (e as Error).message,
        };
    }

    // dbId always has a fallback now
    for (const col of collections) {
        try {
            const res = await databases.listDocuments(dbId, col, ["limit(1)"]);
            const total = (res as unknown as { total?: number }).total;
            report.collectionsTried.push({ id: col, ok: true, total });
        } catch (e) {
            const msg = (e as Error).message;
            report.collectionsTried.push({
                id: col,
                ok: false,
                error: msg,
            });
        }
    }
    return report;
}
