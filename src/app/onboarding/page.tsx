"use client";

import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, ChevronLeft, ChevronRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { completeOnboardingAction } from "./actions";
import {
    DIRECT_MESSAGE_PRIVACY_VALUES,
    NOTIFICATION_LEVEL_VALUES,
    type NotificationLevel,
    type DirectMessagePrivacy,
} from "@/lib/types";

type Step = "profile" | "notifications" | "telemetry";

const STEPS: Step[] = ["profile", "notifications", "telemetry"];

function isNotificationLevel(value: string): value is NotificationLevel {
    return (NOTIFICATION_LEVEL_VALUES as readonly string[]).includes(value);
}

function isDirectMessagePrivacy(value: string): value is DirectMessagePrivacy {
    return (DIRECT_MESSAGE_PRIVACY_VALUES as readonly string[]).includes(value);
}

function parseNotificationLevel(value: string): NotificationLevel {
    if (isNotificationLevel(value)) {
        return value;
    }

    return "all";
}

function parseDirectMessagePrivacy(value: string): DirectMessagePrivacy {
    if (isDirectMessagePrivacy(value)) {
        return value;
    }

    return "everyone";
}

export default function OnboardingPage() {
    const router = useRouter();
    const { userData, refreshUser } = useAuth();
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [loading, setLoading] = useState(false);

    const currentStep = STEPS[currentStepIndex];
    const isFirstStep = currentStepIndex === 0;
    const isLastStep = currentStepIndex === STEPS.length - 1;

    function getPrimaryButtonLabel() {
        if (loading) {
            return "Setting up...";
        }

        if (isLastStep) {
            return "Complete Setup";
        }

        return "Continue";
    }

    // Step 1: Profile
    const [displayName, setDisplayName] = useState("");
    const [pronouns, setPronouns] = useState("");
    const [bio, setBio] = useState("");

    // Step 2: Notifications
    const [notificationLevel, setNotificationLevel] =
        useState<NotificationLevel>("all");
    const [directMessagePrivacy, setDirectMessagePrivacy] =
        useState<DirectMessagePrivacy>("everyone");
    const [notificationSound, setNotificationSound] = useState(true);

    // Step 3: Telemetry
    const [telemetryEnabled, setTelemetryEnabled] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (currentStep === "profile" && !displayName.trim()) {
            toast.error("Please enter a display name");
            return;
        }

        if (!isLastStep) {
            setCurrentStepIndex((prev) => prev + 1);
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.set("displayName", displayName);
            formData.set("pronouns", pronouns);
            formData.set("bio", bio);
            formData.set("notificationLevel", notificationLevel);
            formData.set("directMessagePrivacy", directMessagePrivacy);
            formData.set("notificationSound", String(notificationSound));
            formData.set("telemetryEnabled", String(telemetryEnabled));

            const result = await completeOnboardingAction(formData);

            if (result.success) {
                posthog.capture("onboarding_completed");
                toast.success("Profile setup complete!");
                await refreshUser();
                router.push("/chat");
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "An error occurred. Please try again.";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }

    function handleSkip() {
        posthog.capture("onboarding_skipped");
        router.push("/chat");
    }

    function goBack() {
        if (!isFirstStep) {
            setCurrentStepIndex((prev) => prev - 1);
        }
    }

    return (
        <div className="container mx-auto max-w-2xl px-4 py-12">
            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-10 shadow-xl backdrop-blur">
                {/* Progress indicator */}
                <ul
                    aria-label="Onboarding progress"
                    className="mb-8 flex items-center justify-center gap-2"
                >
                    {STEPS.map((step, index) => (
                        <li className="flex items-center gap-2" key={step}>
                            <div
                                aria-current={
                                    index === currentStepIndex
                                        ? "step"
                                        : undefined
                                }
                                aria-label={`Step ${index + 1}: ${step}${index === currentStepIndex ? " (current step)" : ""}`}
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                                    index <= currentStepIndex
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                                }`}
                            >
                                {index < currentStepIndex ? (
                                    <Check
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                ) : (
                                    index + 1
                                )}
                            </div>
                            {index < STEPS.length - 1 && (
                                <div
                                    className={`h-0.5 w-8 transition-colors ${
                                        index < currentStepIndex
                                            ? "bg-primary"
                                            : "bg-muted"
                                    }`}
                                />
                            )}
                        </li>
                    ))}
                </ul>

                {/* Step header */}
                <div className="mb-8 space-y-4 text-center">
                    <div className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-linear-to-br from-sky-400/60 via-purple-400/60 to-transparent p-3 shadow-lg">
                        <Sparkles
                            aria-hidden="true"
                            className="size-8 text-primary"
                        />
                    </div>
                    {currentStep === "profile" && (
                        <>
                            <h1 className="font-semibold text-3xl tracking-tight">
                                Welcome to Firepit!
                            </h1>
                            <p className="text-muted-foreground">
                                Let&apos;s set up your profile so others can get
                                to know you better.
                            </p>
                        </>
                    )}
                    {currentStep === "notifications" && (
                        <>
                            <h1 className="font-semibold text-3xl tracking-tight">
                                Notification preferences
                            </h1>
                            <p className="text-muted-foreground">
                                Choose how you want to be notified about new
                                messages.
                            </p>
                        </>
                    )}
                    {currentStep === "telemetry" && (
                        <>
                            <h1 className="font-semibold text-3xl tracking-tight">
                                Help improve Firepit
                            </h1>
                            <p className="text-muted-foreground">
                                Share anonymous usage data to help us make the
                                app better.
                            </p>
                        </>
                    )}
                    {userData?.name && (
                        <p className="text-sm text-muted-foreground">
                            Logged in as{" "}
                            <span className="font-medium">{userData.name}</span>
                        </p>
                    )}
                </div>

                <form className="space-y-6" onSubmit={handleSubmit}>
                    {/* Step 1: Profile */}
                    {currentStep === "profile" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="displayName">
                                    Display Name *
                                </Label>
                                <Input
                                    autoComplete="name"
                                    id="displayName"
                                    name="displayName"
                                    onChange={(e) =>
                                        setDisplayName(e.target.value)
                                    }
                                    placeholder="How should others see your name?"
                                    type="text"
                                    value={displayName}
                                />
                                <p className="text-xs text-muted-foreground">
                                    This is how you&apos;ll appear in
                                    conversations and on your profile.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pronouns">Pronouns</Label>
                                <Select
                                    onValueChange={setPronouns}
                                    value={pronouns}
                                >
                                    <SelectTrigger id="pronouns">
                                        <SelectValue placeholder="Select pronouns (optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="he/him">
                                            he/him
                                        </SelectItem>
                                        <SelectItem value="she/her">
                                            she/her
                                        </SelectItem>
                                        <SelectItem value="they/them">
                                            they/them
                                        </SelectItem>
                                        <SelectItem value="other">
                                            other
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Optional - displayed on your profile.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="bio">About You</Label>
                                <Textarea
                                    id="bio"
                                    name="bio"
                                    onChange={(e) => setBio(e.target.value)}
                                    placeholder="Tell us a bit about yourself..."
                                    rows={3}
                                    value={bio}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Share your interests or anything that helps
                                    others connect with you. (Optional)
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Notifications */}
                    {currentStep === "notifications" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="notificationLevel">
                                    Notification level
                                </Label>
                                <Select
                                    onValueChange={(value) =>
                                        setNotificationLevel(
                                            parseNotificationLevel(value),
                                        )
                                    }
                                    value={notificationLevel}
                                >
                                    <SelectTrigger id="notificationLevel">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All messages - Get notified for
                                            every message
                                        </SelectItem>
                                        <SelectItem value="mentions">
                                            Mentions only - Only when someone
                                            @mentions you
                                        </SelectItem>
                                        <SelectItem value="nothing">
                                            Nothing - Disable all notifications
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="directMessagePrivacy">
                                    Direct message privacy
                                </Label>
                                <Select
                                    onValueChange={(value) =>
                                        setDirectMessagePrivacy(
                                            parseDirectMessagePrivacy(value),
                                        )
                                    }
                                    value={directMessagePrivacy}
                                >
                                    <SelectTrigger id="directMessagePrivacy">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="everyone">
                                            Everyone - Anyone can send you DMs
                                        </SelectItem>
                                        <SelectItem value="friends">
                                            Friends only - Only friends can send
                                            you DMs
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                                <div className="space-y-1">
                                    <Label
                                        className="text-base"
                                        htmlFor="notificationSound"
                                    >
                                        Notification sound
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Play a sound when you receive a
                                        notification
                                    </p>
                                </div>
                                <Switch
                                    checked={notificationSound}
                                    id="notificationSound"
                                    onCheckedChange={setNotificationSound}
                                />
                            </div>
                        </div>
                    )}

                    {/* Step 3: Telemetry */}
                    {currentStep === "telemetry" && (
                        <div className="space-y-4">
                            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                                <p className="text-sm text-muted-foreground">
                                    When enabled, Firepit collects anonymous
                                    usage data to help us understand how people
                                    use the app and identify areas for
                                    improvement. This includes information like:
                                </p>
                                <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                                    <li>Which features you use most</li>
                                    <li>How you navigate the app</li>
                                    <li>Performance and reliability data</li>
                                </ul>
                                <p className="mt-3 text-xs text-muted-foreground">
                                    We never collect your messages, profile
                                    content, or any personal information. You
                                    can change this setting anytime in Settings.
                                </p>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
                                <div className="space-y-1">
                                    <Label
                                        className="text-base"
                                        htmlFor="telemetryEnabled"
                                    >
                                        Enable telemetry
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Help us improve Firepit with anonymous
                                        usage data
                                    </p>
                                </div>
                                <Switch
                                    checked={telemetryEnabled}
                                    id="telemetryEnabled"
                                    onCheckedChange={setTelemetryEnabled}
                                />
                            </div>
                        </div>
                    )}

                    {/* Navigation buttons */}
                    <div className="flex flex-col gap-3 pt-4 sm:flex-row">
                        {!isFirstStep && (
                            <Button
                                className="sm:w-auto"
                                disabled={loading}
                                onClick={goBack}
                                type="button"
                                variant="outline"
                            >
                                <ChevronLeft
                                    aria-hidden="true"
                                    className="mr-2 size-4"
                                />
                                Back
                            </Button>
                        )}
                        <Button
                            className="flex-1"
                            disabled={loading}
                            type="submit"
                        >
                            {getPrimaryButtonLabel()}
                            {!isLastStep && (
                                <ChevronRight
                                    aria-hidden="true"
                                    className="ml-2 size-4"
                                />
                            )}
                        </Button>
                    </div>
                </form>

                <div className="mt-6 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        You can always update these settings later in Settings.
                    </p>
                    <Button
                        className="text-xs"
                        disabled={loading}
                        onClick={handleSkip}
                        type="button"
                        variant="ghost"
                    >
                        Skip all
                    </Button>
                </div>
            </div>
        </div>
    );
}
