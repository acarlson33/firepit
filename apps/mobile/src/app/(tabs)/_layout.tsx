import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ReactNode, useEffect, useState } from "react";

import { AuthRouteGuard } from "@/components/auth-route-guard";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import { useFirepitBootstrap } from "@/providers/firepit-provider";

import AppTabs from "@/components/app-tabs";

const ONBOARDING_KEY_PREFIX = "hasSeenOnboarding";

function onboardingKey(userId: string) {
    return `${ONBOARDING_KEY_PREFIX}:${userId}`;
}

function OnboardingGate({ children }: { children: ReactNode }) {
    const { currentUser } = useFirepitBootstrap();
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [checking, setChecking] = useState(true);

    const userId = currentUser?.$id ?? currentUser?.userId ?? "";

    useEffect(() => {
        if (!currentUser) {
            setChecking(false);
            return;
        }

        let cancelled = false;
        AsyncStorage.getItem(onboardingKey(userId)).then((seen) => {
            if (cancelled) return;
            if (seen !== "true") {
                setShowOnboarding(true);
            }
            setChecking(false);
        });
        return () => {
            cancelled = true;
        };
    }, [currentUser, userId]);

    const handleComplete = async () => {
        await AsyncStorage.setItem(onboardingKey(userId), "true");
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
