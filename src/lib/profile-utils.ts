import type { CSSProperties } from "react";

const UNSAFE_CSS_VALUE_PATTERN =
    /(?:url\s*\(|expression\s*\(|data:|javascript:|@import|[;{}<>`\\])/i;
const SAFE_COLOR_PATTERN =
    /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]+\)|[a-z]+|var\(--[a-z0-9_-]+\))$/i;

function hasControlCharacters(value: string): boolean {
    for (let index = 0; index < value.length; index += 1) {
        const codePoint = value.charCodeAt(index);
        if (codePoint < 32 || codePoint === 127) {
            return true;
        }
    }

    return false;
}

function sanitizeCssValue(rawValue: string): string | undefined {
    const value = rawValue.trim();
    if (!value || UNSAFE_CSS_VALUE_PATTERN.test(value)) {
        return undefined;
    }

    return value;
}

function sanitizeGradient(rawGradient: string): string | undefined {
    const gradient = sanitizeCssValue(rawGradient);
    if (!gradient) {
        return undefined;
    }

    return /^(linear-gradient|radial-gradient|conic-gradient)\(/i.test(gradient)
        ? gradient
        : undefined;
}

function sanitizeColor(rawColor: string): string | undefined {
    const color = sanitizeCssValue(rawColor);
    if (!color) {
        return undefined;
    }

    return SAFE_COLOR_PATTERN.test(color) ? color : undefined;
}

function toSafeBackgroundImageUrl(rawUrl: string): string | undefined {
    try {
        const parsed = new URL(rawUrl);
        if (!["https:", "http:"].includes(parsed.protocol)) {
            return undefined;
        }

        const encoded = encodeURI(parsed.toString())
            .replaceAll('"', "%22")
            .replaceAll("'", "%27")
            .replaceAll("`", "%60")
            .replaceAll("(", "%28")
            .replaceAll(")", "%29")
            .replaceAll("\\", "%5C")
            .replaceAll("\n", "")
            .replaceAll("\r", "");

        return hasControlCharacters(encoded) ? undefined : encoded;
    } catch {
        return undefined;
    }
}

export function getProfileBackgroundStyle(opts: {
    backgroundUrl?: string | null;
    gradient?: string | null;
    color?: string | null;
}): CSSProperties | undefined {
    if (opts.backgroundUrl) {
        const safeBackgroundUrl = toSafeBackgroundImageUrl(opts.backgroundUrl);
        if (safeBackgroundUrl) {
            return {
                backgroundImage: `url("${safeBackgroundUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            };
        }
    }
    if (opts.gradient) {
        const safeGradient = sanitizeGradient(opts.gradient);
        if (safeGradient) {
            return { background: safeGradient };
        }
    }
    if (opts.color) {
        const safeColor = sanitizeColor(opts.color);
        return safeColor ? { background: safeColor } : undefined;
    }
    return undefined;
}
