export type User = {
    $id: string;
    name: string;
    email: string;
};

export type CustomEmoji = {
    fileId: string;
    url: string;
    name: string;
};

export const ATTACHMENT_MEDIA_KIND_VALUES = [
    "generic",
    "image",
    "gif",
    "sticker",
] as const;

export type AttachmentMediaKind =
    (typeof ATTACHMENT_MEDIA_KIND_VALUES)[number];

export const ATTACHMENT_SOURCE_VALUES = [
    "upload",
    "giphy",
    "tenor",
    "builtin_sticker",
    "admin_sticker",
] as const;

export type AttachmentSource = (typeof ATTACHMENT_SOURCE_VALUES)[number];

export type FileAttachment = {
    fileId: string;
    fileName: string;
    fileSize: number; // Bytes
    fileType: string; // MIME type
    fileUrl: string;
    thumbnailUrl?: string; // For videos
    mediaKind?: AttachmentMediaKind;
    source?: AttachmentSource;
    provider?: "giphy" | "tenor";
    providerAssetId?: string;
    packId?: string;
    itemId?: string;
    previewUrl?: string;
};

export type StickerItem = {
    id: string;
    name: string;
    mediaUrl: string;
    previewUrl?: string;
    width?: number;
    height?: number;
    source: "builtin_sticker" | "admin_sticker";
    packId: string;
};

export type StickerPack = {
    id: string;
    name: string;
    description?: string;
    source: "builtin" | "admin";
    items: StickerItem[];
};

export type GifSearchItem = {
    id: string;
    title: string;
    gifUrl: string;
    previewUrl?: string;
    width?: number;
    height?: number;
    durationMs?: number;
    source: "giphy" | "tenor";
};

export type MessagePollOption = {
    id: string;
    text: string;
    count: number;
    voterIds: string[];
};

export type MessagePoll = {
    id: string;
    messageId: string;
    channelId: string;
    question: string;
    options: MessagePollOption[];
    status: "open" | "closed";
    createdBy: string;
    closedAt?: string;
    closedBy?: string;
};

export type Message = {
    $id: string;
    userId: string;
    userName?: string;
    text: string;
    $createdAt: string;
    channelId?: string;
    serverId?: string; // optional denormalized field for server level filtering
    editedAt?: string;
    removedAt?: string;
    removedBy?: string;
    imageFileId?: string;
    imageUrl?: string;
    attachments?: FileAttachment[]; // File attachments beyond images
    replyToId?: string; // ID of the message this is replying to
    threadId?: string; // Parent message ID when this is a thread reply
    threadMessageCount?: number; // Number of direct thread replies on parent message
    threadParticipants?: string[]; // User IDs that have replied in the thread
    lastThreadReplyAt?: string;
    mentions?: string[]; // Array of mentioned user IDs
    reactions?: Array<{
        emoji: string; // Emoji character or custom emoji ID
        userIds: string[]; // Array of user IDs who used this reaction
        count: number; // Total count for this emoji
    }>;
    // Profile information (enriched from profiles collection)
    displayName?: string;
    avatarFileId?: string;
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    pronouns?: string;
    // Reply context (enriched from parent message)
    replyTo?: {
        text: string;
        userName?: string;
        displayName?: string;
    };
    // Threading fields
    threadReplyCount?: number; // Count of replies (on parent message)
    // Pinning fields
    isPinned?: boolean;
    pinnedAt?: string; // ISO timestamp when pinned
    pinnedBy?: string; // User ID who pinned it
    poll?: MessagePoll;
};

export type Server = {
    $id: string;
    name: string;
    $createdAt: string;
    ownerId: string;
    memberCount?: number; // Computed from memberships, not stored in DB
    description?: string;
    iconFileId?: string;
    iconUrl?: string;
    bannerFileId?: string;
    bannerUrl?: string;
    isPublic?: boolean;
    defaultOnSignup?: boolean;
};

