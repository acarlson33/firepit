import type { Metadata } from "next";
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
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "optional", // Non-critical font can be skipped if slow
  preload: false,
});

export const metadata: Metadata = {
  title: "firepit",
  description: "A better chat experience",
  // Enable modern performance features
  other: {
    "color-scheme": "light dark",
  },
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
        
        {/* Preload critical API requests to start fetching before JavaScript loads */}
        <link rel="preload" href="/api/me" as="fetch" crossOrigin="anonymous" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ServiceWorkerRegistration />
        <Providers>
          <div className="relative min-h-screen overflow-hidden">
            <div className="pointer-events-none fixed inset-0 -z-10">
              <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-sky-200/40 via-purple-200/40 to-transparent blur-3xl dark:from-sky-500/10 dark:via-purple-500/10" />
              <div className="absolute bottom-0 right-[-10%] h-80 w-[28rem] rounded-full bg-gradient-to-tr from-emerald-200/40 via-teal-100/30 to-transparent blur-3xl dark:from-emerald-500/10 dark:via-teal-500/10" />
            </div>
            <div className="relative z-10 grid min-h-screen grid-rows-[auto_1fr]">
              <AppLayout>
                {children}
              </AppLayout>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
