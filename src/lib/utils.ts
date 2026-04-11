import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn composes conditional className inputs with clsx, then resolves Tailwind
 * utility conflicts using tailwind-merge.
 * Accepts any ClassValue input (strings, arrays, and object maps). Falsy values
 * are ignored; later conflicting Tailwind utilities win.
 *
 * @param {ClassValue[]} inputs - Class fragments to merge into one className string.
 * @returns {string} Stable merged className string suitable for React className props.
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Parses JSON safely and returns fallback when parsing fails.
 *
 * @param {string} json - Serialized JSON payload.
 * @param {T} fallback - Value returned when parsing throws.
 * @returns {T} Parsed value on success, otherwise fallback.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}

/**
 * Creates a debounced wrapper that delays invocation until no calls occur
 * within the wait window. Each call resets the timer.
 *
 * @param {T} func - Function to invoke after the debounce delay.
 * @param {number} wait - Debounce delay in milliseconds.
 * @returns {(...args: Parameters<T>) => void} Debounced function with the same parameter list.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Formats a timestamp as a short relative label (for example "2 hours ago").
 * Falls back to the locale date string for values older than one week.
 *
 * @param {string | Date} date - ISO-like string or Date instance to format.
 * @returns {string} Human-readable relative time label.
 */
export function formatRelativeTime(date: string | Date): string {
    const nowMs = Date.now();
    const thenMs = typeof date === "string" ? Date.parse(date) : date.getTime();

    if (Number.isNaN(thenMs) || thenMs >= nowMs) {
        return "just now";
    }

    const diffMs = nowMs - thenMs;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
        return "just now";
    }
    if (diffMin < 60) {
        return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
    }
    if (diffHour < 24) {
        return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
    }
    if (diffDay < 7) {
        return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
    }
    return new Date(thenMs).toLocaleDateString();
}

/**
 * Truncates text to maxLength and appends an ellipsis when needed.
 * If text is already within the limit, it is returned unchanged.
 *
 * @param {string} text - Source text to truncate.
 * @param {number} maxLength - Maximum output length including ellipsis.
 * @returns {string} Truncated text with "..." suffix when truncation occurs.
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Type guard that checks whether a value is a non-empty trimmed string.
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True when value is a string containing non-whitespace characters.
 */
export function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Builds avatar initials from a display name.
 * Uses first and last tokens for multi-word names, or the first character for
 * single-token names; returns "?" for blank input.
 *
 * @param {string} name - Display name to convert.
 * @returns {string} Uppercased initials suitable for avatar fallbacks.
 */
export function getInitials(name: string): string {
    if (!name || name.trim().length === 0) {
        return "?";
    }
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }
    return (
        parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
}

/**
 * Formats a message timestamp as "date time" using the user's locale settings.
 *
 * @param {string} dateString - Date/time string accepted by the Date constructor.
 * @returns {string} Locale-formatted date and time.
 */
export function formatMessageTimestamp(dateString: string): string {
    const date = new Date(dateString);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    return `${dateStr} ${timeStr}`;
}
