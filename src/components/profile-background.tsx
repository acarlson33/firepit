"use client";

import { useState } from "react";
import Image from "next/image";
import { getPresetFrameById } from "@/lib/preset-frames";

type ProfileBackgroundProps = {
    backgroundColor?: string;
    backgroundGradient?: string;
    height?: "sm" | "md" | "lg" | "xl" | "auto";
    className?: string;
    children?: React.ReactNode;
};

const heightClasses = {
    sm: "h-16",
    md: "h-24",
    lg: "h-32",
    xl: "h-40",
    auto: "min-h-0",
};

export function ProfileBackground({
    backgroundColor,
    backgroundGradient,
    height = "lg",
    className = "",
    children,
}: ProfileBackgroundProps) {
    const backgroundStyle = {
        background: backgroundGradient ?? backgroundColor ?? "transparent",
    };

    return (
        <div
            className={`relative z-0 w-full overflow-hidden rounded-t-xl ${heightClasses[height]} ${className}`}
            style={backgroundStyle}
        >
            {children && (
                <div className="absolute inset-0 z-20 flex items-end overflow-visible px-6 pb-3">
                    {children}
                </div>
            )}
        </div>
    );
}

type AvatarWithFrameProps = {
    avatarUrl?: string;
    avatarFramePreset?: string;
    avatarFrameUrl?: string;
    displayName: string;
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
};

const sizeClasses = {
    sm: { container: 40, avatarPx: 40 },
    md: { container: 64, avatarPx: 64 },
    lg: { container: 80, avatarPx: 80 },
    xl: { container: 112, avatarPx: 112 },
};

export function AvatarWithFrame({
    avatarUrl,
    avatarFramePreset,
    avatarFrameUrl,
    displayName,
    size = "lg",
    className = "",
}: AvatarWithFrameProps) {
    const sizes = sizeClasses[size];
    const [avatarErrored, setAvatarErrored] = useState(false);
    const presetFrame = avatarFramePreset
        ? getPresetFrameById(avatarFramePreset)
        : null;
    const candidateFrameUrl = avatarFrameUrl ?? presetFrame?.imageUrl;
    const trimmedFrameUrl =
        typeof candidateFrameUrl === "string"
            ? candidateFrameUrl.trim()
            : undefined;
    const resolvedFrameUrl =
        trimmedFrameUrl && trimmedFrameUrl.length > 0
            ? trimmedFrameUrl
            : undefined;
    const frameEmoji = getFrameEmoji(avatarFramePreset);

    const frameBorderStyle = presetFrame?.borderStyle || "solid";
    const frameColor = presetFrame?.color || "#6366f1";
    const frameThickness = 3;
    const hasFrameAsset = Boolean(resolvedFrameUrl);
    const configuredInset = presetFrame?.avatarInsetPercent ?? 12;
    const avatarInsetPercent = hasFrameAsset
        ? Math.min(35, Math.max(0, configuredInset))
        : 0;
    const avatarInitial = displayName.trim().charAt(0).toUpperCase() || "?";

    return (
        <div
            className={`relative overflow-visible ${className}`}
            style={{ width: sizes.container, height: sizes.container }}
        >
            {/* Frame image rendered behind the avatar */}
            {resolvedFrameUrl && (
                <Image
                    alt="Avatar frame"
                    className="absolute inset-0 z-10 pointer-events-none"
                    fill
                    sizes={`${sizes.container + 20}px`}
                    src={resolvedFrameUrl}
                    style={{ objectFit: "contain" }}
                    unoptimized
                />
            )}

            {/* Avatar container with inset, layered on top of frame */}
            <div
                className="absolute z-20 flex items-center justify-center overflow-hidden rounded-full bg-muted"
                style={{
                    left: `${avatarInsetPercent}%`,
                    top: `${avatarInsetPercent}%`,
                    width: `${100 - avatarInsetPercent * 2}%`,
                    height: `${100 - avatarInsetPercent * 2}%`,
                    borderColor: hasFrameAsset ? undefined : frameColor,
                    borderStyle: hasFrameAsset ? undefined : frameBorderStyle,
                    borderWidth: hasFrameAsset
                        ? undefined
                        : `${frameThickness}px`,
                }}
            >
                {avatarUrl && !avatarErrored ? (
                    <Image
                        alt={displayName}
                        className="object-cover"
                        fill
                        onError={() => setAvatarErrored(true)}
                        sizes={`${sizes.avatarPx}px`}
                        src={avatarUrl}
                        unoptimized
                    />
                ) : (
                    <span className="text-foreground/70 font-semibold">
                        {avatarInitial}
                    </span>
                )}
            </div>

            {frameEmoji && !hasFrameAsset && (
                <div
                    className="absolute -bottom-1 -right-1 z-30 flex size-5 items-center justify-center rounded-full bg-background text-xs"
                    title={`Frame: ${presetFrame?.name || "Custom"}`}
                >
                    <span aria-hidden="true">{frameEmoji}</span>
                    <span className="sr-only">
                        {`Frame: ${presetFrame?.name || "Custom"}`}
                    </span>
                </div>
            )}
        </div>
    );
}

const FRAME_EMOJI_LOOKUP = [
    ["star", "⭐"],
    ["diamond", "💎"],
    ["square", "⬜"],
    ["round", "⚪"],
    ["spring", "🌸"],
    ["summer", "☀️"],
    ["fall", "🍂"],
    ["winter", "❄️"],
] as const;

function getFrameEmoji(framePreset?: string): string | null {
    if (!framePreset) {
        return null;
    }
    const normalizedPreset = framePreset.toLowerCase();

    for (const [presetKey, emoji] of FRAME_EMOJI_LOOKUP) {
        if (normalizedPreset.includes(presetKey)) {
            return emoji;
        }
    }

    return "✨";
}
