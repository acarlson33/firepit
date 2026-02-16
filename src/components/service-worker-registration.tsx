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

        if (
            typeof window !== "undefined" &&
            "serviceWorker" in navigator &&
            shouldRegister
        ) {
            // Register service worker
            navigator.serviceWorker
                .register("/sw.js")
                .then((registration) => {
                    console.log(
                        "Service Worker registered with scope:",
                        registration.scope,
                    );

                    // Check for updates periodically
                    setInterval(
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

            // Handle service worker updates
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                console.log("Service Worker updated, reloading page...");
                window.location.reload();
            });
        }
    }, []);

    return null; // This component doesn't render anything
}
