"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { loginAction, resendVerificationAction } from "./actions";

function LoginFormContent() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { refreshUser } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [resendingVerification, setResendingVerification] = useState(false);
    const notifiedVerificationStatusRef = useRef<string | null>(null);

    useEffect(() => {
        const verifiedStatus = searchParams.get("verified");
        if (
            !verifiedStatus ||
            notifiedVerificationStatusRef.current === verifiedStatus
        ) {
            return;
        }

        notifiedVerificationStatusRef.current = verifiedStatus;

        if (verifiedStatus === "1") {
            toast.success("Email verified. You can now sign in.");
        } else if (verifiedStatus === "0") {
            toast.error("Email verification link is invalid or expired.");
        }

        const updatedSearchParams = new URLSearchParams(searchParams.toString());
        updatedSearchParams.delete("verified");
        const nextQuery = updatedSearchParams.toString();
        const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
        router.replace(nextUrl as Route);
    }, [pathname, router, searchParams]);

    const redirectPath = searchParams.get("redirect");
    const destination =
        redirectPath?.startsWith("/") === true ? redirectPath : "/chat";

    async function onLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const formData = new FormData();
            formData.set("email", email);
            formData.set("password", password);
            const result = await loginAction(formData);
            if (result.success) {
                toast.success("Logged in");
                // Refresh user data in context before navigating
                await refreshUser();
                posthog.identify(result.userId, {
                    appwriteUserId: result.userId,
                    email,
                });
                posthog.capture("user_logged_in", undefined, {
                    send_instantly: true,
                });
                router.push(destination as Route);
            } else {
                toast.error(result.message ?? result.error);
            }
        } catch (err) {
            // Enhanced error handling to prevent "unexpected response" errors
            const message =
                err instanceof Error
                    ? err.message
                    : "An error occurred during login. Please try again.";
            posthog.captureException(
                err instanceof Error ? err : new Error(message),
            );
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }

    async function onResendVerification() {
        if (!email || !password) {
            toast.error(
                "Enter your email and password to resend verification.",
            );
            return;
        }

        setResendingVerification(true);
        try {
            const formData = new FormData();
            formData.set("email", email);
            formData.set("password", password);
            const result = await resendVerificationAction(formData);
            if (result.success) {
                toast.success(result.message);
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "Failed to resend verification email.";
            toast.error(message);
        } finally {
            setResendingVerification(false);
        }
    }

    return (
        <div className="container mx-auto max-w-md px-4 py-8">
            <div className="mb-6 space-y-2">
                <h1 className="font-semibold text-2xl">Sign in to Firepit</h1>
                <p className="text-muted-foreground">
                    Access your chats and servers.
                </p>
            </div>
            <form className="grid gap-4" onSubmit={onLogin}>
                <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        autoComplete="email"
                        id="email"
                        name="email"
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={email}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                        autoComplete="current-password"
                        id="password"
                        name="password"
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        type="password"
                        value={password}
                    />
                </div>
                <Button disabled={loading} type="submit">
                    {loading ? "Signing in..." : "Sign in"}
                </Button>
                <Button
                    disabled={loading || resendingVerification}
                    onClick={onResendVerification}
                    type="button"
                    variant="outline"
                >
                    {resendingVerification
                        ? "Resending..."
                        : "Resend verification email"}
                </Button>
            </form>
            <p className="mt-6 text-sm text-muted-foreground">
                Need an account?{" "}
                <Link className="text-primary underline" href="/register">
                    Create one
                </Link>
                .
            </p>
        </div>
    );
}

function LoginForm() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto max-w-md px-4 py-8">
                    Loading...
                </div>
            }
        >
            <LoginFormContent />
        </Suspense>
    );
}

export default function LoginPage() {
    return <LoginForm />;
}
