"use client";
import { useEffect } from "react";

/**
 * Service Worker Registration Component
 * Registers the service worker for offline support and caching
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      let updateInterval: NodeJS.Timeout | undefined;

      // Register service worker
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log(
            "Service Worker registered with scope:",
            registration.scope
          );

          // Check for updates periodically
          updateInterval = setInterval(
            () => {
              registration.update().catch(() => {
                /* Ignore update errors */
              });
            },
            60 * 60 * 1000
          ); // Check every hour
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });

      // Handle service worker updates
      const handleControllerChange = () => {
        console.log("Service Worker updated, reloading page...");
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      return () => {
        if (updateInterval) {
          clearInterval(updateInterval);
        }
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      };
    }
  }, []);

  return null; // This component doesn't render anything
}
