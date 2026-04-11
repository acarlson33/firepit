import type { CSSProperties } from "react";

export function getProfileBackgroundStyle(opts: {
    backgroundUrl?: string | null;
    gradient?: string | null;
    color?: string | null;
}): CSSProperties | undefined {
    if (opts.backgroundUrl) {
        return {
            backgroundImage: `url(${opts.backgroundUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
        };
    }
    if (opts.gradient) {
        return { background: opts.gradient };
    }
    if (opts.color) {
        return { background: opts.color };
    }
    return undefined;
}
