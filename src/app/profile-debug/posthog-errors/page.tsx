"use server";

import { notFound, redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth-server";

import { ErrorIngestionTester } from "./error-ingestion-tester";

export default async function PostHogErrorsDebugPage() {
    if (process.env.NODE_ENV !== "development") {
        notFound();
    }

    const user = await requireAuth().catch(() => {
        redirect("/login");
    });

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
