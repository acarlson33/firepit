"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AvatarUploadProps = {
	currentAvatarUrl: string | null;
	uploadAvatarAction: (formData: FormData) => Promise<{
		success: boolean;
		fileId?: string;
	}>;
	removeAvatarAction: () => Promise<{ success: boolean }>;
};

export function AvatarUpload({
	currentAvatarUrl,
	uploadAvatarAction,
	removeAvatarAction,
}: AvatarUploadProps) {
	const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
	const [uploading, setUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		// Validate file size
		if (file.size > 2 * 1024 * 1024) {
			toast.error("File size must be less than 2MB");
			return;
		}

		// Validate file type
		const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			toast.error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed");
			return;
		}

		setUploading(true);

		try {
			const formData = new FormData();
			formData.append("avatar", file);

			const result = await uploadAvatarAction(formData);

			if (result.success) {
				toast.success("Avatar uploaded successfully!");
				// Refresh the page to show the new avatar
				window.location.reload();
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to upload avatar",
			);
		} finally {
			setUploading(false);
		}
	}

	async function handleRemove() {
		if (!avatarUrl) {
			return;
		}

		setUploading(true);

		try {
			const result = await removeAvatarAction();

			if (result.success) {
				setAvatarUrl(null);
				toast.success("Avatar removed successfully!");
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove avatar",
			);
		} finally {
			setUploading(false);
		}
	}

	function handleUploadClick() {
		fileInputRef.current?.click();
	}

	return (
		<div className="flex items-center gap-6">
			<div className="relative size-24 overflow-hidden rounded-full border-2 border-border bg-muted">
				{avatarUrl ? (
					<Image
						alt="Profile picture"
						className="object-cover"
						fill
						sizes="96px"
						src={avatarUrl}
					/>
				) : (
					<div className="flex size-full items-center justify-center text-3xl font-semibold text-muted-foreground">
						{currentAvatarUrl ? "?" : "?"}
					</div>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<input
					accept="image/jpeg,image/png,image/gif,image/webp"
					className="hidden"
					onChange={handleFileChange}
					ref={fileInputRef}
					type="file"
				/>
				<Button
					disabled={uploading}
					onClick={handleUploadClick}
					size="sm"
					type="button"
					variant="outline"
				>
					{uploading ? "Uploading..." : "Upload Image"}
				</Button>
				{avatarUrl && (
					<Button
						disabled={uploading}
						onClick={handleRemove}
						size="sm"
						type="button"
						variant="ghost"
					>
						Remove
					</Button>
				)}
				<p className="text-muted-foreground text-xs">
					JPG, PNG, GIF or WebP. Max 2MB.
				</p>
			</div>
		</div>
	);
}