export type Channel = {
    $id: string;
    serverId: string;
    name: string;
    type?: "text" | "voice" | "announcement";
    topic?: string;
    categoryId?: string;
    position?: number;
    $createdAt: string;
    $updatedAt?: string;
};

export type ChannelCategory = {
    $id: string;
    serverId: string;
    name: string;
    position: number;
    createdBy?: string;
    allowedRoleIds?: string[];
    $createdAt: string;
    $updatedAt?: string;
};

export type InstanceSettings = {
    $id: string;
    allowUserServers: boolean;
    updatedAt: string;
};

export type FeatureFlag = {
    $id: string;
    key: string;
    enabled: boolean;
    description?: string;
    updatedAt?: string;
    updatedBy?: string;
};

export const ANNOUNCEMENT_PRIORITY_VALUES = ["normal", "urgent"] as const;

export type AnnouncementPriority =
    (typeof ANNOUNCEMENT_PRIORITY_VALUES)[number];

export const ANNOUNCEMENT_STATUS_VALUES = [
    "draft",
    "scheduled",
    "dispatching",
    "sent",
    "failed",
    "archived",
] as const;

export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUS_VALUES)[number];

export type AnnouncementUrgentBypass = {
    quietHours: boolean;
    globalNotifications: boolean;
    directMessagePrivacy: boolean;
};

export type Announcement = {
    $id: string;
    title?: string;
    body: string;
    bodyFormat: "markdown";
    status: AnnouncementStatus;
    priority: AnnouncementPriority;
    createdBy: string;
    recipientScope: "all_profiles";
    idempotencyKey?: string;
    scheduledFor?: string;
    publishedAt?: string;
    lastDispatchAt?: string;
    urgentBypass?: AnnouncementUrgentBypass;
    deliverySummary?: {
        attempted: number;
        delivered: number;
        failed: number;
    };
    dispatchAttempts?: number;
    errorDetails?: string;
    $createdAt?: string;
    $updatedAt?: string;
};

export const ANNOUNCEMENT_DELIVERY_STATUS_VALUES = [
    "pending",
    "delivered",
    "failed",
] as const;

export type AnnouncementDeliveryStatus =
    (typeof ANNOUNCEMENT_DELIVERY_STATUS_VALUES)[number];

export type AnnouncementDelivery = {
    $id: string;
    announcementId: string;
    recipientUserId: string;
    status: AnnouncementDeliveryStatus;
    attemptCount: number;
    conversationId?: string;
    messageId?: string;
    nextAttemptAt?: string;
    deliveredAt?: string;
    failedAt?: string;
    failureReason?: string;
    $createdAt?: string;
    $updatedAt?: string;
};

export type Membership = {
    $id: string;
    serverId: string;
    userId: string;
    role: "owner" | "member";
    $createdAt: string;
};

export type Conversation = {
    $id: string;
    $permissions?: string[];
    participants: string[]; // Array of user IDs
    lastMessageAt?: string;
    $createdAt: string;
    isGroup?: boolean; // True when this is a multi-participant DM room
    name?: string; // Optional custom name for the group DM
    avatarUrl?: string; // Optional custom avatar for the group DM
    createdBy?: string; // Creator of the conversation
    participantCount?: number; // Convenience count for UI
    readOnly?: boolean;
    readOnlyReason?: string;
    isSystemAnnouncementThread?: boolean;
    announcementThreadKey?: string;
    relationship?: RelationshipStatus;
    dmEncryptionSelfEnabled?: boolean;
    dmEncryptionPeerEnabled?: boolean;
    dmEncryptionPeerPublicKey?: string;
    unreadThreadCount?: number;
    hasUnread?: boolean;
    // Enriched data
    otherUser?: {
        userId: string;
        displayName?: string;
        avatarUrl?: string;
        avatarFramePreset?: string;
        avatarFrameUrl?: string;
        status?: string;
    };
    lastMessage?: {
        text: string;
        senderId: string;
        createdAt: string;
    };
};

