"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Volume2, VolumeX, Moon, Clock, AtSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { NotificationLevel, NotificationSettings as NotificationSettingsType } from "@/lib/types";

interface NotificationSettingsProps {
	onSettingsChange?: (settings: NotificationSettingsType) => void;
}

// Common timezone list
const TIMEZONES = [
	"UTC",
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"America/Anchorage",
	"Pacific/Honolulu",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"Europe/Moscow",
	"Asia/Tokyo",
	"Asia/Shanghai",
	"Asia/Singapore",
	"Asia/Dubai",
	"Australia/Sydney",
];

interface NotificationLevelOption {
	value: NotificationLevel;
	label: string;
	description: string;
	icon: React.ReactNode;
}

const LEVEL_OPTIONS: NotificationLevelOption[] = [
	{
		value: "all",
		label: "All messages",
		description: "Notify me for all messages",
		icon: <Bell className="h-4 w-4" />,
	},
	{
		value: "mentions",
		label: "Only @mentions",
		description: "Only notify when I'm mentioned",
		icon: <AtSign className="h-4 w-4" />,
	},
	{
		value: "nothing",
		label: "Nothing",
		description: "Don't notify me",
		icon: <BellOff className="h-4 w-4" />,
	},
];

export function NotificationSettings({ onSettingsChange }: NotificationSettingsProps) {
	const [settings, setSettings] = useState<NotificationSettingsType | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	// Form state
	const [globalLevel, setGlobalLevel] = useState<NotificationLevel>("all");
	const [desktopEnabled, setDesktopEnabled] = useState(true);
	const [pushEnabled, setPushEnabled] = useState(true);
	const [soundEnabled, setSoundEnabled] = useState(true);
	const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
	const [quietHoursStart, setQuietHoursStart] = useState("22:00");
	const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
	const [quietHoursTimezone, setQuietHoursTimezone] = useState("UTC");

	// Browser notification permission state
	const [browserPermission, setBrowserPermission] = useState<NotificationPermission>("default");
	const [isRequestingPermission, setIsRequestingPermission] = useState(false);

	// Check browser notification permission on mount
	useEffect(() => {
		if (typeof window !== "undefined" && "Notification" in window) {
			setBrowserPermission(Notification.permission);
		}
	}, []);

	// Fetch settings on mount
	useEffect(() => {
		const fetchSettings = async () => {
			try {
				const response = await fetch("/api/notifications/settings");
				if (!response.ok) {
					throw new Error("Failed to fetch settings");
				}
				const data = await response.json() as NotificationSettingsType;
				setSettings(data);
				
				// Initialize form state
				setGlobalLevel(data.globalNotifications);
				setDesktopEnabled(data.desktopNotifications);
				setPushEnabled(data.pushNotifications);
				setSoundEnabled(data.notificationSound);
				
				if (data.quietHoursStart && data.quietHoursEnd) {
					setQuietHoursEnabled(true);
					setQuietHoursStart(data.quietHoursStart);
					setQuietHoursEnd(data.quietHoursEnd);
					if (data.quietHoursTimezone) {
						setQuietHoursTimezone(data.quietHoursTimezone);
					}
				}
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to load settings"
				);
			} finally {
				setIsLoading(false);
			}
		};

		void fetchSettings();
	}, []);

	const requestBrowserPermission = useCallback(async () => {
		if (typeof window === "undefined" || !("Notification" in window)) {
			toast.error("Notifications are not supported by your browser");
			return;
		}

		if (browserPermission === "denied") {
			toast.error("Notifications are blocked. Please enable them in your browser settings.");
			return;
		}

		setIsRequestingPermission(true);
		try {
			const permission = await Notification.requestPermission();
			setBrowserPermission(permission);
			
			if (permission === "granted") {
				toast.success("Notification permission granted!");
			} else if (permission === "denied") {
				toast.error("Notification permission denied. You can change this in your browser settings.");
			}
		} catch (error) {
			toast.error("Failed to request notification permission");
		} finally {
			setIsRequestingPermission(false);
		}
	}, [browserPermission]);

	const saveSettings = useCallback(async () => {
		setIsSaving(true);
		try {
			const payload = {
				globalNotifications: globalLevel,
				desktopNotifications: desktopEnabled,
				pushNotifications: pushEnabled,
				notificationSound: soundEnabled,
				quietHoursStart: quietHoursEnabled ? quietHoursStart : null,
				quietHoursEnd: quietHoursEnabled ? quietHoursEnd : null,
				quietHoursTimezone: quietHoursEnabled ? quietHoursTimezone : null,
			};

			const response = await fetch("/api/notifications/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to save settings");
			}

			const updatedSettings = await response.json() as NotificationSettingsType;
			setSettings(updatedSettings);
			onSettingsChange?.(updatedSettings);
			toast.success("Settings saved");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save settings"
			);
		} finally {
			setIsSaving(false);
		}
	}, [
		globalLevel,
		desktopEnabled,
		pushEnabled,
		soundEnabled,
		quietHoursEnabled,
		quietHoursStart,
		quietHoursEnd,
		quietHoursTimezone,
		onSettingsChange,
	]);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Global Notification Level */}
			<Card className="p-6">
				<div className="flex items-center gap-3 mb-4">
					<Bell className="h-5 w-5 text-primary" />
					<h3 className="text-lg font-semibold">Default Notification Level</h3>
				</div>
				<p className="text-sm text-muted-foreground mb-4">
					This applies to all servers and channels unless you override them individually.
				</p>
				<div className="grid gap-2">
					{LEVEL_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setGlobalLevel(option.value)}
							className={`flex items-center gap-3 rounded-md border p-4 text-left transition-colors hover:bg-muted ${
								globalLevel === option.value
									? "border-primary bg-primary/5"
									: "border-border"
							}`}
						>
							<div
								className={`flex h-10 w-10 items-center justify-center rounded-md ${
									globalLevel === option.value
										? "bg-primary text-primary-foreground"
										: "bg-muted"
								}`}
							>
								{option.icon}
							</div>
							<div className="flex-1">
								<span className="font-medium">{option.label}</span>
								<p className="text-sm text-muted-foreground">
									{option.description}
								</p>
							</div>
						</button>
					))}
				</div>
			</Card>

			{/* Browser Notification Permission */}
			<Card className="p-6">
				<div className="flex items-center gap-3 mb-4">
					<Bell className="h-5 w-5 text-primary" />
					<h3 className="text-lg font-semibold">Browser Notifications</h3>
				</div>
				<p className="text-sm text-muted-foreground mb-4">
					Control whether your browser can show desktop notifications.
				</p>
				<div className="space-y-4">
					<div className="flex items-center justify-between rounded-md border p-4">
						<div className="flex-1">
							<p className="font-medium">Current Permission Status</p>
							<p className="text-sm text-muted-foreground">
								{browserPermission === "granted" && "✓ Granted - You will receive desktop notifications"}
								{browserPermission === "denied" && "✗ Denied - Please enable in browser settings"}
								{browserPermission === "default" && "⚠ Not set - Click to enable notifications"}
							</p>
						</div>
						<div className="flex items-center gap-2">
							{browserPermission === "granted" && (
								<span className="rounded-full bg-green-500/10 px-3 py-1 text-xs font-medium text-green-600 dark:text-green-400">
									Enabled
								</span>
							)}
							{browserPermission === "denied" && (
								<span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400">
									Blocked
								</span>
							)}
							{browserPermission === "default" && (
								<span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
									Not Set
								</span>
							)}
						</div>
					</div>
					
					{browserPermission !== "granted" && (
						<div className="flex flex-col gap-2">
							<Button
								onClick={requestBrowserPermission}
								disabled={isRequestingPermission || browserPermission === "denied"}
								className="w-full"
							>
								{isRequestingPermission ? "Requesting..." : "Enable Browser Notifications"}
							</Button>
							{browserPermission === "denied" && (
								<p className="text-xs text-muted-foreground">
									Notifications are blocked. To enable them, click the icon in your browser&apos;s address bar and allow notifications for this site.
								</p>
							)}
						</div>
					)}
				</div>
			</Card>

			{/* Notification Methods */}
			<Card className="p-6">
				<div className="flex items-center gap-3 mb-4">
					<Volume2 className="h-5 w-5 text-primary" />
					<h3 className="text-lg font-semibold">Notification Methods</h3>
				</div>
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<div>
							<Label htmlFor="desktop" className="font-medium">
								Desktop notifications
							</Label>
							<p className="text-sm text-muted-foreground">
								Show notifications on your desktop
							</p>
						</div>
						<Switch
							id="desktop"
							checked={desktopEnabled}
							onCheckedChange={setDesktopEnabled}
						/>
					</div>

					<div className="flex items-center justify-between">
						<div>
							<Label htmlFor="push" className="font-medium">
								Push notifications
							</Label>
							<p className="text-sm text-muted-foreground">
								Receive notifications on your mobile device
							</p>
						</div>
						<Switch
							id="push"
							checked={pushEnabled}
							onCheckedChange={setPushEnabled}
						/>
					</div>

					<div className="flex items-center justify-between">
						<div>
							<Label htmlFor="sound" className="font-medium flex items-center gap-2">
								{soundEnabled ? (
									<Volume2 className="h-4 w-4" />
								) : (
									<VolumeX className="h-4 w-4" />
								)}
								Notification sound
							</Label>
							<p className="text-sm text-muted-foreground">
								Play a sound for new notifications
							</p>
						</div>
						<Switch
							id="sound"
							checked={soundEnabled}
							onCheckedChange={setSoundEnabled}
						/>
					</div>
				</div>
			</Card>

			{/* Quiet Hours */}
			<Card className="p-6">
				<div className="flex items-center gap-3 mb-4">
					<Moon className="h-5 w-5 text-primary" />
					<h3 className="text-lg font-semibold">Quiet Hours</h3>
				</div>
				<p className="text-sm text-muted-foreground mb-4">
					Suppress notifications during specific hours.
				</p>

				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<div>
							<Label htmlFor="quiet-enabled" className="font-medium">
								Enable quiet hours
							</Label>
							<p className="text-sm text-muted-foreground">
								No notifications during the specified time
							</p>
						</div>
						<Switch
							id="quiet-enabled"
							checked={quietHoursEnabled}
							onCheckedChange={setQuietHoursEnabled}
						/>
					</div>

					{quietHoursEnabled && (
						<div className="grid gap-4 pt-2">
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="start-time" className="flex items-center gap-2">
										<Clock className="h-4 w-4" />
										Start time
									</Label>
									<Input
										id="start-time"
										type="time"
										value={quietHoursStart}
										onChange={(e) => setQuietHoursStart(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="end-time" className="flex items-center gap-2">
										<Clock className="h-4 w-4" />
										End time
									</Label>
									<Input
										id="end-time"
										type="time"
										value={quietHoursEnd}
										onChange={(e) => setQuietHoursEnd(e.target.value)}
									/>
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor="timezone">Timezone</Label>
								<Select
									value={quietHoursTimezone}
									onValueChange={setQuietHoursTimezone}
								>
									<SelectTrigger id="timezone">
										<SelectValue placeholder="Select timezone" />
									</SelectTrigger>
									<SelectContent>
										{TIMEZONES.map((tz) => (
											<SelectItem key={tz} value={tz}>
												{tz}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					)}
				</div>
			</Card>

			{/* Save Button */}
			<div className="flex justify-end">
				<Button onClick={saveSettings} disabled={isSaving}>
					{isSaving ? "Saving..." : "Save Changes"}
				</Button>
			</div>

			{/* Debug info */}
			{settings && process.env.NODE_ENV === "development" && (
				<Card className="p-4 bg-muted/50">
					<p className="text-xs text-muted-foreground font-mono">
						Last updated: {settings.$updatedAt}
					</p>
				</Card>
			)}
		</div>
	);
}
