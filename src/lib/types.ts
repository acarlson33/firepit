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

export type FileAttachment = {
  fileId: string;
  fileName: string;
  fileSize: number; // Bytes
  fileType: string; // MIME type
  fileUrl: string;
  thumbnailUrl?: string; // For videos
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
  mentions?: string[]; // Array of mentioned user IDs
  reactions?: Array<{
    emoji: string; // Emoji character or custom emoji ID
    userIds: string[]; // Array of user IDs who used this reaction
    count: number; // Total count for this emoji
  }>;
  // Profile information (enriched from profiles collection)
  displayName?: string;
  pronouns?: string;
  avatarFileId?: string;
  avatarUrl?: string;
  // Reply context (enriched from parent message)
  replyTo?: {
    text: string;
    userName?: string;
    displayName?: string;
  };
};

export type Server = {
  $id: string;
  name: string;
  $createdAt: string;
  ownerId: string;
  memberCount?: number;
};

export type Channel = {
  $id: string;
  serverId: string;
  name: string;
  $createdAt: string;
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

export type Membership = {
  $id: string;
  serverId: string;
  userId: string;
  role: "owner" | "member";
  $createdAt: string;
};

export type Conversation = {
  $id: string;
  participants: string[]; // Array of user IDs
  lastMessageAt?: string;
  $createdAt: string;
  // Enriched data
  otherUser?: {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
    status?: string;
  };
  lastMessage?: {
    text: string;
    senderId: string;
    createdAt: string;
  };
};

export type DirectMessage = {
  $id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  imageFileId?: string;
  imageUrl?: string;
  attachments?: FileAttachment[]; // File attachments beyond images
  $createdAt: string;
  editedAt?: string;
  removedAt?: string;
  removedBy?: string;
  replyToId?: string; // ID of the message this is replying to
  mentions?: string[]; // Array of mentioned user IDs
  reactions?: Array<{
    emoji: string; // Emoji character or custom emoji ID
    userIds: string[]; // Array of user IDs who used this reaction
    count: number; // Total count for this emoji
  }>;
  // Enriched profile data
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  senderPronouns?: string;
  // Reply context (enriched from parent message)
  replyTo?: {
    text: string;
    senderDisplayName?: string;
  };
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

export type UserProfileData = {
  userId: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  pronouns?: string;
  location?: string;
  website?: string;
  avatarFileId?: string;
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
  channelId?: string; // Default channel to show after joining
  expiresAt?: string; // ISO timestamp or null for never
  maxUses?: number; // null for unlimited
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
