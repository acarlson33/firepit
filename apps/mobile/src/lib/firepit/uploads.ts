import { firepitRequest } from "@/lib/firepit/http";

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
  formData.append("file", {
    uri: input.uri,
    name: input.name ?? "upload",
    type: input.mimeType ?? "application/octet-stream",
  } as unknown as Blob);
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
