"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { loginAction, registerAction } from "./actions";

function LoginFormContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { refreshUser } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);

	const redirectPath = searchParams.get("redirect");
	const destination =
		redirectPath?.startsWith("/") === true ? redirectPath : "/chat";

	async function onLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await loginAction(email, password);
			if (result.success) {
				toast.success("Logged in");
				// Refresh user data in context before navigating
				await refreshUser();
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				router.push(destination as any);
			} else {
				toast.error(result.error);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Login failed";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	async function onRegister(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		try {
			const result = await registerAction(
				email,
				password,
				name || email.split("@")[0]
			);
			if (result.success) {
				toast.success("Account created");
				// Refresh user data in context before navigating
				await refreshUser();
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				router.push(destination as any);
			} else {
				toast.error(result.error);
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Registration failed";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="container mx-auto max-w-md px-4 py-8">
			<h1 className="mb-6 font-semibold text-2xl">Sign in to Firepit</h1>
			<form className="grid gap-4" onSubmit={onLogin}>
				<div className="grid gap-2">
					<Label htmlFor="name">Name</Label>
					<Input
						autoComplete="name"
						id="name"
						name="name"
						onChange={(e) => setName(e.target.value)}
						placeholder="Your display name"
						type="text"
						value={name}
					/>
				</div>
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
				<div className="flex gap-2">
					<Button disabled={loading} type="submit">
						{loading ? "Signing in..." : "Sign in"}
					</Button>
					<Button
						disabled={loading}
						onClick={onRegister}
						type="button"
						variant="outline"
					>
						{loading ? "Creating..." : "Create account"}
					</Button>
				</div>
			</form>
		</div>
	);
}

function LoginForm() {
	return (
		<Suspense fallback={<div className="container mx-auto max-w-md px-4 py-8">Loading...</div>}>
			<LoginFormContent />
		</Suspense>
	);
}

export default function LoginPage() {
	return <LoginForm />;
}
