import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import { AppLayout } from "@/components/app-layout";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
    display: "swap", // Prevent font blocking render
    preload: true, // Preload critical font
    fallback: ["system-ui", "arial"], // System font fallback for faster initial render
    adjustFontFallback: true, // Minimize layout shift
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
    display: "optional", // Non-critical font can be skipped if slow
    preload: false,
    fallback: ["ui-monospace", "monospace"], // Monospace fallback
});

export const metadata: Metadata = {
    title: "firepit",
    description: "A better chat experience",
    // Enable modern performance features
    other: {
        "color-scheme": "light dark",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Preconnect to Appwrite to establish connections early */}
                <link rel="preconnect" href="https://nyc.cloud.appwrite.io" />
                <link rel="dns-prefetch" href="https://nyc.cloud.appwrite.io" />
            </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
            >
                <ServiceWorkerRegistration />
                <Providers>
                    <div className="relative min-h-screen overflow-hidden">
                        <div className="pointer-events-none fixed inset-0 -z-10">
                            <div className="absolute -top-24 left-1/2 h-72 w-xl -translate-x-1/2 rounded-full bg-linear-to-br from-sky-200/40 via-purple-200/40 to-transparent blur-3xl dark:from-sky-500/10 dark:via-purple-500/10" />
                            <div className="absolute bottom-0 right-[-10%] h-80 w-md rounded-full bg-linear-to-tr from-emerald-200/40 via-teal-100/30 to-transparent blur-3xl dark:from-emerald-500/10 dark:via-teal-500/10" />
                        </div>
                        <div className="relative z-10 grid min-h-screen grid-rows-[auto_1fr]">
                            <AppLayout>{children}</AppLayout>
                        </div>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
