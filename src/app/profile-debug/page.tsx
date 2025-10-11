"use server";

import { requireAuth } from "@/lib/auth-server";
import { redirect } from "next/navigation";
import { getUserProfile, getAvatarUrl } from "@/lib/appwrite-profiles";

export default async function ProfileDebugPage() {
	const user = await requireAuth().catch(() => {
		redirect("/login");
	});

	if (!user) {
		redirect("/login");
	}

	const profile = await getUserProfile(user.$id);

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<h1 className="mb-6 text-3xl font-bold">Profile Debug Info</h1>
			
			<div className="space-y-6">
				<div className="rounded-lg border p-6">
					<h2 className="mb-4 text-xl font-semibold">User Info</h2>
					<pre className="overflow-x-auto rounded bg-muted p-4">
						{JSON.stringify(
							{
								userId: user.$id,
								userName: user.name,
								userEmail: user.email,
							},
							null,
							2
						)}
					</pre>
				</div>

				<div className="rounded-lg border p-6">
					<h2 className="mb-4 text-xl font-semibold">Profile Data</h2>
					{profile ? (
						<>
							<pre className="overflow-x-auto rounded bg-muted p-4">
								{JSON.stringify(profile, null, 2)}
							</pre>
							
							{profile.avatarFileId && (
								<div className="mt-4">
									<h3 className="mb-2 font-semibold">Avatar URL:</h3>
									<code className="block rounded bg-muted p-2 text-sm">
										{getAvatarUrl(profile.avatarFileId)}
									</code>
									<div className="mt-4">
										<h3 className="mb-2 font-semibold">Avatar Preview:</h3>
										<img
											alt="Avatar"
											className="h-32 w-32 rounded-full border-2"
											src={getAvatarUrl(profile.avatarFileId)}
										/>
									</div>
								</div>
							)}
						</>
					) : (
						<p className="text-muted-foreground">
							No profile found. Go to{" "}
							<a className="text-primary underline" href="/settings">
								Settings
							</a>{" "}
							to create one.
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
