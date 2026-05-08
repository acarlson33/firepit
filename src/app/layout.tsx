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
    title: {
        default: "firepit",
        template: "%s | firepit",
    },
    description:
        "Real-time communities, direct messages, and moderation in one workspace.",
    icons: {
        icon: [
            {
                url: "/favicon/favicon.ico",
                type: "image/x-icon",
            },
        ],
        shortcut: "/favicon/favicon.ico",
        apple: "/favicon/apple-touch-icon.png",
    },
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
            <body
                className={`${geistSans.variable} ${geistMono.variable} overflow-x-hidden antialiased bg-background text-foreground`}
            >
                <ServiceWorkerRegistration />
                <Providers>
                    <div className="relative min-h-screen overflow-hidden bg-background">
                        <div
                            aria-hidden="true"
                            className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
                        >
                            <div className="absolute -top-44 left-1/2 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.24),rgba(249,115,22,0.08)_36%,transparent_72%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(251,146,60,0.18),rgba(251,146,60,0.05)_38%,transparent_72%)]" />
                            <div className="absolute -bottom-40 left-[-10%] h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.18),rgba(45,212,191,0.05)_42%,transparent_72%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.14),rgba(34,197,94,0.04)_42%,transparent_72%)]" />
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
                        </div>
                        <div className="relative z-10 flex min-h-screen flex-col">
                            <AppLayout>{children}</AppLayout>
                        </div>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
