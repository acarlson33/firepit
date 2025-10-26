"use client";
import { Button } from "@/components/ui/button";

export type ConfirmState =
  | { type: "server"; id: string; name?: string }
  | { type: "channel"; id: string; name?: string }
  | null;

type Props = {
  state: ConfirmState;
  onCancel: () => void;
  onConfirm: (state: Exclude<ConfirmState, null>) => void;
};

export function ConfirmDialog({ state, onCancel, onConfirm }: Props) {
  if (!state) {
    return null;
  }
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
    >
      <div className="w-full max-w-sm space-y-4 rounded-md border bg-background p-4">
        <h3 className="font-semibold text-sm">
          Confirm {state.type === "server" ? "Server" : "Channel"} Deletion
        </h3>
        <p className="text-muted-foreground text-xs">
          Delete {state.type} &quot;{state.name || state.id}&quot;? This action cannot be
          undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} size="sm" type="button" variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(state)}
            size="sm"
            type="button"
            variant="destructive"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
