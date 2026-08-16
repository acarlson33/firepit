"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

interface VersionInfo {
    currentVersion: string;
    latestVersion: string;
    isOutdated: boolean;
    releaseUrl?: string;
    publishedAt?: string;
    error?: string;
    commitSha?: string;
    commitShort?: string;
    buildTime?: string;
    isCanary?: boolean;
    branch?: string;
}

export function VersionCheck() {
    const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
    const [loading, setLoading] = useState(true);

    const normalizeVersion = (value?: string) =>
        value ? value.replace(/^v+/i, "") : "unknown";

    const renderCanaryNotice = (isCanary?: boolean) => {
        if (!isCanary) {
            return null;
        }
        return (
            <div className="overflow-hidden rounded-3xl border border-amber-500/60 bg-amber-500/10 p-4 shadow-lg">
                <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            Canary build in use
                        </p>
                        <p className="text-xs text-muted-foreground">
                            You’re using a canary version. These builds may be
                            unstable or change without notice. Switch to a
                            stable release if you need supported behavior.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        async function fetchVersionInfo() {
            try {
                const response = await fetch("/api/version");
                const data = await response.json();
                setVersionInfo(data);
            } catch {
                setVersionInfo(null);
            } finally {
                setLoading(false);
            }
        }

        void fetchVersionInfo();
    }, []);

    if (loading) {
        return (
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
                <div className="flex items-center gap-3">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        Checking for updates...
                    </p>
                </div>
            </div>
        );
    }

    if (!versionInfo) {
        return null;
    }

    const currentDisplay = normalizeVersion(versionInfo.currentVersion);

    if (versionInfo.error) {
        return (
            <div className="space-y-3">
                {renderCanaryNotice(versionInfo.isCanary)}
                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                            <p className="text-sm font-medium">
                                Unable to check for updates
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Currently running version v{currentDisplay}
                                {versionInfo.isCanary && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                        Canary
                                    </span>
                                )}
                            </p>
                            {versionInfo.commitShort &&
                                versionInfo.commitShort !== "unknown" && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Commit: {versionInfo.commitShort}
                                    </p>
                                )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (versionInfo.isOutdated) {
        const latestDisplay = normalizeVersion(versionInfo.latestVersion);
        return (
            <div className="space-y-3">
                {renderCanaryNotice(versionInfo.isCanary)}
                <div className="overflow-hidden rounded-3xl border border-amber-500/60 bg-amber-500/10 p-6 shadow-lg">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-foreground">
                                    Update available
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    You&apos;re running v{currentDisplay}.
                                    Version v{latestDisplay} is now available.
                                </p>
                                {versionInfo.publishedAt && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Released on{" "}
                                        {new Date(
                                            versionInfo.publishedAt,
                                        ).toLocaleDateString()}
                                    </p>
                                )}
                            </div>
                        </div>
                        {versionInfo.releaseUrl && (
                            <a
                                href={versionInfo.releaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/60 bg-amber-500/20 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-amber-500/30"
                            >
                                View release
                                <span aria-hidden="true">→</span>
                            </a>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {renderCanaryNotice(versionInfo.isCanary)}
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
                <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div className="flex-1">
                        <p className="text-sm font-medium">
                            You&apos;re up to date
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Running version v{currentDisplay}
                            {versionInfo.isCanary && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                    Canary
                                </span>
                            )}
                        </p>
                        {versionInfo.commitShort &&
                            versionInfo.commitShort !== "unknown" && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Commit: {versionInfo.commitShort}
                                    {versionInfo.branch &&
                                        versionInfo.branch !== "unknown" && (
                                            <span className="ml-2">
                                                ({versionInfo.branch})
                                            </span>
                                        )}
                                </p>
                            )}
                        {versionInfo.buildTime && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Built:{" "}
                                {new Date(
                                    versionInfo.buildTime,
                                ).toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
