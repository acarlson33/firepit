import { Platform } from "react-native";

type QueryValue = string | number | boolean | null | undefined;

const DEFAULT_TIMEOUT_MS = 30_000;

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
  timeoutMs?: number;
};

/**
 * Auth headers for Firepit instance API calls.
 * Appwrite Cloud's edge rewrites Authorization to its own operator credential,
 * so the session token is sent in x-firepit-token (which the edge passes
 * through) in addition to Authorization (for non-Appwrite hosts).
 */
export function authHeaders(token: string): Record<string, string> {
  return {
    "x-firepit-token": token,
    Authorization: `Bearer ${token}`,
  };
}

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
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FirepitRequestOptions): Promise<T> {
  const url = buildUrl(baseUrl, path, query);
  const requestHeaders = new Headers({ Accept: "application/json" });
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    requestHeaders.set("x-firepit-token", token);
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      requestHeaders.set(key, value);
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
      credentials: "omit",
      signal: controller.signal,
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
