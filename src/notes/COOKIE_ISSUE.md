# 🔍 Appwrite Cookie Problem Diagnosis & Solution

## The Root Cause

Your Appwrite Cloud instance at `https://nyc.cloud.appwrite.io` is **failing to set session cookies** when accessed from `http://localhost:3000`. This is a **cross-origin cookie issue**.

## Why This Happens

### The Cookie Flow (What Should Happen)

1. Client calls `login(email, password)`
2. Appwrite SDK calls `account.createEmailPasswordSession()`
3. Appwrite server responds with `Set-Cookie` header containing `a_session_68b230a0002245833242`
4. Browser stores cookie
5. Subsequent requests include cookie
6. Middleware detects cookie → allows access

### What's Actually Happening

1. ✅ Login API call succeeds (returns 201)
2. ❌ Browser **rejects** the `Set-Cookie` header because:
   - Cookie domain: `.appwrite.io` or `nyc.cloud.appwrite.io`
   - Your app domain: `localhost:3000`
   - Browser blocks cross-origin cookies (SameSite policy)

## The Evidence

**Symptoms you're seeing:**

- ✅ Database operations work (they use API key, not cookies)
- ❌ Middleware can't detect auth (no cookie)
- ❌ `account.get()` fails in browser (no cookie sent)
- ✅ `account.get()` works in server components sometimes (if using API key client)

## 🔧 Solutions (Pick One)

### Solution 1: Use Appwrite's Custom Domain (RECOMMENDED)

Set up a custom domain pointing to your Appwrite instance so cookies can be same-origin.

**Steps:**

1. In Appwrite Cloud Console → Settings → Domains
2. Add custom domain: `api.yourdomain.com`
3. Follow DNS setup instructions (add CNAME to Appwrite)
4. Wait for SSL certificate provisioning
5. Update `.env`:
   ```bash
   NEXT_PUBLIC_APPWRITE_ENDPOINT=https://api.yourdomain.com/v1
   ```

**Why this works:**

- If your app is at `app.yourdomain.com` and Appwrite at `api.yourdomain.com`, they share the same root domain
- Cookies can be set with `Domain=.yourdomain.com`

---

### Solution 2: Deploy to Production Domain (TEMPORARY FIX)

Deploy your Next.js app to the same domain as Appwrite using a reverse proxy.

**Example with Vercel + Custom Domain:**

1. Deploy app to Vercel → `app.yourdomain.com`
2. Set Appwrite custom domain → `api.yourdomain.com`
3. Update endpoints accordingly

**Note:** This only works in production, not local development.

---

### Solution 3: Server-Side Session Management (WORKAROUND)

Since Appwrite cookies don't work cross-origin, manage sessions server-side using Next.js cookies.

**Implementation:**

1. Create a server action to handle login:
   \`\`\`typescript
   // src/app/(auth)/login/actions.ts
   "use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Client, Account } from "appwrite";

export async function loginAction(email: string, password: string) {
const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;

// Create server-side client
const client = new Client()
.setEndpoint(endpoint)
.setProject(project);

const account = new Account(client);

try {
// Create session server-side
const session = await account.createEmailPasswordSession(email, password);

    // Manually set the cookie in Next.js
    const cookieStore = await cookies();
    cookieStore.set(\`a_session_\${project}\`, session.secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });

    return { success: true };

} catch (error) {
return {
success: false,
error: error instanceof Error ? error.message : 'Login failed'
};
}
}
\`\`\`

2. Use in login page:
   \`\`\`typescript
   import { loginAction } from "./actions";

async function onLogin(e: React.FormEvent) {
e.preventDefault();
setLoading(true);

const result = await loginAction(email, password);

if (result.success) {
toast.success("Logged in");
router.push(destination);
router.refresh(); // Force server components to re-render
} else {
toast.error(result.error);
}

setLoading(false);
}
\`\`\`

3. Update middleware to look for your custom cookie:
   \`\`\`typescript
   // src/middleware.ts
   const sessionCookie = cookieStore.get(\`a*session*\${projectId}\`);
   \`\`\`

**Why this works:**

- Session created server-side where CORS doesn't apply
- You manually set the cookie from your Next.js domain
- Appwrite session token stored in Next.js-managed cookie

**Limitations:**

- Must proxy all authenticated Appwrite calls through server actions
- Can't use Appwrite Realtime subscriptions from browser
- More complex architecture

---

### Solution 4: Appwrite Self-Hosted (FULL CONTROL)

Self-host Appwrite on your own infrastructure at `api.yourdomain.com`.

**Why this works:** Full control over domains and CORS settings.

**When to use:** If you need maximum control or have compliance requirements.

---

## 🎯 Recommended Path Forward

**For Development:**
Use **Solution 3 (Server-Side Sessions)** to continue development immediately.

**For Production:**
Use **Solution 1 (Custom Domain)** for proper Appwrite Cloud setup.

---

## 🧪 How to Test Current Cookie Behavior

Add this diagnostic route to confirm the issue:

\`\`\`typescript
// src/app/api/debug-cookies/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
const cookieStore = await cookies();
const allCookies = cookieStore.getAll();

return NextResponse.json({
cookies: allCookies,
projectId: process.env.NEXT*PUBLIC_APPWRITE_PROJECT_ID,
expectedCookieName: \`a_session*\${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}\`,
});
}
\`\`\`

Visit `http://localhost:3000/api/debug-cookies` after attempting login to see if the cookie exists.

---

## 📝 Quick Fix to Test Right Now

Let me implement **Solution 3** for you so you can verify auth works when cookies are properly managed.
