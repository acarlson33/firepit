import { firepitRequest } from "@/lib/firepit/http";
import type { CreateMessageResponse, Message } from "@/lib/firepit/types";

export type CreateChannelMessageInput = {
  channelId: string;
  serverId?: string;
  text?: string;
  replyToId?: string;
  mentions?: string[];
  imageFileId?: string;
  imageUrl?: string;
  attachments?: Array<Record<string, unknown>>;
};

export async function createChannelMessage(
  baseUrl: string,
  token: string,
  input: CreateChannelMessageInput,
) {
  return firepitRequest<CreateMessageResponse>({
    baseUrl,
    path: "/api/messages",
    method: "POST",
    token,
    body: input,
  });
}

export type TimelineMessage = Message & {
  local?: boolean;
};
