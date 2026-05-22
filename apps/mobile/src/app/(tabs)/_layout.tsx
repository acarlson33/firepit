import AppTabs from "@/components/app-tabs";
import { AuthRouteGuard } from "@/components/auth-route-guard";

export default function TabsLayout() {
    return (
        <AuthRouteGuard>
            <AppTabs />
        </AuthRouteGuard>
    );
}
