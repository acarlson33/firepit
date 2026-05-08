import { redirect } from "next/navigation";

import { NotificationsCenter } from "./notifications-center";
import { requireAuth } from "@/lib/auth-server";

export const metadata = {
    title: "Notifications",
    description: "Recent mentions, direct messages, and notification preferences.",
};

export default async function NotificationsPage() {
    try {
        const user = await requireAuth();
        return <NotificationsCenter userId={user.$id} />;
    } catch {
        redirect("/login?redirect=/notifications");
    }
}