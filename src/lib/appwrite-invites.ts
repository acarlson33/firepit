import { ID, Query } from "node-appwrite";
import { nanoid } from "nanoid";
import type { ServerInvite, InviteUsage } from "./types";
import { getEnvConfig } from "./appwrite-core";
import { getServerClient } from "./appwrite-core";

const env = getEnvConfig();
const DATABASE_ID = env.databaseId;
const INVITES_COLLECTION_ID = "invites";
const INVITE_USAGE_COLLECTION_ID = "invite_usage";
const MEMBERSHIPS_COLLECTION_ID = env.collections.memberships || "memberships";
const SERVERS_COLLECTION_ID = env.collections.servers;

export type CreateInviteOptions = {
  serverId: string;
  creatorId: string;
  channelId?: string;
  expiresAt?: string; // ISO timestamp
  maxUses?: number; // null/undefined for unlimited
  temporary?: boolean;
};

export type ValidationResult = {
  valid: boolean;
  error?: string;
  invite?: ServerInvite;
};

/**
 * Generate a unique invite code with collision retry logic
 * Uses increasing code length to reduce collision probability under high load
 */
async function generateUniqueCode(): Promise<string> {
  const maxAttempts = 5;
  const { databases } = getServerClient();

  for (let i = 0; i < maxAttempts; i++) {
    // Increase code length after first collision to reduce probability
    const codeLength = 10 + (i > 0 ? i * 2 : 0); // 10, 12, 14, 16, 18
    const code = nanoid(codeLength);
    
    try {
      // Check if code exists
      const existing = await databases.listDocuments(
        DATABASE_ID,
        INVITES_COLLECTION_ID,
        [Query.equal("code", code), Query.limit(1)]
      );
      
      if (existing.documents.length === 0) {
        return code;
      }
      
      // Log collision for monitoring
      console.warn("Invite code collision detected", {
        code: `${code.substring(0, 4)  }...`, // Partial code for privacy
        attempt: i + 1,
        codeLength,
      });
    } catch (error) {
      // Continue to next attempt if query fails
      console.error("Code uniqueness check failed:", error);
    }
  }
  
  throw new Error("Failed to generate unique invite code after multiple attempts");
}

/**
 * Create a new server invite
 */
export async function createInvite(
  options: CreateInviteOptions
): Promise<ServerInvite> {
  const { databases } = getServerClient();
  const code = await generateUniqueCode();

  const data = {
    serverId: options.serverId,
    code,
    creatorId: options.creatorId,
    channelId: options.channelId || null,
    expiresAt: options.expiresAt || null,
    maxUses: options.maxUses || null,
    currentUses: 0,
    temporary: options.temporary ?? false,
  };

  const result = await databases.createDocument(
    DATABASE_ID,
    INVITES_COLLECTION_ID,
    ID.unique(),
    data
  );

  return result as unknown as ServerInvite;
}

/**
 * Get invite by code
 */
export async function getInviteByCode(code: string): Promise<ServerInvite | null> {
  const { databases } = getServerClient();

  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      INVITES_COLLECTION_ID,
      [Query.equal("code", code), Query.limit(1)]
    );

    if (result.documents.length === 0) {
      return null;
    }

    return result.documents[0] as unknown as ServerInvite;
  } catch (error) {
    console.error("Failed to get invite by code:", error);
    return null;
  }
}

/**
 * Validate an invite code
 */
export async function validateInvite(code: string): Promise<ValidationResult> {
  const invite = await getInviteByCode(code);

  if (!invite) {
    return { valid: false, error: "Invalid invite code" };
  }

  // Check expiration
  if (invite.expiresAt) {
    const expirationDate = new Date(invite.expiresAt);
    if (expirationDate < new Date()) {
      return { valid: false, error: "Invite has expired", invite };
    }
  }

  // Check max uses
  if (invite.maxUses !== null && invite.maxUses !== undefined) {
    if (invite.currentUses >= invite.maxUses) {
      return { valid: false, error: "Invite has reached maximum uses", invite };
    }
  }

  return { valid: true, invite };
}

/**
 * Use an invite (increment usage count and record usage)
 */
