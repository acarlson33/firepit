"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Palette, Upload, Check, Clock } from "lucide-react";
import { PRESET_GRADIENTS, PRESET_COLORS } from "@/lib/preset-gradients";
import { type PresetFrame } from "@/lib/preset-frames";
import Image from "next/image";

type ProfileAppearanceSettingsProps = {
    profileBackgroundColor?: string;
    profileBackgroundGradient?: string;
    profileBackgroundImageFileId?: string;
    profileBackgroundImageUrl?: string;
    avatarFramePreset?: string;
    currentAvatarUrl?: string;
    accountCreatedAt?: string;
    updateBackgroundAction: (
        formData: FormData,
    ) => Promise<{ success: boolean }>;
    uploadBackgroundAction: (
        formData: FormData,
    ) => Promise<{ success: boolean }>;
    removeBackgroundAction: () => Promise<{ success: boolean }>;
    getBackgroundCooldown: () => Promise<{
        canChange: boolean;
        remainingMs: number;
        remainingHours?: number;
    }>;
    setFramePresetAction: (frameId: string) => Promise<{ success: boolean }>;
    getAvailableFrames: () => Promise<{
        frames: PresetFrame[];
        currentPreset?: string;
    }>;
};

export function ProfileAppearanceSettings({
    profileBackgroundColor,
    profileBackgroundGradient,
    profileBackgroundImageFileId,
    profileBackgroundImageUrl,
    avatarFramePreset,
    currentAvatarUrl,
    accountCreatedAt = "2020-01-01T00:00:00.000Z",
    updateBackgroundAction,
    uploadBackgroundAction,
    removeBackgroundAction,
    getBackgroundCooldown,
    setFramePresetAction,
    getAvailableFrames,
}: ProfileAppearanceSettingsProps) {
    const [selectedBackgroundType, setSelectedBackgroundType] = useState<
        "none" | "color" | "gradient" | "image"
    >(
        profileBackgroundImageFileId
            ? "image"
            : profileBackgroundGradient
              ? "gradient"
              : profileBackgroundColor
                ? "color"
                : "none",
    );
    const [selectedColor, setSelectedColor] = useState(
        profileBackgroundColor || "",
    );
    const [selectedGradient, setSelectedGradient] = useState(
        profileBackgroundGradient || "",
    );
    const [uploadingBackground, setUploadingBackground] = useState(false);
    const [cooldown, setCooldown] = useState<{
        canChange: boolean;
        remainingMs: number;
        remainingHours?: number;
    } | null>(null);
    const [availableFrames, setAvailableFrames] = useState<PresetFrame[]>([]);
    const [framesLoaded, setFramesLoaded] = useState(false);
    const [avatarPreviewErrored, setAvatarPreviewErrored] = useState(false);
    const colorInputRef = useRef<HTMLInputElement>(null);
    const backgroundImageInputRef = useRef<HTMLInputElement>(null);

    const loadFrames = useCallback(async () => {
        if (framesLoaded) {
            return;
        }
        try {
            const result = await getAvailableFrames();
            setAvailableFrames(result.frames);
            setFramesLoaded(true);
        } catch {
            setAvailableFrames([]);
        }
    }, [framesLoaded, getAvailableFrames]);

    useEffect(() => {
        void loadFrames();
    }, [loadFrames]);

    async function loadCooldown() {
        try {
            const result = await getBackgroundCooldown();
            setCooldown(result);
        } catch {
            setCooldown({ canChange: true, remainingMs: 0 });
        }
    }

    function getBackgroundStyle() {
        if (selectedBackgroundType === "color" && selectedColor) {
            return { background: selectedColor };
        }
        if (selectedBackgroundType === "gradient" && selectedGradient) {
            return { background: selectedGradient };
        }
        if (selectedBackgroundType === "image" && profileBackgroundImageUrl) {
            return {
                backgroundImage: `url(${profileBackgroundImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            };
        }
        return { background: "#1a1a2e" };
    }

    async function handleColorSelect(color: string) {
        setSelectedColor(color);
        setSelectedBackgroundType("color");
        try {
            const formData = new FormData();
            formData.append("backgroundColor", color);
            formData.append("backgroundGradient", "");
            await updateBackgroundAction(formData);
            toast.success("Background color updated!");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update background",
            );
        }
    }

    async function handleGradientSelect(
        gradient: (typeof PRESET_GRADIENTS)[number],
    ) {
        setSelectedGradient(gradient.cssValue);
        setSelectedBackgroundType("gradient");
        try {
            const formData = new FormData();
            formData.append("backgroundColor", "");
            formData.append("backgroundGradient", gradient.cssValue);
            await updateBackgroundAction(formData);
            toast.success("Background gradient updated!");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update background",
            );
        }
    }

    async function handleClearBackground() {
        setSelectedBackgroundType("none");
        setSelectedColor("");
        setSelectedGradient("");
        try {
            await removeBackgroundAction();
            toast.success("Background cleared!");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to clear background",
            );
        }
    }

    async function handleBackgroundImageUpload(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        if (cooldown && !cooldown.canChange) {
            toast.error(
                `You can change your background again in ${cooldown?.remainingHours} hour(s).`,
            );
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File size must be less than 5MB");
            return;
        }

        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            toast.error(
                "Invalid file type. Only JPEG, PNG, and WebP are allowed",
            );
            return;
        }

        setUploadingBackground(true);
        try {
            const formData = new FormData();
            formData.append("background", file);
            await uploadBackgroundAction(formData);
            setSelectedBackgroundType("image");
            toast.success("Background image uploaded!");
            await loadCooldown();
            window.location.reload();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to upload background",
            );
        } finally {
            setUploadingBackground(false);
        }
    }

    async function handleFrameSelect(frameId: string) {
        try {
            if (avatarFramePreset === frameId) {
                await setFramePresetAction("");
            } else {
                await setFramePresetAction(frameId);
            }
            toast.success("Avatar frame updated!");
            window.location.reload();
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Failed to update frame",
            );
        }
    }

    return (
        <div className="space-y-8">
            <div>
                <h3 className="mb-4 text-lg font-semibold">
                    Profile Background
                </h3>
                <div className="space-y-4">
                    <div
                        className="relative h-32 w-full overflow-hidden rounded-xl border border-border"
                        style={getBackgroundStyle()}
                    >
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-2">
                                {currentAvatarUrl && !avatarPreviewErrored ? (
                                    <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-white/50 bg-muted">
                                        <Image
                                            alt="Your avatar"
                                            className="object-cover"
                                            fill
                                            onError={() =>
                                                setAvatarPreviewErrored(true)
                                            }
                                            sizes="64px"
                                            src={currentAvatarUrl}
                                            unoptimized
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/50 bg-muted">
                                        <span className="text-2xl">?</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="absolute bottom-2 right-2">
                            <Button
                                className="h-6 px-2 text-xs"
                                onClick={async () => {
                                    await handleClearBackground();
                                }}
                                size="sm"
                                type="button"
                                variant="secondary"
                            >
                                Clear
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                                Solid Colors
                            </Label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_COLORS.map((color) => (
                                <button
                                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                                        selectedBackgroundType === "color" &&
                                        selectedColor === color
                                            ? "border-primary ring-2 ring-primary ring-offset-2"
                                            : "border-border"
                                    }`}
                                    key={color}
                                    onClick={() =>
                                        void handleColorSelect(color)
                                    }
                                    style={{ backgroundColor: color }}
                                    title={color}
                                    type="button"
                                />
                            ))}
                            <input
                                className="hidden"
                                onChange={(e) => {
                                    const color = e.target.value;
                                    if (color) {
                                        void handleColorSelect(color);
                                    }
                                }}
                                ref={colorInputRef}
                                type="color"
                            />
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted/50 hover:border-primary"
                                onClick={() => colorInputRef.current?.click()}
                                title="Custom color"
                                type="button"
                            >
                                <Palette className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Gradients</Label>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {PRESET_GRADIENTS.map((gradient) => (
                                <button
                                    className={`h-10 w-full rounded-lg border-2 transition-transform hover:scale-105 ${
                                        selectedBackgroundType === "gradient" &&
                                        selectedGradient === gradient.cssValue
                                            ? "border-primary ring-2 ring-primary ring-offset-2"
                                            : "border-border"
                                    }`}
                                    key={gradient.id}
                                    onClick={() =>
                                        void handleGradientSelect(gradient)
                                    }
                                    style={{ background: gradient.cssValue }}
                                    title={gradient.name}
                                    type="button"
                                />
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">
                                Custom Image
                            </Label>
                            {cooldown && !cooldown.canChange && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    Available in {cooldown.remainingHours}h
                                </span>
                            )}
                        </div>
                        <input
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                void handleBackgroundImageUpload(e);
                            }}
                            ref={backgroundImageInputRef}
                            type="file"
                        />
                        <Button
                            className="w-full"
                            disabled={
                                uploadingBackground ||
                                Boolean(cooldown && !cooldown.canChange)
                            }
                            onClick={() => {
                                backgroundImageInputRef.current?.click();
                            }}
                            type="button"
                            variant="outline"
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            {uploadingBackground
                                ? "Uploading..."
                                : cooldown && !cooldown.canChange
                                  ? `Available in ${cooldown.remainingHours}h`
                                  : "Upload Image"}
                        </Button>
                        <p className="text-muted-foreground text-xs">
                            JPG, PNG, or WebP. Max 5MB. You can change once
                            every 12 hours.
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-t pt-8">
                <h3 className="mb-4 text-lg font-semibold">Avatar Frames</h3>

                <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
                        {availableFrames.map((frame) => {
                            const isSelected = avatarFramePreset === frame.id;
                            return (
                                <button
                                    className={`group relative flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
                                        isSelected
                                            ? "border-primary bg-primary/10"
                                            : "border-border hover:border-primary/50"
                                    }`}
                                    key={frame.id}
                                    onClick={() =>
                                        void handleFrameSelect(frame.id)
                                    }
                                    title={frame.name}
                                    type="button"
                                >
                                    <div
                                        className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"
                                        style={{
                                            borderColor: frame.color,
                                            borderStyle:
                                                frame.borderStyle || "solid",
                                            borderWidth: "2px",
                                        }}
                                    >
                                        {frame.imageUrl ? (
                                            <div
                                                className="h-8 w-8 bg-center bg-contain bg-no-repeat"
                                                style={{
                                                    backgroundImage: `url(${frame.imageUrl})`,
                                                }}
                                            />
                                        ) : (
                                            <span className="text-lg">
                                                {frame.emoji || "⚪"}
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-muted-foreground truncate text-[10px]">
                                        {frame.name}
                                    </span>
                                    {isSelected && (
                                        <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                                            <Check className="h-3 w-3 text-primary-foreground" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Label({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <span className={`text-sm font-medium ${className || ""}`}>
            {children}
        </span>
    );
}