export type InboxItemKind = "mention" | "thread";

export type InboxContextKind = "channel" | "conversation";

export type InboxContractVersion = "thread_v1" | "message_v2";

export type InboxItem = {
    id: string;
    kind: InboxItemKind;
    contextKind: InboxContextKind;
    contextId: string;
    serverId?: string;
    messageId: string;
    parentMessageId?: string;
    latestActivityAt: string;
    unreadCount: number;
    previewText: string;
    authorUserId: string;
    authorLabel: string;
    authorAvatarUrl?: string;
    muted: boolean;
};

export type InboxListResponse = {
    contractVersion: InboxContractVersion;
    items: InboxItem[];
    unreadCount: number;
    counts: Record<InboxItemKind, number>;
};

export type InboxDigestItem = {
    id: string;
    kind: InboxItemKind;
    contextKind: InboxContextKind;
    contextId: string;
    serverId?: string;
    messageId: string;
    parentMessageId?: string;
    activityAt: string;
    previewText: string;
    unreadCount: number;
    authorUserId: string;
    authorLabel: string;
    authorAvatarUrl?: string;
    muted: boolean;
};

export type InboxDigestResponse = {
    contractVersion: InboxContractVersion;
    navigationFallback: "context_catch_up";
    ordering: "newest_first" | "triage_priority";
    presentation: "flat";
    contextId?: string;
    contextKind?: InboxContextKind;
    items: InboxDigestItem[];
    totalUnreadCount: number;
};

export type DirectMessage = {
    $id: string;
    $permissions?: string[];
    conversationId: string;
    senderId: string;
    receiverId?: string; // Optional for group DMs where there is no single receiver
    // Plaintext message body used for non-encrypted messages.
    // When isEncrypted is true this MUST be empty or a fixed placeholder value,
    // not decrypted message content.
    text: string;
    // Indicates whether encrypted payload fields are present and expected.
    isEncrypted?: boolean;
    // Base64 ciphertext for encrypted message text. Populated only when isEncrypted is true.
    // This value remains on the message and is not cleared after decryption.
    encryptedText?: string;
    // Base64 nonce used with encryptedText.
    encryptionNonce?: string;
    // Encryption payload version identifier for compatibility handling.
    encryptionVersion?: string;
    // Base64 public key of the sender used to derive the shared decryption key.
    encryptionSenderPublicKey?: string;
    isSystemAnnouncement?: boolean;
    announcementId?: string;
    priorityTag?: AnnouncementPriority;
    imageFileId?: string;
    imageUrl?: string;
    attachments?: FileAttachment[]; // File attachments beyond images
    $createdAt: string;
    editedAt?: string;
    removedAt?: string;
    removedBy?: string;
    replyToId?: string; // ID of the message this is replying to
    threadId?: string; // Parent message ID when this is a thread reply
    threadMessageCount?: number; // Number of direct thread replies on parent message
    threadParticipants?: string[]; // User IDs that have replied in the thread
    lastThreadReplyAt?: string;
    mentions?: string[]; // Array of mentioned user IDs
    reactions?: Array<{
        emoji: string; // Emoji character or custom emoji ID
        userIds: string[]; // Array of user IDs who used this reaction
        count: number; // Total count for this emoji
    }>;
    // Enriched profile data
    senderDisplayName?: string;
    senderAvatarUrl?: string;
    senderAvatarFramePreset?: string;
    senderAvatarFrameUrl?: string;
    senderPronouns?: string;
    // Reply context (enriched from parent message)
    replyTo?: {
        text: string;
        senderDisplayName?: string;
    };
    // Pinning fields
    isPinned?: boolean;
    pinnedAt?: string;
    pinnedBy?: string;
    poll?: MessagePoll;
};

