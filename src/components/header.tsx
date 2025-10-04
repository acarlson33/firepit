"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";

import { getAccount } from "@/lib/appwrite";
import { logoutAction } from "@/app/(auth)/login/actions";

type UserRoles = {
  isAdmin: boolean;
  isModerator: boolean;
};

export default function Header() {
  const router = useRouter();
  const [isAuthed, setAuthed] = useState(false);
  const [roles, setRoles] = useState<UserRoles | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const acc = getAccount();
    acc
      .get()
      .then(() => {
        setAuthed(true);
        // Fetch user roles
        fetch("/api/me")
          .then((res) => res.json())
          .then((data) => {
            if (data.roles) {
              setRoles(data.roles);
            }
          })
          .catch(() => {
            // Ignore errors
          });
      })
      .catch(() => setAuthed(false));
  }, []);

  const baseLinks: Array<{ to: string; label: string }> = [
    { to: "/", label: "Home" },
    { to: "/chat", label: "Chat" },
  ];

  const links: Array<{ to: string; label: string }> = [
    ...baseLinks,
    ...(roles?.isModerator ? [{ to: "/moderation", label: "Moderation" }] : []),
    ...(roles?.isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  async function handleLogout(e: React.FormEvent) {
    e.preventDefault();
    setLoggingOut(true);
    try {
      await logoutAction();
      setAuthed(false);
      router.push("/");
      router.refresh();
    } catch {
      // Ignore errors, redirect anyway
      location.href = "/";
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map((link) => (
            <Link href={link.to as `/` | `/chat` | `/moderation` | `/admin`} key={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {isAuthed ? (
            <form onSubmit={handleLogout}>
              <Button disabled={loggingOut} type="submit" variant="outline">
                {loggingOut ? "Logging out..." : "Logout"}
              </Button>
            </form>
          ) : (
            <Link href="/login">Login</Link>
          )}
          <ModeToggle />
        </div>
      </div>
      <hr />
    </div>
  );
}
