"use client";

import type { FormEvent } from "react";

import { deletePredefinedFrameAssetAction } from "./actions";

type ConfirmDeleteFrameAssetFormProps = {
    frameId: string;
    className?: string;
};

export function ConfirmDeleteFrameAssetForm({
    frameId,
    className,
}: ConfirmDeleteFrameAssetFormProps) {
    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        if (!window.confirm("Remove this frame asset from storage?")) {
            event.preventDefault();
        }
    };

    return (
        <form
            action={deletePredefinedFrameAssetAction}
            className={className}
            onSubmit={handleSubmit}
        >
            <input name="frameId" type="hidden" value={frameId} />
            <button
                className="w-full rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                type="submit"
            >
                Remove asset
            </button>
        </form>
    );
}
