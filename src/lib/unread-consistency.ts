type DmUnreadSnapshot = {
    conversationCount: number;
    recordedAt: number;
    totalUnreadThreadCount: number;
    truncated: boolean;
};

type UnreadComparison = {
    absDelta: number;
    delta: number;
    dmSnapshot: DmUnreadSnapshot;
    inboxConversationThreadUnreadCount: number;
    snapshotAgeMs: number;
};

const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 1_000;
const SNAPSHOT_SWEEP_INTERVAL_MS = 60_000;
const dmUnreadSnapshotByUserId = new Map<string, DmUnreadSnapshot>();

function sweepStaleSnapshots(now = Date.now()) {
    for (const [userId, snapshot] of dmUnreadSnapshotByUserId.entries()) {
        if (now - snapshot.recordedAt > SNAPSHOT_MAX_AGE_MS) {
            dmUnreadSnapshotByUserId.delete(userId);
        }
    }
}

if (process.env.NODE_ENV !== "test") {
    const timer = setInterval(() => {
        sweepStaleSnapshots();
    }, SNAPSHOT_SWEEP_INTERVAL_MS);
    if (typeof timer.unref === "function") {
        timer.unref();
    }
}

export function rememberDmUnreadThreadSnapshot(params: {
    conversationCount: number;
    totalUnreadThreadCount: number;
    truncated: boolean;
    userId: string;
}) {
    const { conversationCount, totalUnreadThreadCount, truncated, userId } =
        params;
    if (userId.length === 0) {
        return;
    }

    dmUnreadSnapshotByUserId.set(userId, {
        conversationCount,
        recordedAt: Date.now(),
        totalUnreadThreadCount,
        truncated,
    });
}

export function compareInboxVsDmUnreadThreads(params: {
    inboxConversationThreadUnreadCount: number;
    userId: string;
}): UnreadComparison | null {
    const { inboxConversationThreadUnreadCount, userId } = params;
    if (userId.length === 0) {
        return null;
    }

    const dmSnapshot = dmUnreadSnapshotByUserId.get(userId);
    if (!dmSnapshot) {
        return null;
    }

    const snapshotAgeMs = Date.now() - dmSnapshot.recordedAt;
    if (snapshotAgeMs < 0 || snapshotAgeMs > SNAPSHOT_MAX_AGE_MS) {
        dmUnreadSnapshotByUserId.delete(userId);
        return null;
    }

    const delta =
        inboxConversationThreadUnreadCount - dmSnapshot.totalUnreadThreadCount;

    return {
        absDelta: Math.abs(delta),
        delta,
        dmSnapshot: { ...dmSnapshot },
        inboxConversationThreadUnreadCount,
        snapshotAgeMs,
    };
}

export function clearUnreadConsistencySnapshots() {
    dmUnreadSnapshotByUserId.clear();
}
