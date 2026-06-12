export type VersionInfo = {
    version: string;
    commit?: string;
    branch?: string;
    builtAt?: string;
};

export type FeatureFlagState = {
    key?: string;
    enabled?: boolean;
};

export type InstanceMetadata = {
    name?: string;
    title?: string;
    description?: string;
    appwriteEndpoint?: string;
    appwriteProjectId?: string;
    minimumMobileVersion?: string;
    minMobileVersion?: string;
    minimumClientVersion?: string;
    minClientVersion?: string;
    compatible?: boolean;
    compatibilityReason?: string;
    [key: string]: unknown;
};

export type CurrentUser = {
    $id?: string;
    userId?: string;
    name?: string;
    displayName?: string;
    userName?: string;
    avatarUrl?: string;
    email?: string;
    roles?: Record<string, unknown>;
};

export type BootstrapSnapshot = {
    instanceUrl: string;
    version: VersionInfo;
    instance: InstanceMetadata;
    allowUserServers: boolean;
    compatible: boolean;
    compatibilityReason?: string;
    currentUser: CurrentUser | null;
};

export type ConnectionState =
    | "idle"
    | "loading"
    | "needs-instance"
    | "needs-auth"
    | "ready"
    | "incompatible"
    | "error";

export type CompatibilityEvaluation = {
    compatible: boolean;
    minimumVersion: string;
    reason?: string;
};

export type Server = {
    $id?: string;
    name?: string;
    ownerId?: string;
    iconFileId?: string | null;
    iconUrl?: string | null;
    bannerFileId?: string | null;
    bannerUrl?: string | null;
    description?: string | null;
    isPublic?: boolean;
    defaultOnSignup?: boolean;
    memberCount?: number;
    $createdAt?: string;
    [key: string]: unknown;
};

export type ServerPreview = {
    $id?: string;
    name?: string;
    ownerId?: string;
    iconUrl?: string | null;
    description?: string | null;
    isPublic?: boolean;
    defaultOnSignup?: boolean;
    memberCount?: number;
    $createdAt?: string;
    [key: string]: unknown;
};

export type Channel = {
    $id?: string;
    serverId?: string;
    name?: string;
    type?: "text" | "voice" | "announcement" | string;
    topic?: string | null;
    categoryId?: string | null;
    position?: number | null;
    isPrivate?: boolean;
    unreadCount?: number;
    memberCount?: number;
    lastMessageAt?: string | null;
    $createdAt?: string;
    [key: string]: unknown;
};

export type MessageAttachment = {
    fileId?: string;
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    fileUrl?: string;
    downloadUrl?: string;
    category?: string;
    thumbnailUrl?: string;
    [key: string]: unknown;
};

export type Message = {
    $id?: string;
    userId?: string;
    userName?: string;
    text?: string;
    channelId?: string;
    serverId?: string;
    reactions?: Array<{
        emoji: string;
        userIds: string[];
        count: number;
        reactedByMe?: boolean;
    }>;
    imageFileId?: string | null;
    imageUrl?: string | null;
    replyToId?: string | null;
    mentions?: string[];
    threadId?: string | null;
    threadMessageCount?: number | null;
    threadParticipants?: string[] | null;
    lastThreadReplyAt?: string | null;
    local?: boolean;
    attachments?: MessageAttachment[];
    removedAt?: string | null;
    removedBy?: string | null;
    $createdAt?: string;
    [key: string]: unknown;
};

export type InboxItemKind = "mention" | "thread";

export type InboxContextKind = "channel" | "conversation";

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
    contractVersion: string;
    navigationFallback: "context_catch_up";
    ordering: "newest_first" | "triage_priority";
    presentation: "flat";
    contextId?: string;
    contextKind?: InboxContextKind;
    items: InboxDigestItem[];
    totalUnreadCount: number;
};

export type SearchMessageResult = {
    type: "channel" | "dm";
    message: Message;
    serverId?: string;
    channelId?: string;
    conversationId?: string;
};

export type SearchMessagesResponse = {
    results?: SearchMessageResult[];
    [key: string]: unknown;
};

