<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into Firepit, a Next.js 16 App Router chat application. The integration covers client-side initialization via `instrumentation-client.ts`, server-side event capture via a `posthog-node` helper, user identification on login and signup, and exception tracking at auth error boundaries.

## Files created or modified

| File | Change |
|---|---|
| `instrumentation-client.ts` | Created — client-side PostHog initialization (Next.js 15.3+) with session replay and error tracking |
| `src/lib/posthog-server.ts` | Created — singleton `posthog-node` client for server-side capture |
| `next.config.ts` | Added PostHog reverse-proxy rewrites (`/ingest/*`) and `skipTrailingSlashRedirect` |
| `.env.local` | Set `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` |
| `src/app/(auth)/login/page.tsx` | Added `posthog.identify()`, `user_logged_in` capture, and `captureException` on error |
| `src/app/(auth)/register/page.tsx` | Added `posthog.identify()`, `user_signed_up` capture, and `captureException` on error |
| `src/app/onboarding/page.tsx` | Added `onboarding_completed` and `onboarding_skipped` captures |
| `src/components/header.tsx` | Added `user_logged_out` capture and `posthog.reset()` before logout |
| `src/app/chat/components/CreateInviteDialog.tsx` | Added `invite_created` (with expiration/maxUses/temporary props) and `invite_link_copied` captures |
| `src/app/api/invites/[code]/join/route.ts` | Added server-side `server_joined_via_invite` capture |
| `src/app/api/servers/create/route.ts` | Added server-side `server_created` capture |
| `src/app/api/friends/request/route.ts` | Added server-side `friend_request_sent` capture |

## Events

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully created a new account | `src/app/(auth)/register/page.tsx` |
| `user_logged_in` | User successfully logged in | `src/app/(auth)/login/page.tsx` |
| `user_logged_out` | User logged out (triggers `posthog.reset()`) | `src/components/header.tsx` |
| `onboarding_completed` | User completed profile setup during onboarding | `src/app/onboarding/page.tsx` |
| `onboarding_skipped` | User skipped the onboarding profile setup | `src/app/onboarding/page.tsx` |
| `invite_created` | User generated a new server invite link | `src/app/chat/components/CreateInviteDialog.tsx` |
| `invite_link_copied` | User copied an invite link to clipboard | `src/app/chat/components/CreateInviteDialog.tsx` |
| `server_joined_via_invite` | User joined a server via invite code (server-side) | `src/app/api/invites/[code]/join/route.ts` |
| `server_created` | User created a new server (server-side) | `src/app/api/servers/create/route.ts` |
| `friend_request_sent` | User sent a friend request (server-side) | `src/app/api/friends/request/route.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics dashboard](https://us.posthog.com/project/254192/dashboard/1364297)
- [Signup → Onboarding Funnel](https://us.posthog.com/project/254192/insights/NiLYjYgn)
- [Daily Sign-ups & Logins](https://us.posthog.com/project/254192/insights/0VhmTf34)
- [Server & Invite Activity](https://us.posthog.com/project/254192/insights/9lTCl0sB)
- [Signup to Server Join Funnel](https://us.posthog.com/project/254192/insights/tDEm5zSO)

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
