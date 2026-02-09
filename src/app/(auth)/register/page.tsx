"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { registerAction } from "../login/actions";

function RegisterFormContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { refreshUser } = useAuth();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmedAdult, setConfirmedAdult] = useState(false);
	const [loading, setLoading] = useState(false);

	const redirectPath = searchParams.get("redirect");
	const destination =
		redirectPath?.startsWith("/") === true ? redirectPath : "/chat";

	async function onRegister(e: React.FormEvent) {
		e.preventDefault();

		if (!confirmedAdult) {
			toast.error("Please confirm you are 18 or older.");
			return;
		}

		setLoading(true);
		try {
			const formData = new FormData();
			formData.set("email", email);
			formData.set("password", password);
			formData.set("name", name || email.split("@")[0]);
			const result = await registerAction(formData);
			if (result.success) {
				toast.success("Account created");
				await refreshUser();
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				router.push(destination as any);
			} else {
				toast.error(result.error);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "An error occurred during registration. Please try again.";
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="container mx-auto max-w-md px-4 py-8">
			<div className="mb-6 space-y-2">
				<h1 className="font-semibold text-2xl">Create your account</h1>
				<p className="text-muted-foreground">Start chatting with Firepit.</p>
			</div>
			<form className="grid gap-4" onSubmit={onRegister}>
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
						autoComplete="new-password"
						id="password"
						name="password"
						onChange={(e) => setPassword(e.target.value)}
						required
						type="password"
						value={password}
					/>
				</div>
				<div className="flex items-start gap-3 rounded-md border border-input p-3">
					<Checkbox
						checked={confirmedAdult}
						id="confirmAge"
						onCheckedChange={(value) => setConfirmedAdult(value === true)}
					/>
					<div className="space-y-1 leading-none">
						<Label htmlFor="confirmAge">I agree I am 18+.</Label>
						<p className="text-sm text-muted-foreground">
							By creating an account, you confirm you are at least 18 years old.
						</p>
					</div>
				</div>
				<Button disabled={loading} type="submit">
					{loading ? "Creating..." : "Create account"}
				</Button>
			</form>
			<p className="mt-6 text-sm text-muted-foreground">
				Already have an account? <Link className="text-primary underline" href="/login">Sign in</Link>.
			</p>
		</div>
	);
}

function RegisterForm() {
	return (
		<Suspense fallback={<div className="container mx-auto max-w-md px-4 py-8">Loading...</div>}>
			<RegisterFormContent />
		</Suspense>
	);
}

export default function RegisterPage() {
	return <RegisterForm />;
}