export type DirectMessageParticipant = {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    pronouns?: string;
    [key: string]: unknown;
};

export type DirectMessageConversation = {
    $id?: string;
    participants?: string[];
    lastMessageAt?: string | null;
    $createdAt?: string;
    isGroup?: boolean;
    name?: string | null;
    avatarUrl?: string | null;
    createdBy?: string;
    participantCount?: number;
    otherUser?: DirectMessageParticipant | null;
    readOnly?: boolean;
    readOnlyReason?: string | null;
    relationship?: Record<string, unknown> | null;
    dmEncryptionSelfEnabled?: boolean;
    dmEncryptionPeerEnabled?: boolean;
    dmEncryptionMutualEnabled?: boolean;
    dmEncryptionPeerPublicKey?: string;
    isSystemAnnouncementThread?: boolean;
    announcementThreadKey?: string;
    [key: string]: unknown;
};

export type DirectMessage = {
    $id?: string;
    conversationId?: string;
    senderId?: string;
    receiverId?: string;
    text?: string;
    isEncrypted?: boolean;
    encryptedText?: string;
    encryptionNonce?: string;
    encryptionVersion?: string;
    encryptionSenderPublicKey?: string;
    imageFileId?: string | null;
    imageUrl?: string | null;
    replyToId?: string | null;
    mentions?: string[];
    attachments?: MessageAttachment[];
    reactions?: Array<{
        emoji: string;
        userIds: string[];
        count: number;
        reactedByMe?: boolean;
    }>;
    editedAt?: string;
    removedAt?: string | null;
    removedBy?: string | null;
    $createdAt?: string;
    local?: boolean;
    [key: string]: unknown;
};

export type DirectMessageConversationsResponse = {
    conversations?: DirectMessageConversation[];
    [key: string]: unknown;
};

export type DirectMessageConversationResponse = {
    conversation?: DirectMessageConversation | null;
    [key: string]: unknown;
};

export type DirectMessageMessagesResponse = {
    items?: DirectMessage[];
    nextCursor?: string | null;
    readOnly?: boolean;
    readOnlyReason?: string;
    relationship?: Record<string, unknown>;
    dmEncryptionSelfEnabled?: boolean;
    dmEncryptionPeerEnabled?: boolean;
    dmEncryptionMutualEnabled?: boolean;
    dmEncryptionPeerPublicKey?: string;
    [key: string]: unknown;
};

export type UserProfile = {
    userId?: string;
    displayName?: string;
    name?: string;
    username?: string;
    handle?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    avatar?: string;
    profileImageUrl?: string;
    avatarFileId?: string;
    avatarUrl?: string;
    profileBackgroundColor?: string;
    profileBackgroundGradient?: string;
    profileBackgroundImageFileId?: string;
    profileBackgroundUrl?: string;
    dmEncryptionPublicKey?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    status?: {
        status?: string;
        customMessage?: string;
        lastSeenAt?: string;
    };
    [key: string]: unknown;
};

export type ThreadMessagesResponse = {
    parentMessage?: Message | null;
    message?: Message | null;
    items?: Message[];
    replies?: Message[];
    [key: string]: unknown;
};

export type JoinMembership = {
    $id?: string;
    $createdAt?: string;
    $updatedAt?: string;
    userId?: string;
    serverId?: string;
    role?: "owner" | "member" | string;
    [key: string]: unknown;
};

export type JoinResponse = {
    success?: boolean;
    membership?: JoinMembership | null;
    server?: Server | null;
    [key: string]: unknown;
};

export type ServerListResponse = {
    servers?: Server[];
    nextCursor?: string | null;
    [key: string]: unknown;
};

export type ServerResponse = {
    server?: Server | null;
    [key: string]: unknown;
};

export type CreateServerInput = {
    name: string;
    description?: string;
    iconFileId?: string;
    bannerFileId?: string;
    isPublic?: boolean;
};

export type CreateServerResponse = {
    success?: boolean;
    membership?: JoinMembership | null;
    server?: Server | null;
    [key: string]: unknown;
};