export type UserStatus = {
    $id: string;
    userId: string;
    status: "online" | "away" | "busy" | "offline";
    customMessage?: string;
    lastSeenAt: string;
    expiresAt?: string; // ISO 8601 timestamp when custom status should expire
    isManuallySet?: boolean; // True if user explicitly set this status (not auto-generated)
    $updatedAt?: string;
};

export type NavigationItemPreferenceId = "docs" | "friends" | "settings";

export type NavigationPreferences = {
    showDocsInNavigation: boolean;
    showFriendsInNavigation: boolean;
    showSettingsInNavigation: boolean;
    showAddFriendInHeader: boolean;
    telemetryEnabled: boolean;
    navigationItemOrder: NavigationItemPreferenceId[];
};

export type UserProfileData = {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
    avatarFileId?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    showDocsInNavigation?: boolean;
    showFriendsInNavigation?: boolean;
    showSettingsInNavigation?: boolean;
    showAddFriendInHeader?: boolean;
    telemetryEnabled?: boolean;
    navigationItemOrder?: NavigationItemPreferenceId[];
    profileBackgroundColor?: string;
    profileBackgroundGradient?: string;
    profileBackgroundImageFileId?: string;
    profileBackgroundImageChangedAt?: string;
    dmEncryptionPublicKey?: string;
    status?: {
        status: "online" | "away" | "busy" | "offline";
        customMessage?: string;
        lastSeenAt: string;
    };
};

export type Permission =
    | "readMessages"
    | "sendMessages"
    | "manageMessages"
    | "manageChannels"
    | "manageRoles"
    | "manageServer"
    | "mentionEveryone"
    | "administrator";

export type Role = {
    $id: string;
    serverId: string;
    name: string;
    color: string; // Hex color code like "#5865F2"
    position: number; // Higher number = higher in hierarchy
    defaultOnJoin?: boolean;
    // Permission flags
    readMessages: boolean;
    sendMessages: boolean;
    manageMessages: boolean;
    manageChannels: boolean;
    manageRoles: boolean;
    manageServer: boolean;
    mentionEveryone: boolean;
    administrator: boolean;
    // Other properties
    mentionable: boolean;
    memberCount?: number;
    $createdAt?: string;
};

export type ServerInvite = {
    $id: string;
    serverId: string;
    code: string; // Unique 8-10 char code
    creatorId: string;
    channelId?: string | null; // Default channel to show after joining
    expiresAt?: string | null; // ISO timestamp or null for never
    maxUses: number | null; // null for unlimited
    currentUses: number;
    temporary: boolean; // Kick user if they go offline without role
    $createdAt: string;
};

export type InviteUsage = {
    $id: string;
    inviteCode: string;
    userId: string;
    serverId: string;
    joinedAt: string;
};

export const FRIENDSHIP_STATUS_VALUES = [
    "pending",
    "accepted",
    "declined",
] as const;

export type FriendshipStatus = (typeof FRIENDSHIP_STATUS_VALUES)[number];

export type Friendship = {
    $id: string;
    requesterId: string;
    recipientId: string;
    pairKey: string;
    status: FriendshipStatus;
    requestedAt: string;
    respondedAt?: string;
    acceptedAt?: string;
    $createdAt?: string;
    $updatedAt?: string;
};

export type BlockedUser = {
    $id: string;
    userId: string;
    blockedUserId: string;
    blockedAt: string;
    reason?: string;
    $createdAt?: string;
    $updatedAt?: string;
};

export const DIRECT_MESSAGE_PRIVACY_VALUES = ["everyone", "friends"] as const;

export type DirectMessagePrivacy =
    (typeof DIRECT_MESSAGE_PRIVACY_VALUES)[number];

export type RelationshipStatus = {
    userId: string;
    friendshipStatus?: FriendshipStatus;
    isFriend: boolean;
    outgoingRequest: boolean;
    incomingRequest: boolean;
    blockedByMe: boolean;
    blockedMe: boolean;
    directMessagePrivacy: DirectMessagePrivacy;
    canSendDirectMessage: boolean;
    canReceiveFriendRequest: boolean;
};

