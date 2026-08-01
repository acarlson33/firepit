import { firepitRequest } from "@/lib/firepit/http";
import { readAsStringAsync } from "expo-file-system/legacy";

export type UpdateProfileInput = {
    displayName?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    profileBackgroundColor?: string | null;
    profileBackgroundGradient?: string | null;
};

export type UpdateProfileResponse = {
    userId?: string;
    displayName?: string;
    userName?: string;
    bio?: string;
    pronouns?: string;
    location?: string;
    website?: string;
    avatarFileId?: string;
    avatarUrl?: string;
};

export type AvatarUploadResponse = {
    fileId: string;
    avatarUrl: string;
};

export type BackgroundUploadResponse = {
    fileId: string;
    backgroundUrl: string;
};

export async function updateProfile(
    baseUrl: string,
    token: string,
    data: UpdateProfileInput,
) {
    return firepitRequest<UpdateProfileResponse>({
        baseUrl,
        path: "/api/profile",
        method: "PATCH",
        token,
        body: data,
    });
}

async function fileToFormDataPart(uri: string, name: string, mimeType: string) {
    try {
        const base64 = await readAsStringAsync(uri, { encoding: "base64" });
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        return { bytes: () => bytes, name, type: mimeType } as unknown as Blob;
    } catch {
        return { uri, name, type: mimeType } as unknown as Blob;
    }
}

export async function uploadAvatar(
    baseUrl: string,
    token: string,
    imageUri: string,
): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append("avatar", await fileToFormDataPart(imageUri, "avatar.jpg", "image/jpeg"));

    const url = `${baseUrl.replace(/\/$/, "")}/api/profile/avatar`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Avatar upload failed (${response.status}): ${errorBody}`,
        );
    }

    return response.json() as Promise<AvatarUploadResponse>;
}

export async function removeAvatar(
    baseUrl: string,
    token: string,
) {
    return firepitRequest<{ success: boolean }>({
        baseUrl,
        path: "/api/profile/avatar",
        method: "DELETE",
        token,
    });
}

export async function uploadProfileBackground(
    baseUrl: string,
    token: string,
    imageUri: string,
): Promise<BackgroundUploadResponse> {
    const formData = new FormData();
    formData.append("background", await fileToFormDataPart(imageUri, "background.jpg", "image/jpeg"));

    const url = `${baseUrl.replace(/\/$/, "")}/api/profile/background`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
            `Background upload failed (${response.status}): ${errorBody}`,
        );
    }

    return response.json() as Promise<BackgroundUploadResponse>;
}
