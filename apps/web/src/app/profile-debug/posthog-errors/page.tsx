import { notFound, redirect } from "next/navigation";

import { AuthError, requireAuth } from "@/lib/auth-server";

import { ErrorIngestionTester } from "./error-ingestion-tester";

export default async function PostHogErrorsDebugPage() {
    if (process.env.NODE_ENV !== "development") {
        notFound();
    }

    let user: Awaited<ReturnType<typeof requireAuth>> | null = null;
    try {
        user = await requireAuth();
    } catch (error) {
        if (error instanceof AuthError) {
            redirect("/login");
        }

        throw error;
    }

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <h1 className="mb-3 font-bold text-3xl">PostHog Error Debug</h1>
            <p className="mb-6 text-sm text-muted-foreground">
                Temporary development page for validating PostHog error
                ingestion.
            </p>
            <ErrorIngestionTester />
        </div>
    );
}
