"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { ArrowRight, Flame, Shield } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";

import { loginAction, resendVerificationAction } from "./actions";

type LoginFormProps = {
    showResendVerification: boolean;
};

const LoginFormContent: React.FC<LoginFormProps> = ({ showResendVerification }) => {
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
        redirectPath?.startsWith("/") ? redirectPath : "/chat";

    const onLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const formData = new FormData();
            formData.set("email", email);
            formData.set("password", password);
            const result = await loginAction(formData);
            if (result.success) {
                toast.success("Logged in");
                await refreshUser();
                posthog.identify(result.userId, {
                    appwriteUserId: result.userId,
                });
                posthog.capture("user_logged_in", undefined, {
                    send_instantly: true,
                });
                router.push(destination as Route);
            } else {
                toast.error(result.message ?? result.error);
            }
        } catch (err) {
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

    const onResendVerification = async () => {
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
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
                <section className="relative overflow-hidden rounded-4xl border border-border/70 bg-card/85 p-8 shadow-2xl backdrop-blur-sm sm:p-10">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.12),transparent_28%)]"
                    />

                    <div className="relative space-y-8">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                            <Flame className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                            Firepit login
                        </div>

                        <div className="space-y-4">
                            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                                Sign in and return to your workspace.
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                                Access your chats, inbox, settings, and admin tools from one entry point. The redesign keeps the sign-in flow simple and focused.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Chat</p>
                                <p className="mt-2 text-sm text-foreground">Jump straight back into servers and direct messages.</p>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Security</p>
                                <p className="mt-2 text-sm text-foreground">Session handling stays cookie-based and server-controlled.</p>
                            </div>
                            <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Profile</p>
                                <p className="mt-2 text-sm text-foreground">Continue into onboarding if your account still needs setup.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <Card className="rounded-4xl border border-border/70 bg-card/85 shadow-2xl backdrop-blur-sm">
                    <CardHeader className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                            Secure access
                        </div>
                        <CardTitle className="text-2xl font-semibold tracking-tight">Sign in to Firepit</CardTitle>
                        <CardDescription className="leading-6">
                            Use your Appwrite account to reach chat, onboarding, and workspace controls.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
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
                            <Button disabled={loading} type="submit" className="rounded-full">
                                {loading ? "Signing in..." : "Sign in"}
                                {!loading && <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />}
                            </Button>
                            {showResendVerification && (
                                <Button
                                    disabled={loading || resendingVerification}
                                    onClick={onResendVerification}
                                    type="button"
                                    variant="outline"
                                    className="rounded-full"
                                >
                                    {resendingVerification
                                        ? "Resending..."
                                        : "Resend verification email"}
                                </Button>
                            )}
                        </form>
                        <p className="mt-6 text-sm text-muted-foreground">
                            Need an account?{" "}
                            <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/register">
                                Create one
                            </Link>
                            .
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

const LoginForm: React.FC<LoginFormProps> = ({ showResendVerification }) => {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto max-w-md px-4 py-8">
                    Loading...
                </div>
            }
        >
            <LoginFormContent showResendVerification={showResendVerification} />
        </Suspense>
    );
}

export default LoginForm;