export type RoleAssignment = {
    $id: string;
    userId: string;
    serverId: string;
    roleIds: string[]; // Array of role IDs assigned to this user
    $createdAt?: string;
};

export type ChannelPermissionOverride = {
    $id: string;
    channelId: string;
    roleId?: string; // If set, this override applies to a role
    userId?: string; // If set, this override applies to a specific user
    allow: Permission[]; // Permissions explicitly allowed
    deny: Permission[]; // Permissions explicitly denied (takes precedence)
    $createdAt?: string;
};

// Utility type for checking if user has specific permission
export type PermissionCheck = {
    userId: string;
    serverId: string;
    channelId?: string;
    permission: Permission;
};

// Utility type for effective permissions after calculating hierarchy
export type EffectivePermissions = {
    [K in Permission]: boolean;
};

export type PinnedMessage = {
    $id: string;
    messageId: string;
    contextType: "channel" | "conversation";
    contextId: string;
    pinnedBy: string;
    pinnedAt: string;
};

// ============ Notification System Types ============

/**
 * Notification level determines what messages trigger notifications
 */
export const NOTIFICATION_LEVEL_VALUES = [
    "all",
    "mentions",
    "nothing",
] as const;

export type NotificationLevel = (typeof NOTIFICATION_LEVEL_VALUES)[number];

/**
 * Mute duration options for temporary muting
 */
export type MuteDuration = "15m" | "1h" | "8h" | "24h" | "forever";

/**
 * Override settings for a specific server, channel, or conversation
 */
export type NotificationOverride = {
    level: NotificationLevel;
    mutedUntil?: string; // ISO timestamp, undefined means not muted or muted forever
};

export type NotificationOverrideMap = Record<string, NotificationOverride>;

export type NotificationOverrideLabelEntry = {
    meta?: string;
    subtitle?: string;
    title: string;
};

export type NotificationOverrideLabelMap = {
    channelOverrides: Record<string, NotificationOverrideLabelEntry>;
    conversationOverrides: Record<string, NotificationOverrideLabelEntry>;
    serverOverrides: Record<string, NotificationOverrideLabelEntry>;
};

/**
 * User's notification preferences
 */
export type NotificationSettings = {
    $id: string;
    userId: string;

    // Global settings
    globalNotifications: NotificationLevel;
    directMessagePrivacy: DirectMessagePrivacy;
    dmEncryptionEnabled?: boolean;
    desktopNotifications: boolean;
    pushNotifications: boolean;
    notificationSound: boolean;
    quietHoursStart?: string; // HH:mm format (24-hour)
    quietHoursEnd?: string; // HH:mm format (24-hour)
    quietHoursTimezone?: string; // IANA timezone (e.g., "America/New_York")

    // Per-context overrides (stored as JSON strings in database)
    serverOverrides?: NotificationOverrideMap;
    channelOverrides?: NotificationOverrideMap;
    conversationOverrides?: NotificationOverrideMap;

    $createdAt?: string;
    $updatedAt?: string;
};

export type NotificationSettingsResponse = NotificationSettings & {
    overrideLabels?: NotificationOverrideLabelMap;
};

/**
 * Payload for a notification event
 */
export type NotificationPayload = {
    type: "message" | "mention" | "dm" | "thread_reply";
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url: string; // Deep link to the message/channel
    data?: {
        messageId?: string;
        channelId?: string;
        serverId?: string;
        conversationId?: string;
        senderId?: string;
    };
};

/**
 * Result of checking if a user should be notified
 */
export type NotificationCheckResult = {
    shouldNotify: boolean;
    reason?:
        | "muted"
        | "quiet_hours"
        | "level_mismatch"
        | "user_online"
        | "blocked";
    effectiveLevel: NotificationLevel;
};
