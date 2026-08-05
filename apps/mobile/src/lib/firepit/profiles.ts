import { authHeaders, firepitRequest } from "@/lib/firepit/http";
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

const UPLOAD_TIMEOUT_MS = 30_000;

async function postFormData<T>(
    baseUrl: string,
    path: string,
    token: string,
    formData: FormData,
    failureLabel: string,
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
            method: "POST",
            headers: authHeaders(token),
            body: formData,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`${failureLabel} failed (${response.status})`);
        }
        return response.json() as Promise<T>;
    } finally {
        clearTimeout(timer);
    }
}

export async function uploadAvatar(
    baseUrl: string,
    token: string,
    imageUri: string,
): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append("avatar", await fileToFormDataPart(imageUri, "avatar.jpg", "image/jpeg"));

    return postFormData<AvatarUploadResponse>(
        baseUrl,
        "/api/profile/avatar",
        token,
        formData,
        "Avatar upload",
    );
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

    return postFormData<BackgroundUploadResponse>(
        baseUrl,
        "/api/profile/background",
        token,
        formData,
        "Background upload",
    );
}
