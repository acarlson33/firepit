import { firepitRequest } from "./http";
import type {
    Announcement,
    AnnouncementCreateMode,
    AnnouncementPriority,
    AnnouncementStatus,
    CreateAnnouncementResponse,
    ListAnnouncementsResponse,
} from "./types";

type ListAnnouncementsParams = {
    cursorAfter?: string;
    limit?: number;
    statuses?: AnnouncementStatus[];
};

export async function listAnnouncements(
    baseUrl: string,
    token: string,
    params: ListAnnouncementsParams = {},
): Promise<ListAnnouncementsResponse> {
    const query: Record<string, string | number> = {};
    if (params.limit) query.limit = params.limit;
    if (params.cursorAfter) query.cursorAfter = params.cursorAfter;
    if (params.statuses && params.statuses.length > 0) {
        query.statuses = params.statuses.join(",");
    }

    return firepitRequest<ListAnnouncementsResponse>({
        baseUrl,
        path: "/api/announcements",
        token,
        query,
    });
}

type CreateAnnouncementParams = {
    body: string;
    idempotencyKey?: string;
    mode?: AnnouncementCreateMode;
    priority?: AnnouncementPriority;
    scheduledFor?: string;
    title?: string;
};

export async function createAnnouncement(
    baseUrl: string,
    token: string,
    input: CreateAnnouncementParams,
): Promise<CreateAnnouncementResponse> {
    return firepitRequest<CreateAnnouncementResponse>({
        baseUrl,
        path: "/api/announcements",
        method: "POST",
        token,
        body: input,
    });
}
