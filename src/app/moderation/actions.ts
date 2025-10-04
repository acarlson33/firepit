"use server";

import { recordAudit } from "../../lib/appwrite-audit";
import {
	deleteMessage,
	restoreMessage,
	softDeleteMessage,
} from "../../lib/appwrite-messages";
import { requireModerator } from "../../lib/auth-server";
import { recordMetric, recordTiming } from "../../lib/monitoring";

// Simple in-memory rate limiting (best effort, per runtime instance)
const ACTION_WINDOW_MS = 5000;
const ACTION_MAX = 10;
const DEDUPE_MS = 1200;
const actionLog: Record<string, number[]> = {};
const lastActionKey: Record<string, number> = {};

function checkRate(userId: string, action: string, messageId: string) {
	const now = Date.now();
	const key = `${userId}:${action}:${messageId}`;
	const list = actionLog[userId] || [];
	const cutoff = now - ACTION_WINDOW_MS;
	const pruned = list.filter((t) => t >= cutoff);
	pruned.push(now);
	actionLog[userId] = pruned;
	if (pruned.length > ACTION_MAX) {
		throw new Error("Rate limit exceeded");
	}
	const last = lastActionKey[key];
	if (last && now - last < DEDUPE_MS) {
		throw new Error("Duplicate action suppressed");
	}
	lastActionKey[key] = now;
}

async function assertModerator() {
	const { user } = await requireModerator();
	return { userId: user.$id };
}

export async function actionSoftDelete(messageId: string) {
	const { userId } = await assertModerator();
	checkRate(userId, "soft_delete", messageId);
	const start = Date.now();
	await softDeleteMessage(messageId, userId);
	await recordAudit("soft_delete", messageId, userId, {
		removedAt: new Date().toISOString(),
	});
	recordMetric("moderation.soft_delete.count");
	recordTiming("moderation.soft_delete.ms", start, { userId });
}

export async function actionRestore(messageId: string) {
	const { userId } = await assertModerator();
	checkRate(userId, "restore", messageId);
	const start = Date.now();
	await restoreMessage(messageId);
	await recordAudit("restore", messageId, userId, {
		restoredAt: new Date().toISOString(),
	});
	recordMetric("moderation.restore.count");
	recordTiming("moderation.restore.ms", start, { userId });
}

export async function actionHardDelete(messageId: string) {
	const { user, roles } = await requireModerator();
	if (!roles.isAdmin) {
		throw new Error("Forbidden");
	}
	const userId = user.$id;
	checkRate(userId, "hard_delete", messageId);
	const start = Date.now();
	await deleteMessage(messageId);
	await recordAudit("hard_delete", messageId, userId, {
		deletedAt: new Date().toISOString(),
	});
	recordMetric("moderation.hard_delete.count");
	recordTiming("moderation.hard_delete.ms", start, { userId });
}
