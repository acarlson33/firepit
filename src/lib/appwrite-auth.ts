import { getBrowserAccount } from "./appwrite-core";
import type { User } from "./types";

export async function register(
  email: string,
  password: string,
  name: string
): Promise<User> {
  // Always create a fresh account instance to ensure we are in a browser context (no API key)
  const acc = getBrowserAccount();
  const res = await acc.create({
    userId: crypto.randomUUID(),
    email,
    password,
    name,
  });
  return res as unknown as User;
}

export function login(email: string, password: string) {
  const acc = getBrowserAccount();
  // Primary session creation (SDK sets cookie). If Appwrite cannot set cookies due to platform misconfig,
  // this will succeed but the session cookie may still be missing; that scenario must be addressed via platform settings.
  return acc.createEmailPasswordSession({ email, password });
}

export function logout() {
  const acc = getBrowserAccount();
  return acc.deleteSession({ sessionId: "current" });
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const acc = getBrowserAccount();
    const user = await acc.get();
    return user as unknown as User;
  } catch {
    return null;
  }
}

export async function getCurrentSession() {
  try {
    const acc = getBrowserAccount();
    return await acc.getSession({ sessionId: "current" });
  } catch {
    return null;
  }
}
