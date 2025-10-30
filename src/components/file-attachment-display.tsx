"use client";
import { Download } from "lucide-react";
import { FileIcon, formatFileSize, getFileCategory } from "./file-icon";
import type { FileAttachment } from "@/lib/types";

type FileAttachmentDisplayProps = {
	attachment: FileAttachment;
};

export function FileAttachmentDisplay({ attachment }: FileAttachmentDisplayProps) {
	const category = getFileCategory(attachment.fileType);
	const isImage = category === "image";
	const isVideo = category === "video";
	const isAudio = category === "audio";

	// For images, display inline
	if (isImage) {
		return (
			<div className="mt-2 max-w-md">
				<a href={attachment.fileUrl} target="_blank" rel="noopener noreferrer">
					<img
						alt={attachment.fileName}
						className="rounded-lg border"
						loading="lazy"
						src={attachment.fileUrl}
					/>
				</a>
				<div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
					<span>{attachment.fileName}</span>
					<span>{formatFileSize(attachment.fileSize)}</span>
				</div>
			</div>
		);
	}

	// For videos, display inline player
	if (isVideo) {
		return (
			<div className="mt-2 max-w-md">
				<video
					className="rounded-lg border"
					controls
					preload="metadata"
					src={attachment.fileUrl}
				>
					<track kind="captions" />
					Your browser does not support the video tag.
				</video>
				<div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
					<span>{attachment.fileName}</span>
					<span>{formatFileSize(attachment.fileSize)}</span>
				</div>
			</div>
		);
	}

	// For audio, display inline player
	if (isAudio) {
		return (
			<div className="mt-2">
				<div className="flex items-center gap-2 rounded-lg border p-3">
					<FileIcon className="size-8 text-muted-foreground" fileType={attachment.fileType} />
					<div className="flex-1">
						<div className="text-sm font-medium">{attachment.fileName}</div>
						<audio className="mt-1 w-full" controls preload="metadata" src={attachment.fileUrl}>
							<track kind="captions" />
							Your browser does not support the audio tag.
						</audio>
						<div className="mt-1 text-xs text-muted-foreground">
							{formatFileSize(attachment.fileSize)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	// For other files, display download card
	return (
		<div className="mt-2">
			<a
				className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
				download={attachment.fileName}
				href={attachment.fileUrl}
				rel="noopener noreferrer"
				target="_blank"
			>
				<FileIcon className="size-8 text-muted-foreground" fileType={attachment.fileType} />
				<div className="flex-1 min-w-0">
					<div className="truncate text-sm font-medium">{attachment.fileName}</div>
					<div className="text-xs text-muted-foreground">{formatFileSize(attachment.fileSize)}</div>
				</div>
				<Download className="size-5 text-muted-foreground" />
			</a>
		</div>
	);
}
