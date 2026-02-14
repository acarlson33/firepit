"use client";

import { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { Smile, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { CustomEmoji } from "@/lib/types";
import { toast } from "sonner";

// Dynamically import emoji picker to reduce initial bundle size
const Picker = dynamic(
    () => import("emoji-picker-react").then((mod) => mod.default),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="size-6 animate-spin" />
            </div>
        ),
    },
);

type EmojiPickerProps = {
    onEmojiSelect: (emoji: string) => void;
    customEmojis?: CustomEmoji[];
    onUploadCustomEmoji?: (file: File, name: string) => Promise<void>;
};

export function EmojiPicker({
    onEmojiSelect,
    customEmojis = [],
    onUploadCustomEmoji,
}: EmojiPickerProps) {
    const [open, setOpen] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [emojiName, setEmojiName] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Close picker when clicking outside
    useEffect(() => {
        if (!open) {
            setShowUpload(false);
            setEmojiName("");
            setSelectedFile(null);
        }
    }, [open]);

    const handleEmojiClick = (emojiData: { emoji: string }) => {
        onEmojiSelect(emojiData.emoji);
        setOpen(false);
    };

    const handleCustomEmojiClick = (emoji: CustomEmoji) => {
        // Use custom syntax for custom emojis
        onEmojiSelect(`:${emoji.name}:`);
        setOpen(false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        // Validate file type
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            return;
        }

        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Image must be less than 10MB");
            return;
        }

        setSelectedFile(file);
    };

    const handleUpload = async () => {
        if (!selectedFile || !emojiName.trim() || !onUploadCustomEmoji) {
            return;
        }

        // Validate name
        if (!/^[a-zA-Z0-9_-]+$/.test(emojiName)) {
            toast.error(
                "Emoji name can only contain letters, numbers, hyphens, and underscores",
            );
            return;
        }

        try {
            setUploading(true);
            await onUploadCustomEmoji(selectedFile, emojiName.trim());
            setShowUpload(false);
            setEmojiName("");
            setSelectedFile(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        } catch (error) {
            console.error("Failed to upload emoji:", error);
            toast.error("Failed to upload emoji. Please try again.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setOpen(true)}
                aria-label="Insert emoji"
                title="Insert emoji"
            >
                <Smile className="size-5" />
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Select Emoji</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Custom emojis section */}
                        {(customEmojis.length > 0 || onUploadCustomEmoji) && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold">
                                        Custom Emojis
                                    </h3>
                                    {onUploadCustomEmoji && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                setShowUpload(!showUpload)
                                            }
                                        >
                                            {showUpload ? (
                                                <>
                                                    <X className="mr-1 size-4" />
                                                    Cancel
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="mr-1 size-4" />
                                                    Add
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>

                                {/* Upload form */}
                                {showUpload && onUploadCustomEmoji && (
                                    <div className="space-y-2 rounded-lg border border-border/60 bg-background/70 p-3">
                                        <Input
                                            type="text"
                                            placeholder="Emoji name (e.g., party-parrot)"
                                            value={emojiName}
                                            onChange={(e) =>
                                                setEmojiName(e.target.value)
                                            }
                                            disabled={uploading}
                                        />
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileSelect}
                                            disabled={uploading}
                                            className="w-full text-sm"
                                        />
                                        {selectedFile && (
                                            <p className="text-xs text-muted-foreground">
                                                Selected: {selectedFile.name}
                                            </p>
                                        )}
                                        <Button
                                            type="button"
                                            onClick={handleUpload}
                                            disabled={
                                                !selectedFile ||
                                                !emojiName.trim() ||
                                                uploading
                                            }
                                            className="w-full"
                                            size="sm"
                                        >
                                            {uploading ? (
                                                <>
                                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                                    Uploading...
                                                </>
                                            ) : (
                                                "Upload"
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* Custom emoji grid */}
                                {customEmojis.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {customEmojis.map((emoji) => (
                                            <button
                                                key={emoji.fileId}
                                                type="button"
                                                onClick={() =>
                                                    handleCustomEmojiClick(
                                                        emoji,
                                                    )
                                                }
                                                className="flex size-12 items-center justify-center rounded hover:bg-accent"
                                                title={`:${emoji.name}:`}
                                            >
                                                <img
                                                    src={emoji.url}
                                                    alt={emoji.name}
                                                    className="size-6 object-contain"
                                                    crossOrigin="anonymous"
                                                />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Standard emoji picker */}
                        <div>
                            <h3 className="mb-2 text-sm font-semibold">
                                Standard Emojis
                            </h3>
                            <Picker
                                onEmojiClick={handleEmojiClick}
                                width="100%"
                                height="350px"
                                searchPlaceHolder="Search emoji..."
                                previewConfig={{ showPreview: false }}
                            />
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
