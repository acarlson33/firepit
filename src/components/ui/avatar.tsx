"use client";
import Image from "next/image";
import { useState } from "react";
import { getPresetFrameById } from "@/lib/preset-frames";

type AvatarProps = {
    src?: string | null;
    alt: string;
    fallback?: string;
    size?: "sm" | "md" | "lg";
    framePreset?: string;
    frameUrl?: string;
};

export function Avatar({
    src,
    alt,
    fallback,
    size = "md",
    framePreset,
    frameUrl,
}: AvatarProps) {
    const [imageError, setImageError] = useState(false);
    const sizeClasses = {
        sm: "h-6 w-6 text-xs",
        md: "h-8 w-8 text-sm",
        lg: "h-12 w-12 text-base",
    };
    const sizePx = {
        sm: 24,
        md: 32,
        lg: 48,
    };

    const presetFrame = framePreset ? getPresetFrameById(framePreset) : null;
    const resolvedFrameUrl = frameUrl ?? presetFrame?.imageUrl;
    const hasFrameAsset = Boolean(resolvedFrameUrl);
    const configuredInset = presetFrame?.avatarInsetPercent ?? 12;
    const avatarInsetPercent = hasFrameAsset
        ? Math.min(35, Math.max(0, configuredInset))
        : 0;
    const avatarInsetPx = Math.round((sizePx[size] * avatarInsetPercent) / 100);

    const containerClass = `relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${sizeClasses[size]}`;

    // Fallback to initials or first letter
    const initials = fallback
        ? fallback
              .split(" ")
              .slice(0, 2)
              .map((n) => n[0])
              .join("")
              .toUpperCase()
        : alt[0].toUpperCase();

    const avatarContent =
        src && src.trim() !== "" && !imageError ? (
            <Image
                alt={alt}
                className="h-full w-full object-cover"
                height={sizePx[size]}
                loading="lazy"
                placeholder="blur"
                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
                src={src}
                width={sizePx[size]}
                onError={() => setImageError(true)}
            />
        ) : (
            <span className="font-medium text-muted-foreground">
                {initials}
            </span>
        );

    if (hasFrameAsset) {
        return (
            <div
                className="relative inline-flex shrink-0 overflow-visible"
                style={{ height: sizePx[size], width: sizePx[size] }}
            >
                <Image
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    fill
                    sizes={`${sizePx[size]}px`}
                    src={resolvedFrameUrl as string}
                    unoptimized
                />
                <div
                    className="absolute flex items-center justify-center overflow-hidden rounded-full bg-muted"
                    style={{
                        left: avatarInsetPx,
                        top: avatarInsetPx,
                        width: sizePx[size] - avatarInsetPx * 2,
                        height: sizePx[size] - avatarInsetPx * 2,
                    }}
                >
                    {avatarContent}
                </div>
            </div>
        );
    }

    return <div className={containerClass}>{avatarContent}</div>;
}
