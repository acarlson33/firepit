import { Platform } from "react-native";

type QueryValue = string | number | boolean | null | undefined;

export class FirepitHttpError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "FirepitHttpError";
    this.status = status;
    this.payload = payload;
  }
}

export type FirepitRequestOptions = {
  baseUrl: string;
  path: string;
  method?: string;
  token?: string | null;
  body?: unknown;
  query?: Record<string, QueryValue>;
  headers?: HeadersInit;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
) {
  const url = new URL(path.replace(/^\//, ""), normalizeBaseUrl(baseUrl));
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  return text.length > 0 ? text : null;
}

export async function firepitRequest<T>({
  baseUrl,
  path,
  method = "GET",
  token,
  body,
  query,
  headers,
}: FirepitRequestOptions): Promise<T> {
  const url = buildUrl(baseUrl, path, query);
  const requestHeaders = new Headers({ Accept: "application/json" });
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      requestHeaders.set(key, value);
    });
  }
  console.log(
    "[http] firepitRequest",
    method,
    path,
    "- token present:",
    !!token,
    "- auth header set:",
    requestHeaders.has("Authorization"),
  );
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
  });

  const payload = await readResponseBody(response);
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(
            (payload as { error?: unknown }).error ??
              `Request failed with status ${response.status}`,
          )
        : `Request failed with status ${response.status}`;
    throw new FirepitHttpError(message, response.status, payload);
  }

  return payload as T;
}
