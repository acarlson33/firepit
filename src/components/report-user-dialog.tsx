"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitReportAction } from "@/app/reports/actions";

type ReportUserDialogProps = {
    targetUserId: string;
    targetDisplayName: string;
    fullWidth?: boolean;
    variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
};

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

export function ReportUserDialog({
    targetUserId,
    targetDisplayName,
    fullWidth = false,
    variant = "outline",
}: ReportUserDialogProps) {
    const [open, setOpen] = useState(false);
    const [justification, setJustification] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const trimmed = justification.trim();
    const charCount = trimmed.length;
    const isValid = charCount >= MIN_LENGTH && charCount <= MAX_LENGTH;

    async function handleSubmit() {
        if (!isValid || submitting) {
            return;
        }

        setSubmitting(true);
        try {
            const result = await submitReportAction(targetUserId, trimmed);
            if (result.success) {
                toast.success("Report submitted. An admin will review it.");
                setOpen(false);
                setJustification("");
            } else {
                toast.error(result.error);
            }
        } catch {
            toast.error("Failed to submit report.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    className={fullWidth ? "w-full" : undefined}
                    variant={variant}
                >
                    <Flag className="mr-2 h-4 w-4" />
                    Report User
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Report {targetDisplayName}</DialogTitle>
                    <DialogDescription>
                        Help us keep the community safe. Reports are reviewed by
                        instance admins.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label
                            className="text-sm font-medium"
                            htmlFor="report-justification"
                        >
                            Why are you reporting this user?{" "}
                            <span className="text-destructive">*</span>
                        </label>
                        <Textarea
                            id="report-justification"
                            maxLength={MAX_LENGTH}
                            minLength={MIN_LENGTH}
                            onChange={(e) => setJustification(e.target.value)}
                            placeholder="Describe what is inappropriate about this user's profile..."
                            rows={4}
                            value={justification}
                        />
                        <p
                            className={`text-xs ${
                                charCount > 0 && !isValid
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                            }`}
                        >
                            {charCount < MIN_LENGTH
                                ? `${MIN_LENGTH - charCount} more characters required`
                                : `${charCount}/${MAX_LENGTH}`}
                        </p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button
                            onClick={() => setOpen(false)}
                            type="button"
                            variant="ghost"
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={!isValid || submitting}
                            onClick={handleSubmit}
                            variant="destructive"
                        >
                            {submitting ? "Submitting..." : "Submit Report"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