export async function useInvite(
  code: string,
  userId: string
): Promise<{ success: boolean; error?: string; serverId?: string }> {
  const { databases } = getServerClient();

  // Validate the invite
  const validation = await validateInvite(code);
  if (!validation.valid || !validation.invite) {
    return { success: false, error: validation.error };
  }

  const invite = validation.invite;

  // Check if user is already a member
  try {
    const existingMembership = await databases.listDocuments(
      DATABASE_ID,
      MEMBERSHIPS_COLLECTION_ID,
      [
        Query.equal("userId", userId),
        Query.equal("serverId", invite.serverId),
        Query.limit(1),
      ]
    );

    if (existingMembership.documents.length > 0) {
      return { success: false, error: "You are already a member of this server" };
    }
  } catch (error) {
    console.error("Failed to check existing membership:", error);
    return { success: false, error: "Failed to verify membership status" };
  }

  // Create membership
  try {
    await databases.createDocument(
      DATABASE_ID,
      MEMBERSHIPS_COLLECTION_ID,
      ID.unique(),
      {
        serverId: invite.serverId,
        userId,
        role: "member",
      }
    );
  } catch (error) {
    console.error("Failed to create membership:", error);
    return { success: false, error: "Failed to join server" };
  }

  // Increment invite usage count with optimistic locking retry
  const maxRetries = 3;
  let usageUpdated = false;
  
  for (let attempt = 0; attempt < maxRetries && !usageUpdated; attempt++) {
    try {
      // Re-fetch invite to get latest currentUses value
      const currentInvite = await databases.getDocument(
        DATABASE_ID,
        INVITES_COLLECTION_ID,
        invite.$id
      );
      
      const newUses = (currentInvite.currentUses as number) + 1;
      
      // Check if we would exceed maxUses
      if (currentInvite.maxUses !== null && currentInvite.maxUses !== undefined) {
        if (newUses > (currentInvite.maxUses as number)) {
          console.warn("Invite usage would exceed maxUses during concurrent join", {
            inviteId: invite.$id,
            currentUses: currentInvite.currentUses,
            maxUses: currentInvite.maxUses,
          });
          // Don't fail - membership already created
          break;
        }
      }
      
      await databases.updateDocument(
        DATABASE_ID,
        INVITES_COLLECTION_ID,
        invite.$id,
        {
          currentUses: newUses,
        }
      );
      
      usageUpdated = true;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error("Failed to update invite usage count after retries:", error);
      } else {
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }

  // Record invite usage
  try {
    await databases.createDocument(
      DATABASE_ID,
      INVITE_USAGE_COLLECTION_ID,
      ID.unique(),
      {
        inviteCode: code,
        userId,
        serverId: invite.serverId,
        joinedAt: new Date().toISOString(),
      }
    );
  } catch (error) {
    console.error("Failed to record invite usage:", error);
    // Non-fatal - membership was created successfully
  }

  // Increment server member count with retry logic
  let memberCountUpdated = false;
  
  for (let attempt = 0; attempt < maxRetries && !memberCountUpdated; attempt++) {
    try {
      const server = await databases.getDocument(
        DATABASE_ID,
        SERVERS_COLLECTION_ID,
        invite.serverId
      );
      
      const currentCount = typeof server.memberCount === 'number' ? server.memberCount : 0;
      await databases.updateDocument(
        DATABASE_ID,
        SERVERS_COLLECTION_ID,
        invite.serverId,
        { memberCount: currentCount + 1 }
      );
      
      memberCountUpdated = true;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error("Failed to update server member count after retries:", error);
      } else {
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }

  return { success: true, serverId: invite.serverId };
}

/**
 * List all invites for a server
 */
export async function listServerInvites(serverId: string): Promise<ServerInvite[]> {
  const { databases } = getServerClient();

  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      INVITES_COLLECTION_ID,
      [
        Query.equal("serverId", serverId),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]
    );

    return result.documents as unknown as ServerInvite[];
  } catch (error) {
    console.error("Failed to list server invites:", error);
    return [];
  }
}

/**
 * Revoke (delete) an invite
 */
export async function revokeInvite(inviteId: string): Promise<boolean> {
  const { databases } = getServerClient();

  try {
    await databases.deleteDocument(
      DATABASE_ID,
      INVITES_COLLECTION_ID,
      inviteId
    );
    return true;
  } catch (error) {
    console.error("Failed to revoke invite:", error);
    return false;
  }
}

/**
 * Get invite usage statistics for an invite
 */
export async function getInviteUsage(code: string): Promise<InviteUsage[]> {
  const { databases } = getServerClient();

  try {
    const result = await databases.listDocuments(
      DATABASE_ID,
      INVITE_USAGE_COLLECTION_ID,
      [
        Query.equal("inviteCode", code),
        Query.orderDesc("joinedAt"),
        Query.limit(100),
      ]
    );

    return result.documents as unknown as InviteUsage[];
  } catch (error) {
    console.error("Failed to get invite usage:", error);
    return [];
  }
}

/**
 * Get server info for invite preview (public, no auth required)
 */
export async function getServerPreview(serverId: string): Promise<{
  name: string;
  memberCount: number;
} | null> {
  const { databases } = getServerClient();

  try {
    const server = await databases.getDocument(
      DATABASE_ID,
      SERVERS_COLLECTION_ID,
      serverId
    );

    return {
      name: server.name as string,
      memberCount: (server.memberCount as number) || 0,
    };
  } catch (error) {
    console.error("Failed to get server preview:", error);
    return null;
  }
}
