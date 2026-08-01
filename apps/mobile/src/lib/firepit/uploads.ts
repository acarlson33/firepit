import { firepitRequest } from "@/lib/firepit/http";
import { readAsStringAsync } from "expo-file-system/legacy";

export type NativeAttachment = {
  uri: string;
  name?: string;
  mimeType?: string | null;
  size?: number | null;
};

export type UploadedImageAttachment = {
  fileId: string;
  fileUrl: string;
};

export type UploadedFileAttachment = {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType?: string;
  fileUrl: string;
  downloadUrl?: string;
  category?: string;
};

async function createUploadFormData(input: NativeAttachment) {
  const formData = new FormData();
  try {
    const base64 = await readAsStringAsync(input.uri, { encoding: "base64" });
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    formData.append("file", {
      bytes: () => bytes,
      name: input.name ?? "upload",
      type: input.mimeType ?? "application/octet-stream",
    } as unknown as Blob);
  } catch {
    formData.append("file", {
      uri: input.uri,
      name: input.name ?? "upload",
      type: input.mimeType ?? "application/octet-stream",
    } as unknown as Blob);
  }
  return formData;
}

export async function uploadImage(
  baseUrl: string,
  token: string,
  input: NativeAttachment,
) {
  return firepitRequest<UploadedImageAttachment>({
    baseUrl,
    path: "/api/upload-image",
    method: "POST",
    token,
    body: await createUploadFormData(input),
  });
}

export async function uploadFile(
  baseUrl: string,
  token: string,
  input: NativeAttachment,
) {
  return firepitRequest<UploadedFileAttachment>({
    baseUrl,
    path: "/api/upload-file",
    method: "POST",
    token,
    body: await createUploadFormData(input),
  });
}
