"use client";
import { useCallback, useState, useRef, useEffect } from "react";
import { Upload } from "lucide-react";

type FileDropZoneProps = {
	onFileDrop: (file: File) => void;
	children: React.ReactNode;
	disabled?: boolean;
	accept?: string;
};

export function FileDropZone({ onFileDrop, children, disabled, accept }: FileDropZoneProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [_dragCounter, setDragCounter] = useState(0);
	const dropZoneRef = useRef<HTMLDivElement>(null);

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (disabled) {
				return;
			}

			setDragCounter((prev) => prev + 1);
			if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
				setIsDragging(true);
			}
		},
		[disabled]
	);

	const handleDragLeave = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (disabled) {
				return;
			}

			setDragCounter((prev) => {
				const newCount = prev - 1;
				if (newCount === 0) {
					setIsDragging(false);
				}
				return newCount;
			});
		},
		[disabled]
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (disabled) {
				return;
			}
		},
		[disabled]
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			if (disabled) {
				return;
			}

			setIsDragging(false);
			setDragCounter(0);

			const files = e.dataTransfer.files;
			if (files && files.length > 0) {
				const file = files[0]; // Only handle first file

				// Check file type if accept is specified
				if (accept) {
					const acceptedTypes = accept.split(",").map((t) => t.trim());
					const fileExtension = `.${file.name.split(".").pop()}`;
					const isAccepted =
						acceptedTypes.includes(file.type) ||
						acceptedTypes.includes(fileExtension) ||
						acceptedTypes.includes("*/*");

					if (!isAccepted) {
						if (process.env.NODE_ENV === "development") {
							console.warn("File type not accepted:", file.type);
						}
						return;
					}
				}

				onFileDrop(file);
			}
		},
		[disabled, accept, onFileDrop]
	);

	// Prevent default drag behavior on the window
	useEffect(() => {
		const preventDefaults = (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};

		window.addEventListener("dragover", preventDefaults);
		window.addEventListener("drop", preventDefaults);

		return () => {
			window.removeEventListener("dragover", preventDefaults);
			window.removeEventListener("drop", preventDefaults);
		};
	}, []);

	return (
		<div
			ref={dropZoneRef}
			className="relative"
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			{children}
			{isDragging && !disabled && (
				<div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
					<div className="flex flex-col items-center gap-2 text-primary">
						<Upload className="size-12" />
						<p className="text-lg font-semibold">Drop file to upload</p>
					</div>
				</div>
			)}
		</div>
	);
}
