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
}

export function VersionCheck() {
	const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
	const [loading, setLoading] = useState(true);

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
					<p className="text-sm text-muted-foreground">Checking for updates...</p>
				</div>
			</div>
		);
	}

	if (!versionInfo) {
		return null;
	}

	if (versionInfo.error) {
		return (
			<div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
				<div className="flex items-center gap-3">
					<AlertCircle className="h-5 w-5 text-muted-foreground" />
					<div>
						<p className="text-sm font-medium">Unable to check for updates</p>
						<p className="text-xs text-muted-foreground mt-1">
							Currently running version {versionInfo.currentVersion}
						</p>
					</div>
				</div>
			</div>
		);
	}

	if (versionInfo.isOutdated) {
		return (
			<div className="overflow-hidden rounded-3xl border border-amber-500/60 bg-amber-500/10 p-6 shadow-lg">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div className="flex items-start gap-3">
						<AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
						<div>
							<p className="text-sm font-semibold text-foreground">
								Update available
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								You're running v{versionInfo.currentVersion}. Version{" "}
								{versionInfo.latestVersion} is now available.
							</p>
							{versionInfo.publishedAt && (
								<p className="text-xs text-muted-foreground mt-1">
									Released on{" "}
									{new Date(versionInfo.publishedAt).toLocaleDateString()}
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
		);
	}

	return (
		<div className="overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-6 shadow-lg">
			<div className="flex items-center gap-3">
				<CheckCircle className="h-5 w-5 text-green-500" />
				<div>
					<p className="text-sm font-medium">You're up to date</p>
					<p className="text-xs text-muted-foreground mt-1">
						Running version {versionInfo.currentVersion}
					</p>
				</div>
			</div>
		</div>
	);
}
