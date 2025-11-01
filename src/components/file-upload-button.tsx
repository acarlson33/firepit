"use client";
import { useCallback, useRef, useState } from "react";
import { Paperclip, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileIcon, formatFileSize, getFileCategory } from "./file-icon";
import type { FileAttachment } from "@/lib/types";

type FileUploadButtonProps = {
	onFileSelect: (attachment: FileAttachment) => void;
	disabled?: boolean;
	className?: string;
};

export function FileUploadButton({ onFileSelect, disabled, className }: FileUploadButtonProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState<string | null>(null);

	const handleFileChange = useCallback(
		async (file: File | null) => {
			if (!file) {
				return;
			}

			try {
				setUploading(true);
				setUploadProgress(`Uploading ${file.name}...`);

				const formData = new FormData();
				formData.append("file", file);

				const response = await fetch("/api/upload-file", {
					method: "POST",
					body: formData,
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || "Upload failed");
				}

				const result = await response.json();

				const attachment: FileAttachment = {
					fileId: result.fileId,
					fileName: result.fileName,
					fileSize: result.fileSize,
					fileType: result.fileType,
					fileUrl: result.fileUrl,
				};

				onFileSelect(attachment);
				setUploadProgress(null);

				// Reset input
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			} catch (error) {
				console.error("File upload failed:", error);
				alert(error instanceof Error ? error.message : "Failed to upload file");
				setUploadProgress(null);
			} finally {
				setUploading(false);
			}
		},
		[onFileSelect]
	);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0] || null;
			void handleFileChange(file);
		},
		[handleFileChange]
	);

	const handleButtonClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	return (
		<div className="relative">
			<input
				ref={fileInputRef}
				accept="*/*"
				className="hidden"
				disabled={disabled || uploading}
				onChange={handleInputChange}
				type="file"
			/>
			<Button
				aria-label="Attach file"
				className={className}
				disabled={disabled || uploading}
				onClick={handleButtonClick}
				size="icon"
				title="Attach file"
				type="button"
				variant="ghost"
			>
				{uploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
			</Button>
			{uploadProgress && (
				<div className="absolute bottom-full left-0 mb-2 rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
					{uploadProgress}
				</div>
			)}
		</div>
	);
}

type FilePreviewProps = {
	attachment: FileAttachment;
	onRemove: () => void;
};

export function FilePreview({ attachment, onRemove }: FilePreviewProps) {
	const category = getFileCategory(attachment.fileType);

	return (
		<div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
			<FileIcon className="size-6 shrink-0 text-muted-foreground" fileType={attachment.fileType} />
			<div className="flex-1 min-w-0">
				<div className="truncate text-sm font-medium">{attachment.fileName}</div>
				<div className="text-xs text-muted-foreground">
					{formatFileSize(attachment.fileSize)} • {category}
				</div>
			</div>
			<Button
				aria-label="Remove file"
				className="size-6 shrink-0"
				onClick={onRemove}
				size="icon"
				title="Remove file"
				type="button"
				variant="ghost"
			>
				<X className="size-4" />
			</Button>
		</div>
	);
}