export type InvitePreview = {
    code: string;
    serverId: string;
    channelId?: string | null;
    expiresAt?: string | null;
    maxUses?: number | null;
    currentUses?: number;
    temporary?: boolean;
};

export type InvitePreviewResponse = {
    invite?: InvitePreview | null;
    server?: Pick<Server, "name" | "memberCount"> | null;
    [key: string]: unknown;
};

export type InviteJoinResponse = {
    success?: boolean;
    serverId?: string;
    [key: string]: unknown;
};

export type ServerCategory = {
    $id?: string;
    serverId?: string;
    name?: string;
    position?: number | null;
    allowedRoleIds?: string[] | null;
    $createdAt?: string;
    [key: string]: unknown;
};

export type CategoryListResponse = {
    categories?: ServerCategory[];
    [key: string]: unknown;
};

export type CategoryResponse = {
    category?: ServerCategory | null;
    [key: string]: unknown;
};

export type ServerRole = {
    $id?: string;
    serverId?: string;
    name?: string;
    color?: string | null;
    position?: number | null;
    readMessages?: boolean;
    sendMessages?: boolean;
    manageMessages?: boolean;
    manageChannels?: boolean;
    manageRoles?: boolean;
    manageServer?: boolean;
    mentionEveryone?: boolean;
    administrator?: boolean;
    mentionable?: boolean;
    defaultOnJoin?: boolean;
    $createdAt?: string;
    [key: string]: unknown;
};

export type RoleListResponse = {
    roles?: ServerRole[];
    [key: string]: unknown;
};

export type RoleResponse = {
    role?: ServerRole | null;
    [key: string]: unknown;
};

export type RoleAssignment = {
    $id?: string;
    userId?: string;
    serverId?: string;
    roleId?: string;
    [key: string]: unknown;
};

export type RoleAssignmentListResponse = {
    assignments?: RoleAssignment[];
    members?: Array<{
        userId: string;
        displayName?: string;
        userName?: string;
        avatarUrl?: string;
        roleIds?: string[];
    }>;
    total?: number;
    truncated?: boolean;
    [key: string]: unknown;
};

export type ChannelPermissionOverride = {
    $id?: string;
    channelId?: string;
    roleId?: string | null;
    userId?: string | null;
    allow?: string[];
    deny?: string[];
    [key: string]: unknown;
};

export type ChannelPermissionOverridesResponse = {
    overrides?: ChannelPermissionOverride[];
    override?: ChannelPermissionOverride | null;
    [key: string]: unknown;
};

export type ServerModerationResponse = {
    success?: boolean;
    action?: string;
    userId?: string;
    result?: unknown;
    [key: string]: unknown;
};

export type ServerAuditLogEntry = {
    $id?: string;
    action?: string;
    moderatorId?: string;
    moderatorName?: string;
    targetUserId?: string;
    targetUserName?: string;
    reason?: string;
    timestamp?: string;
    details?: Record<string, unknown> | null;
    [key: string]: unknown;
};

export type ServerAuditLogResponse = {
    items?: ServerAuditLogEntry[];
    [key: string]: unknown;
};

export type ServerStatsResponse = {
    totalMembers?: number;
    totalChannels?: number;
    totalMessages?: number;
    recentMessages?: number;
    bannedUsers?: number;
    mutedUsers?: number;
    [key: string]: unknown;
};

export type ServerInvite = {
    $id?: string;
    code?: string;
    serverId?: string;
    channelId?: string | null;
    expiresAt?: string | null;
    maxUses?: number | null;
    currentUses?: number;
    temporary?: boolean;
    [key: string]: unknown;
};

export type ChannelListResponse = {
    channels?: Channel[];
    nextCursor?: string | null;
    [key: string]: unknown;
};

export type ChannelResponse = {
    channel?: Channel | null;
    [key: string]: unknown;
};

export type CreateMessageResponse = {
    message?: Message | null;
    [key: string]: unknown;
};

export type MessageListResponse = {
    messages?: Message[];
    nextCursor?: string | null;
    [key: string]: unknown;
};

export type PublicServerListResponse = {
    servers?: ServerPreview[];
    [key: string]: unknown;
};
