type QueryValue = string | number | boolean | null | undefined;

const DEFAULT_TIMEOUT_MS = 30_000;

type RequestHealthListener = () => void;

const recoveredListeners = new Set<RequestHealthListener>();
let requestDegraded = false;

export function reportRequestFailure(): void {
  requestDegraded = true;
}

export function reportRequestSuccess(): void {
  if (!requestDegraded) return;
  requestDegraded = false;
  recoveredListeners.forEach((listener) => listener());
}

export function onRequestRecovered(listener: RequestHealthListener): () => void {
  recoveredListeners.add(listener);
  return () => {
    recoveredListeners.delete(listener);
  };
}

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
    Object.entries(authHeaders(token)).forEach(([key, value]) => {
      requestHeaders.set(key, value);
    });
  }
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      requestHeaders.set(key, value);
    });
  }

  // Appwrite Cloud hibernates the instance after idle; the first request after
  // a cold start can exceed the timeout. Retry once on timeout for idempotent
  // methods (the retry lands on a warm container). Mutating methods are skipped
  // so a timed-out write is never double-applied.
  const idempotent = ["GET", "HEAD", "PUT", "DELETE", "OPTIONS", "TRACE"];
  const attempts = idempotent.includes(method.toUpperCase()) ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
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

      reportRequestSuccess();
      return payload as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (attempt < attempts) continue;
        reportRequestFailure();
        throw new Error(`Request timed out after ${timeoutMs}ms: ${path}`);
      }
      if (error instanceof FirepitHttpError) {
        throw error;
      }
      reportRequestFailure();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Request timed out after ${timeoutMs}ms: ${path}`);
}
