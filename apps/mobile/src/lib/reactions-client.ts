import { firepitRequest } from "./firepit/http";

type Reaction = {
  emoji: string;
  userIds: string[];
  count: number;
};

function path(messageId: string, isDM: boolean) {
  return isDM
    ? `/api/direct-messages/${messageId}/reactions`
    : `/api/messages/${messageId}/reactions`;
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
  isAdding: boolean,
  isDM: boolean,
  instanceUrl: string,
  token: string,
): Promise<{ success: boolean; reactions?: Reaction[] }> {
  if (isAdding) {
    return firepitRequest({
      baseUrl: instanceUrl,
      path: path(messageId, isDM),
      method: "POST",
      token,
      body: { emoji },
    });
  }

  return firepitRequest({
    baseUrl: instanceUrl,
    path: path(messageId, isDM),
    method: "DELETE",
    token,
    query: { emoji },
  });
}
