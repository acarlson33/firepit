"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NotificationSettings, NotificationLevel, MuteDuration } from "@/lib/types";

/**
 * Hook to manage notification settings for the current user.
 * Provides methods for fetching, updating, and muting/unmuting.
 */
export function useNotificationSettings() {
	const [settings, setSettings] = useState<NotificationSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const fetchControllerRef = useRef<AbortController | null>(null);

	const fetchSettings = useCallback(async () => {
		// Invalidate any earlier/overlapping GET so only the latest request
		// may apply state.
		fetchControllerRef.current?.abort();
		const controller = new AbortController();
		fetchControllerRef.current = controller;

		try {
			setLoading(true);
			setError(null);
			const response = await fetch("/api/notifications/settings", {
				signal: controller.signal,
			});

			if (!response.ok) {
				const data = await response.json() as { error?: string };
				throw new Error(data.error ?? "Failed to fetch settings");
			}

			const data = await response.json() as NotificationSettings;
			if (!controller.signal.aborted) {
				setSettings(data);
			}
		} catch (err) {
			if (controller.signal.aborted) {
				return;
			}
			setError(err instanceof Error ? err.message : "Failed to fetch settings");
		} finally {
			if (!controller.signal.aborted) {
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		fetchSettings();
	}, [fetchSettings]);

	const updateSettings = useCallback(async (data: Partial<NotificationSettings>): Promise<boolean> => {
		try {
			// A stale in-flight GET must not overwrite the PATCH result.
			fetchControllerRef.current?.abort();

			const response = await fetch("/api/notifications/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? "Failed to update settings");
			}

			const updatedSettings = await response.json() as NotificationSettings;
			setSettings(updatedSettings);
			setError(null);
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update settings");
			return false;
		}
	}, []);

	const updateMuteStatus = useCallback(async (params: {
		type: "channels" | "servers" | "conversations";
		id: string;
		muted: boolean;
		duration?: MuteDuration;
		level?: NotificationLevel;
		errorMessage: string;
	}): Promise<boolean> => {
		const { type, id, muted, duration, level, errorMessage } = params;

		try {
			const payload: {
				muted: boolean;
				duration?: MuteDuration;
				level?: NotificationLevel;
			} = { muted };

			if (muted) {
				payload.duration = duration;
				payload.level = level;
			}

			const response = await fetch(`/api/${type}/${id}/mute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorData = await response.json() as { error?: string };
				throw new Error(errorData.error ?? errorMessage);
			}

			await fetchSettings();
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : errorMessage);
			return false;
		}
	}, [fetchSettings]);

	const muteChannel = useCallback((
		channelId: string,
		duration: MuteDuration,
		level: NotificationLevel = "nothing"
	) => {
		return updateMuteStatus({
			type: "channels",
			id: channelId,
			muted: true,
			duration,
			level,
			errorMessage: "Failed to mute channel",
		});
	}, [updateMuteStatus]);

	const unmuteChannel = useCallback((channelId: string) => {
		return updateMuteStatus({
			type: "channels",
			id: channelId,
			muted: false,
			errorMessage: "Failed to unmute channel",
		});
	}, [updateMuteStatus]);

	const muteServer = useCallback((
		serverId: string,
		duration: MuteDuration,
		level: NotificationLevel = "nothing"
	) => {
		return updateMuteStatus({
			type: "servers",
			id: serverId,
			muted: true,
			duration,
			level,
			errorMessage: "Failed to mute server",
		});
	}, [updateMuteStatus]);

	const unmuteServer = useCallback((serverId: string) => {
		return updateMuteStatus({
			type: "servers",
			id: serverId,
			muted: false,
			errorMessage: "Failed to unmute server",
		});
	}, [updateMuteStatus]);

	const muteConversation = useCallback((
		conversationId: string,
		duration: MuteDuration,
		level: NotificationLevel = "nothing"
	) => {
		return updateMuteStatus({
			type: "conversations",
			id: conversationId,
			muted: true,
			duration,
			level,
			errorMessage: "Failed to mute conversation",
		});
	}, [updateMuteStatus]);

	const unmuteConversation = useCallback((conversationId: string) => {
		return updateMuteStatus({
			type: "conversations",
			id: conversationId,
			muted: false,
			errorMessage: "Failed to unmute conversation",
		});
	}, [updateMuteStatus]);

	return {
		settings,
		loading,
		error,
		refetch: fetchSettings,
		updateSettings,
		muteChannel,
		unmuteChannel,
		muteServer,
		unmuteServer,
		muteConversation,
		unmuteConversation,
	};
}
