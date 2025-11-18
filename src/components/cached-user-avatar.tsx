"use cache";

import Image from "next/image";
import { getCachedAvatarUrl } from "@/lib/cached-data";

/**
 * Cached server component for rendering user avatars
 * The avatar URL generation is cached for better performance
 */
export async function CachedUserAvatar({
	fileId,
	displayName,
	size = 128,
	className = "",
}: {
	fileId: string;
	displayName: string;
	size?: number;
	className?: string;
}) {
	const avatarUrl = await getCachedAvatarUrl(fileId);

	return (
		<div
			className={`relative overflow-hidden rounded-full border-2 border-border bg-muted ${className}`}
			style={{ width: size, height: size }}
		>
			<Image
				alt={`${displayName}'s avatar`}
				className="object-cover"
				fill
				priority
				sizes={`${size}px`}
				src={avatarUrl}
			/>
		</div>
	);
}
