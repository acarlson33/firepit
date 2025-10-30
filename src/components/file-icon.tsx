"use client";
import {
	FileText,
	FileImage,
	FileVideo,
	FileAudio,
	FileArchive,
	FileCode,
	File,
	type LucideIcon,
} from "lucide-react";

type FileIconProps = {
	fileType: string;
	className?: string;
};

export function FileIcon({ fileType, className = "size-6" }: FileIconProps) {
	const IconComponent = getFileIcon(fileType);
	return <IconComponent className={className} />;
}

function getFileIcon(mimeType: string): LucideIcon {
	// Documents
	if (
		mimeType.includes("pdf") ||
		mimeType.includes("word") ||
		mimeType.includes("document") ||
		mimeType.includes("text/plain") ||
		mimeType.includes("excel") ||
		mimeType.includes("spreadsheet") ||
		mimeType.includes("powerpoint") ||
		mimeType.includes("presentation") ||
		mimeType.includes("csv")
	) {
		return FileText;
	}

	// Images
	if (mimeType.startsWith("image/")) {
		return FileImage;
	}

	// Videos
	if (mimeType.startsWith("video/")) {
		return FileVideo;
	}

	// Audio
	if (mimeType.startsWith("audio/")) {
		return FileAudio;
	}

	// Archives
	if (
		mimeType.includes("zip") ||
		mimeType.includes("rar") ||
		mimeType.includes("7z") ||
		mimeType.includes("tar") ||
		mimeType.includes("gzip")
	) {
		return FileArchive;
	}

	// Code files
	if (
		mimeType.includes("javascript") ||
		mimeType.includes("typescript") ||
		mimeType.includes("python") ||
		mimeType.includes("json") ||
		mimeType.includes("html") ||
		mimeType.includes("css") ||
		mimeType.includes("xml") ||
		mimeType.includes("yaml") ||
		mimeType.includes("markdown")
	) {
		return FileCode;
	}

	// Default
	return File;
}

export function getFileCategory(mimeType: string): string {
	if (
		mimeType.includes("pdf") ||
		mimeType.includes("word") ||
		mimeType.includes("document") ||
		mimeType.includes("text/plain") ||
		mimeType.includes("excel") ||
		mimeType.includes("spreadsheet") ||
		mimeType.includes("powerpoint") ||
		mimeType.includes("presentation") ||
		mimeType.includes("csv")
	) {
		return "document";
	}

	if (mimeType.startsWith("image/")) {
		return "image";
	}

	if (mimeType.startsWith("video/")) {
		return "video";
	}

	if (mimeType.startsWith("audio/")) {
		return "audio";
	}

	if (
		mimeType.includes("zip") ||
		mimeType.includes("rar") ||
		mimeType.includes("7z") ||
		mimeType.includes("tar") ||
		mimeType.includes("gzip")
	) {
		return "archive";
	}

	if (
		mimeType.includes("javascript") ||
		mimeType.includes("typescript") ||
		mimeType.includes("python") ||
		mimeType.includes("json") ||
		mimeType.includes("html") ||
		mimeType.includes("css") ||
		mimeType.includes("xml") ||
		mimeType.includes("yaml") ||
		mimeType.includes("markdown")
	) {
		return "code";
	}

	return "file";
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}

	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
