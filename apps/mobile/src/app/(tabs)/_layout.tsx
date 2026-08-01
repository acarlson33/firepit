import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ReactNode, useEffect, useState } from "react";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

import AppTabs from "@/components/app-tabs";

const ONBOARDING_KEY = "hasSeenOnboarding";

function OnboardingGate({ children }: { children: ReactNode }) {
    const { currentUser } = useFirepitBootstrap();
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setChecking(false);
            return;
        }

        AsyncStorage.getItem(ONBOARDING_KEY).then((seen) => {
            if (seen !== "true") {
                setShowOnboarding(true);
            }
            setChecking(false);
        });
    }, [currentUser]);

    const handleComplete = async () => {
        await AsyncStorage.setItem(ONBOARDING_KEY, "true");
        setShowOnboarding(false);
    };

    if (checking) {
        return <>{children}</>;
    }

    return (
        <>
            {children}
            {showOnboarding && currentUser ? (
                <OnboardingOverlay onComplete={handleComplete} />
            ) : null}
        </>
    );
}

export default function TabsLayout() {
    return (
        <AuthRouteGuard>
            <OnboardingGate>
                <AppTabs />
            </OnboardingGate>
        </AuthRouteGuard>
    );
}
