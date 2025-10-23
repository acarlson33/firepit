export type User = {
  $id: string;
  name: string;
  email: string;
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
  replyToId?: string; // ID of the message this is replying to
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
  $createdAt: string;
  editedAt?: string;
  removedAt?: string;
  removedBy?: string;
  replyToId?: string; // ID of the message this is replying to
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
