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
