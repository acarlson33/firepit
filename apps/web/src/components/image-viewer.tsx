"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

type ImageViewerProps = {
	src: string;
	alt: string;
	onClose: () => void;
};

export function ImageViewer({ src, alt, onClose }: ImageViewerProps) {
	// Close on Escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("keydown", handleEscape);
		};
	}, [onClose]);

	// Prevent body scroll when modal is open
	useEffect(() => {
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = "unset";
		};
	}, []);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
			onClick={onClose}
		>
			<Button
				className="absolute right-4 top-4 z-10"
				onClick={onClose}
				size="icon"
				variant="ghost"
			>
				<X className="size-6 text-white" />
			</Button>

			<div
				className="relative max-h-[90vh] max-w-[90vw]"
				onClick={(e) => {
					e.stopPropagation();
				}}
			>
				<img
					alt={alt}
					className="max-h-[90vh] max-w-[90vw] object-contain"
					src={src}
				/>
			</div>
		</div>
	);
}
