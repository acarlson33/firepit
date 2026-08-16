import { redirect } from "next/navigation";
import { CheckCircle2, UploadCloud, XCircle } from "lucide-react";
import { AppwriteException } from "node-appwrite";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { AuthError, requireAdmin } from "@/lib/auth-server";
import { logger } from "@/lib/newrelic-utils";
import {
    getAllPresetFrames,
    getPresetFrameStorageFileId,
} from "@/lib/preset-frames";

import { uploadPredefinedFrameAssetAction } from "./actions";
import { ConfirmDeleteFrameAssetForm } from "./confirm-delete-frame-asset-form";

type FrameAssetStatus = {
    frameId: string;
    exists: boolean;
    updatedAt?: string;
    errorMessage?: string;
};

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
});

function getAppwriteErrorCode(error: unknown): number | null {
    if (!(error instanceof AppwriteException)) {
        return null;
    }

    if (typeof error.code === "number" && Number.isFinite(error.code)) {
        return error.code;
    }

    if (typeof error.code === "string") {
        const parsed = Number(error.code);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

async function getFrameAssetStatuses() {
    const frames = getAllPresetFrames();
    const { storage } = getAdminClient();
    const env = getEnvConfig();
    const bucketId = env.buckets.avatarFramesPredefined;

    const statusResults = await Promise.allSettled(
        frames.map(async (frame): Promise<FrameAssetStatus> => {
            const storageFileId =
                getPresetFrameStorageFileId(frame.id) ?? frame.id;
            const file = await storage.getFile(bucketId, storageFileId);
            return {
                frameId: frame.id,
                exists: true,
                updatedAt: file.$updatedAt,
            };
        }),
    );

    const statuses = statusResults.map((result, index): FrameAssetStatus => {
        const frame = frames.at(index);
        if (!frame) {
            return {
                frameId: `unknown-${String(index)}`,
                exists: false,
                errorMessage: "Status unavailable",
            };
        }

        const storageFileId = getPresetFrameStorageFileId(frame.id) ?? frame.id;

        if (result.status === "fulfilled") {
            return result.value;
        }

        if (getAppwriteErrorCode(result.reason) === 404) {
            return {
                frameId: frame.id,
                exists: false,
            };
        }

        logger.error("Failed to fetch preset frame asset status", {
            error: getErrorMessage(result.reason),
            frameId: frame.id,
            storageFileId,
        });

        return {
            frameId: frame.id,
            exists: false,
            errorMessage: "Status unavailable",
        };
    });

    const statusByFrameId = new Map(
        statuses.map((item) => [item.frameId, item]),
    );

    return frames.map((frame) => ({
        ...frame,
        status: statusByFrameId.get(frame.id),
    }));
}

function getStatusLabel(params: {
    exists: boolean | undefined;
    hasError: boolean;
}) {
    if (params.hasError) {
        return "Unavailable";
    }

    if (params.exists) {
        return "Uploaded";
    }

    return "Missing";
}

export default async function AdminPresetFramesPage() {
    try {
        await requireAdmin();
    } catch (error) {
        if (
            error instanceof AuthError &&
            (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")
        ) {
            redirect("/");
        }

        throw error;
    }

    const frames = await getFrameAssetStatuses();

    return (
        <main className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
            <section className="rounded-3xl border border-border/60 bg-card/70 p-8 shadow-xl">
                <h1 className="text-3xl font-semibold tracking-tight">
                    Preset frame asset manager
                </h1>
                <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
                    Upload transparent PNG assets for predefined avatar frames.
                    Files are stored in the dedicated
                    <span className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        avatar-frames-predefined
                    </span>
                    bucket and are keyed by frame ID.
                </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {frames.map((frame) => {
                    const storageFileId =
                        getPresetFrameStorageFileId(frame.id) ?? frame.id;
                    const exists = frame.status?.exists;
                    const statusLabel = getStatusLabel({
                        exists,
                        hasError: Boolean(frame.status?.errorMessage),
                    });

                    return (
                        <article
                            className="rounded-3xl border border-border/60 bg-card/70 p-5 shadow-sm"
                            key={frame.id}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-foreground">
                                        {frame.name}
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        {frame.id}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 text-xs">
                                    {exists ? (
                                        <>
                                            <CheckCircle2
                                                aria-hidden="true"
                                                className="h-4 w-4 text-emerald-500"
                                            />
                                            <span>{statusLabel}</span>
                                        </>
                                    ) : (
                                        <>
                                            <XCircle
                                                aria-hidden="true"
                                                className="h-4 w-4 text-amber-500"
                                            />
                                            <span>{statusLabel}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                                <div className="flex items-center justify-between gap-2">
                                    <dt>Type</dt>
                                    <dd className="font-medium text-foreground">
                                        {frame.type}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <dt>Bucket file ID</dt>
                                    <dd className="font-mono text-[11px] text-foreground">
                                        {storageFileId}
                                    </dd>
                                </div>
                                {frame.status?.updatedAt && (
                                    <div className="flex items-center justify-between gap-2">
                                        <dt>Last updated</dt>
                                        <dd className="text-foreground">
                                            {UPDATED_AT_FORMATTER.format(
                                                new Date(
                                                    frame.status.updatedAt,
                                                ),
                                            )}
                                        </dd>
                                    </div>
                                )}
                            </dl>

                            {frame.status?.errorMessage && (
                                <p className="mt-2 text-xs text-amber-600">
                                    {frame.status.errorMessage}
                                </p>
                            )}

                            <form
                                action={uploadPredefinedFrameAssetAction}
                                className="mt-4 space-y-3"
                            >
                                <input
                                    name="frameId"
                                    type="hidden"
                                    value={frame.id}
                                />
                                <label
                                    className="sr-only"
                                    htmlFor={`frame-file-${frame.id}`}
                                >
                                    Upload frame image for {frame.name}
                                </label>
                                <input
                                    accept="image/png"
                                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
                                    id={`frame-file-${frame.id}`}
                                    name="file"
                                    required
                                    type="file"
                                />
                                <button
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-foreground/40"
                                    type="submit"
                                >
                                    <UploadCloud
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                    />
                                    Upload or replace PNG
                                </button>
                            </form>

                            {exists && (
                                <ConfirmDeleteFrameAssetForm
                                    className="mt-3"
                                    frameId={frame.id}
                                />
                            )}
                        </article>
                    );
                })}
            </section>
        </main>
    );
}
