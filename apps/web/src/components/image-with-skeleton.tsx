"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type ImageWithSkeletonProps = {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  role?: string;
  tabIndex?: number;
};

export function ImageWithSkeleton({
  src,
  alt,
  className,
  onClick,
  onKeyDown,
  role,
  tabIndex,
}: ImageWithSkeletonProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className="relative">
      {loading && (
        <Skeleton className="absolute inset-0 h-full w-full rounded-lg" />
      )}
      {error ? (
        <div className="flex h-48 items-center justify-center rounded-lg bg-muted text-muted-foreground text-sm">
          Failed to load image
        </div>
      ) : (
        <img
          alt={alt}
          className={className}
          loading="lazy"
          decoding="async"
          onClick={onClick}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          onKeyDown={onKeyDown}
          onLoad={() => {
            setLoading(false);
          }}
          role={role}
          src={src}
          style={{ display: loading ? "none" : "block" }}
          tabIndex={tabIndex}
        />
      )}
    </div>
  );
}
