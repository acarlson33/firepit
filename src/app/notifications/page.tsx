import { redirect } from "next/navigation";

import { NotificationsCenter } from "./notifications-center";
import { requireAuth } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";

export const metadata = {
    title: "Notifications",
    description: "Recent mentions, direct messages, and notification preferences.",
};

export default async function NotificationsPage() {
    try {
        const user = await requireAuth();
        return <NotificationsCenter userId={user.$id} />;
    } catch (err: unknown) {
        // Log the error for diagnostics via structured logger
        logger.error("requireAuth failed for notifications page:", {
            error: err instanceof Error ? err : String(err),
        });

        const message = err instanceof Error ? err.message : String(err);
        // If the error appears to be an authentication failure, redirect to login.
        if (/auth|unauth|authentication|required/i.test(message)) {
            redirect("/login?redirect=/notifications");
        }

        // Non-authentication errors should bubble up to avoid masking issues
        throw err;
    }
}