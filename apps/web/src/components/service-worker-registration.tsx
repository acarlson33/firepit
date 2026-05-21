"use client";
import { useEffect } from "react";

/**
 * Service Worker Registration Component
 * Registers the service worker for offline support and caching
 */
export function ServiceWorkerRegistration() {
    useEffect(() => {
        const enableInDev = process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === "true";
        const shouldRegister =
            process.env.NODE_ENV === "production" || enableInDev;

        if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }

        let updateIntervalId: number | undefined;
        let didCancel = false;

        async function unregisterWorkersAndClearCaches() {
            const registrations =
                await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map((registration) => registration.unregister()),
            );

            if (typeof caches === "undefined") {
                return;
            }

            const cacheKeys = await caches.keys();
            await Promise.all(
                cacheKeys.map((cacheKey) => caches.delete(cacheKey)),
            );
        }

        if (!shouldRegister) {
            void unregisterWorkersAndClearCaches().catch(() => {
                // Ignore cleanup failures in development.
            });

            return;
        }

        function handleControllerChange() {
            if (didCancel) {
                return;
            }

            window.location.reload();
        }

        navigator.serviceWorker
            .register("/sw.js", { updateViaCache: "none" })
            .then((registration) => {
                // Check for updates periodically
                updateIntervalId = window.setInterval(
                    () => {
                        registration.update().catch(() => {
                            /* Ignore update errors */
                        });
                    },
                    60 * 60 * 1000,
                ); // Check every hour
            })
            .catch((error) => {
                console.error("Service Worker registration failed:", error);
            });

        navigator.serviceWorker.addEventListener(
            "controllerchange",
            handleControllerChange,
        );

        return () => {
            didCancel = true;
            if (updateIntervalId !== undefined) {
                window.clearInterval(updateIntervalId);
            }
            navigator.serviceWorker.removeEventListener(
                "controllerchange",
                handleControllerChange,
            );
        };
    }, []);

    return null; // This component doesn't render anything
}
