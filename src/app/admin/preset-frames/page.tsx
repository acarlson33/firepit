import { redirect } from "next/navigation";
import { CheckCircle2, UploadCloud, XCircle } from "lucide-react";

import { getAdminClient } from "@/lib/appwrite-admin";
import { getEnvConfig } from "@/lib/appwrite-core";
import { requireAdmin } from "@/lib/auth-server";
import {
    getAllPresetFrames,
    getPresetFrameStorageFileId,
} from "@/lib/preset-frames";

import {
    deletePredefinedFrameAssetAction,
    uploadPredefinedFrameAssetAction,
} from "./actions";

type PageProps = {
    searchParams?: Promise<Record<string, string | string[]>>;
};

type FrameAssetStatus = {
    frameId: string;
    exists: boolean;
    updatedAt?: string;
};

async function getFrameAssetStatuses() {
    const frames = getAllPresetFrames();
    const { storage } = getAdminClient();
    const env = getEnvConfig();
    const bucketId = env.buckets.avatarFramesPredefined;

    const statuses = await Promise.all(
        frames.map(async (frame): Promise<FrameAssetStatus> => {
            const storageFileId =
                getPresetFrameStorageFileId(frame.id) ?? frame.id;
            try {
                const file = await storage.getFile(bucketId, storageFileId);
                return {
                    frameId: frame.id,
                    exists: true,
                    updatedAt: file.$updatedAt,
                };
            } catch {
                return {
                    frameId: frame.id,
                    exists: false,
                };
            }
        }),
    );

    const statusByFrameId = new Map(
        statuses.map((item) => [item.frameId, item]),
    );

    return frames.map((frame) => ({
        ...frame,
        status: statusByFrameId.get(frame.id),
    }));
}

export default async function AdminPresetFramesPage({
    searchParams,
}: PageProps) {
    await requireAdmin().catch(() => {
        redirect("/");
    });

    await searchParams;

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
                    const exists = Boolean(frame.status?.exists);

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
                                            <span>Uploaded</span>
                                        </>
                                    ) : (
                                        <>
                                            <XCircle
                                                aria-hidden="true"
                                                className="h-4 w-4 text-amber-500"
                                            />
                                            <span>Missing</span>
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
                                            {new Date(
                                                frame.status.updatedAt,
                                            ).toLocaleString()}
                                        </dd>
                                    </div>
                                )}
                            </dl>

                            <form
                                action={uploadPredefinedFrameAssetAction}
                                className="mt-4 space-y-3"
                            >
                                <input
                                    name="frameId"
                                    type="hidden"
                                    value={frame.id}
                                />
                                <input
                                    accept="image/png"
                                    className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
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
                                <form
                                    action={deletePredefinedFrameAssetAction}
                                    className="mt-3"
                                >
                                    <input
                                        name="frameId"
                                        type="hidden"
                                        value={frame.id}
                                    />
                                    <button
                                        className="w-full rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                                        type="submit"
                                    >
                                        Remove asset
                                    </button>
                                </form>
                            )}
                        </article>
                    );
                })}
            </section>
        </main>
    );
}
