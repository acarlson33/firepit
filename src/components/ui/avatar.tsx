"use client";
import Image from "next/image";
import { useState } from "react";

type AvatarProps = {
	src?: string | null;
	alt: string;
	fallback?: string;
	size?: "sm" | "md" | "lg";
};

export function Avatar({ src, alt, fallback, size = "md" }: AvatarProps) {
	const [imageError, setImageError] = useState(false);
	const sizeClasses = {
		sm: "h-6 w-6 text-xs",
		md: "h-8 w-8 text-sm",
		lg: "h-12 w-12 text-base",
	};

	const containerClass = `relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${sizeClasses[size]}`;

	// Only show image if src is a valid, non-empty string and hasn't errored
	if (src && src.trim() !== "" && !imageError) {
		return (
			<div className={containerClass}>
				<Image
					alt={alt}
					className="h-full w-full object-cover"
					height={size === "sm" ? 24 : size === "md" ? 32 : 48}
					src={src}
					width={size === "sm" ? 24 : size === "md" ? 32 : 48}
					onError={() => setImageError(true)}
				/>
			</div>
		);
	}

	// Fallback to initials or first letter
	const initials = fallback
		? fallback
				.split(" ")
				.slice(0, 2)
				.map((n) => n[0])
				.join("")
				.toUpperCase()
		: alt[0].toUpperCase();

	return (
		<div className={containerClass}>
			<span className="font-medium text-muted-foreground">{initials}</span>
		</div>
	);
}
