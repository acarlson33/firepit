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

export type Message = {
  $id?: string;
  userId?: string;
  userName?: string;
  text?: string;
  channelId?: string;
  serverId?: string;
  imageFileId?: string | null;
  imageUrl?: string | null;
  replyToId?: string | null;
  mentions?: string[];
  attachments?: Array<Record<string, unknown>>;
  removedAt?: string | null;
  removedBy?: string | null;
  $createdAt?: string;
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

export type ChannelListResponse = {
  channels?: Channel[];
  nextCursor?: string | null;
  [key: string]: unknown;
};

export type CreateMessageResponse = {
  message?: Message | null;
  [key: string]: unknown;
};

export type PublicServerListResponse = {
  servers?: ServerPreview[];
  [key: string]: unknown;
};
