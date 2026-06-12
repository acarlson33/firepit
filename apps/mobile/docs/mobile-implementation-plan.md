# Firepit Mobile Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Deliver a first-class Firepit mobile app with the core daily-use flows first, then expand toward feature parity with the web app.

**Architecture:** The mobile app is an Expo Router React Native client that bootstraps from a Firepit instance URL, reads instance metadata, signs in through Appwrite, and uses the returned session secret as the Bearer token for Firepit API calls. The implementation should preserve Firepit vocabulary, permission rules, and feature flags, and should prefer mobile-native navigation and interaction patterns while keeping route context identifiers aligned with the web app.

**Tech Stack:** Expo Router, React Native, TypeScript, Appwrite, SQLite, expo-secure-store, expo-notifications, react-native-reanimated, react-native-gesture-handler, react-native-markdown-display.

**Primary references:**
- `apps/mobile/docs/mobile-feature-parity-backlog.md`
- `apps/mobile/docs/mobile-style-guide.md`
- `apps/mobile/docs/mobile-api-route-structures.md`
- `apps/mobile/README.md`
- `apps/mobile/package.json`

---

## Implementation strategy

Ship the mobile app in phases:
1. Make login/bootstrap and navigation solid.
2. Deliver the core messaging loop.
3. Add threads, unread state, search, and deep links.
4. Add media uploads and richer compose flows.
5. Add DMs and profile surfaces.
6. Add server management and moderation.
7. Finish with notifications, settings, and polish.

Each task below should be treated as a small implementation unit with tests or verification after every meaningful change.

## PR stack strategy

This work should be implemented as a Graphite stack of dependent PRs, one phase on top of the previous one. The intent is to keep each phase reviewable on its own while still letting the full mobile plan build toward a single integrated result.

Important context:
- There is already an existing stack to build on top of: the current branches with basic starting functionality.
- Each new phase should generally become the next dependent PR in the stack, rather than branching off to independent parallel PRs.
- When the work is finished, submit the full stack together so the earlier layers land in order.
- Keep each PR scoped to a single phase or a very tight sub-phase so reviews stay focused and conflicts stay manageable.

UI direction:
- Do not deviate from the existing tab-based UI structure as the primary navigation model.
- Preserve the current tabs for the mobile app while extending functionality inside that structure.
- Treat `/explore` as the main candidate for a future redesign into something newer and more polished, but do not use that as a reason to replace the tab shell now.

Recommended flow:
1. Start from the current basic-functionality branch stack.
2. Add phase 0 / phase 1 on top of that base, depending on what is already present.
3. Continue layering later phases as dependent PRs.
4. Only submit once the stack is complete and passes verification.


---

## Phase 0: Discovery and route alignment

### Task 0.1: Confirm the mobile route map and current screen responsibilities

**Objective:** Establish a clear map of the existing mobile routes before adding more behavior, while keeping the current tab-based shell intact.

**Files:**
- Read: `apps/mobile/src/app/_layout.tsx`
- Read: `apps/mobile/src/app/(tabs)/_layout.tsx`
- Read: `apps/mobile/src/app/index.tsx`
- Read: `apps/mobile/src/app/login.tsx`
- Read: `apps/mobile/src/app/explore.tsx`
- Read: `apps/mobile/src/app/server/[serverId].tsx`
- Read: `apps/mobile/src/app/server/messages/[serverId]/[channelId].tsx`
- Read: `apps/mobile/src/app/(tabs)/home.tsx`
- Read: `apps/mobile/src/app/(tabs)/chat.tsx`
- Read: `apps/mobile/src/app/(tabs)/settings.tsx`
- Read: `apps/mobile/src/app/(tabs)/admin.tsx`

**Step 1: Document current route responsibilities**
- Confirm which routes are public, authenticated, and nested.
- Identify where server list, channel list, message view, and auth gating already exist.

**Step 2: Record navigation gaps**
- Note missing routes for threads, DM list, profile views, search results, and settings subpages.
- Note any route naming that needs to preserve Firepit context identifiers (`server`, `channel`, `conversation`, `messageId`, `parentMessageId`, `highlight`).

**Step 3: Verify startup behavior**
- Run: `cd apps/mobile && bun run typecheck`
- Run: `cd apps/mobile && bun run lint`
- Expected: no new type or lint errors in untouched code.

---

### Task 0.2: Review existing API and persistence helpers

**Objective:** Understand the current data layer before implementing new screens.

**Files:**
- Read: `apps/mobile/src/lib/firepit/index.ts`
- Read: `apps/mobile/src/lib/firepit/bootstrap.ts`
- Read: `apps/mobile/src/lib/firepit/http.ts`
- Read: `apps/mobile/src/lib/firepit/persistence.ts`
- Read: `apps/mobile/src/lib/firepit/messages.ts`
- Read: `apps/mobile/src/lib/firepit/servers.ts`
- Read: `apps/mobile/src/lib/firepit/types.ts`
- Read: `apps/mobile/src/lib/reactions-client.ts`
- Read: `apps/mobile/src/lib/storage/sqlite.ts`
- Read: `apps/mobile/src/lib/storage/secure-store.ts`

**Step 1: Identify the data contracts already available**
- Confirm how the Firepit client stores instance URL, Appwrite endpoint/project ID, and session secret.
- Confirm which API modules already support servers, messages, reactions, and related reads/writes.

**Step 2: Note missing client helpers**
- Identify helper gaps for threads, unread state, search, DM creation, profile lookup, uploads, and notifications.

**Step 3: Verify baseline app boot**
- Run: `cd apps/mobile && bun run start`
- Expected: Expo starts successfully and the app reaches the current auth/bootstrap flow.

---

## Phase 1: Auth, bootstrap, and core navigation

### Task 1.1: Make bootstrap state explicit and user-friendly

**Objective:** Ensure first launch, instance setup, and sign-in have clear loading/error states.

**Files:**
- Modify: `apps/mobile/src/providers/firepit-provider.tsx`
- Modify: `apps/mobile/src/components/auth-route-guard.tsx`
- Modify: `apps/mobile/src/app/index.tsx`
- Modify: `apps/mobile/src/app/login.tsx`
- Modify: `apps/mobile/src/lib/firepit/bootstrap.ts`
- Modify: `apps/mobile/src/lib/firepit/persistence.ts`

**Step 1: Add/adjust tests for bootstrap states**
- Add tests for first-run, cached-instance, signed-out, and signed-in flows.
- Validate that the app never drops the user into a broken or ambiguous screen.

**Step 2: Implement the smallest UX improvements**
- Show clear loading and error states for instance fetch and session restoration.
- Keep the login route available when bootstrap is incomplete.

**Step 3: Verify**
- Run: `cd apps/mobile && bun run typecheck`
- Run: `cd apps/mobile && bun run lint`
- Expected: bootstrap flow compiles cleanly.

---

### Task 1.2: Define the authenticated shell and tab responsibilities

**Objective:** Make the tab layout match the product’s core areas while preserving the existing tab-based UI, with `/explore` reserved for a later redesign.

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx`
- Modify: `apps/mobile/src/components/app-tabs.tsx`
- Modify: `apps/mobile/src/components/app-tabs.web.tsx`
- Modify: `apps/mobile/src/app/(tabs)/home.tsx`
- Modify: `apps/mobile/src/app/(tabs)/chat.tsx`
- Modify: `apps/mobile/src/app/(tabs)/settings.tsx`
- Modify: `apps/mobile/src/app/(tabs)/admin.tsx`

**Step 1: Decide the tab order**
- Prefer daily-use destinations first: Home, Chat, Settings.
- Keep admin surfaces visible only when the current user can actually use them.

**Step 2: Fill placeholder screens with clear content**
- Replace any placeholder-only states with real entry points or meaningful empty states.

**Step 3: Verify**
- Run the app and confirm tab switching works without auth regressions.

---

### Task 1.3: Lock the navigation contract for feature work

**Objective:** Prevent later feature work from inventing inconsistent route semantics while keeping the current tab shell and leaving `/explore` available for a future refresh.

**Files:**
- Modify: `apps/mobile/docs/mobile-style-guide.md`
- Modify: `apps/mobile/docs/mobile-api-route-structures.md`
- Create: `apps/mobile/docs/mobile-navigation-contract.md`

**Step 1: Document route identifiers**
- Define how server, channel, conversation, thread, message, and highlight identifiers should be passed.

**Step 2: Document deep-link fallback behavior**
- If a message is unavailable, degrade gracefully to the surrounding channel or conversation.

**Step 3: Verify**
- Review the doc for consistency with the web product and current mobile routes.

---

## Phase 2: Core messaging experience

### Task 2.1: Make server and channel browsing the default post-login experience

**Objective:** Let users immediately land in a browsable server/channel experience.

**Files:**
- Modify: `apps/mobile/src/app/(tabs)/home.tsx`
- Modify: `apps/mobile/src/app/server/[serverId].tsx`
- Modify: `apps/mobile/src/app/server/messages/[serverId]/[channelId].tsx`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`

**Step 1: Add server list and server-switch behavior**
- Show the current servers the user belongs to.
- Make server switching predictable and fast.

**Step 2: Add channel browsing from a server**
- Show channels in a server with obvious read/unread state.
- Route into the channel timeline from the server view.

**Step 3: Verify**
- A signed-in user can move from server list to a channel timeline in a few taps.

---

### Task 2.2: Implement message timeline reading and sending

**Objective:** Support the core daily chat loop.

**Files:**
- Modify: `apps/mobile/src/components/chat-input.tsx`
- Modify: `apps/mobile/src/components/message-with-mentions.tsx`
- Modify: `apps/mobile/src/components/mention-autocomplete.tsx`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/lib/mention-utils.ts`
- Modify: `apps/mobile/src/components/web-badge.tsx` as needed for platform-specific messaging labels

**Step 1: Write failing tests for send/read behavior**
- Cover send message, empty compose rejection, mention parsing, and a basic reply flow.

**Step 2: Implement minimal send flow**
- Create a message composer that can send text to the active channel.
- Keep mentions and markdown rendering aligned with existing message display patterns.

**Step 3: Verify**
- Run: `cd apps/mobile && bun run typecheck`
- Run: `cd apps/mobile && bun run lint`
- Manual check: send a message in a test channel and confirm it appears in the timeline.

---

### Task 2.3: Add message actions for edit, delete, reply, mentions, and reactions

**Objective:** Reach basic parity with the web app’s message interaction model.

**Files:**
- Modify: `apps/mobile/src/components/reaction-picker.tsx`
- Modify: `apps/mobile/src/components/reaction-button.tsx`
- Modify: `apps/mobile/src/lib/reactions-client.ts`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/components/message-with-mentions.tsx`

**Step 1: Define message action entry points**
- Add a consistent action sheet or contextual menu for message actions.

**Step 2: Implement edits and deletes**
- Wire the UI to the existing message API helpers.

**Step 3: Implement reactions**
- Support add/remove reaction flow with optimistic updates when safe.

**Step 4: Verify**
- Exercise actions in a local test server and confirm the server state wins over stale client state.

---

## Phase 3: Threads, unread state, search, and deep links

### Task 3.1: Add threaded replies and thread navigation

**Objective:** Make thread entry and thread browsing work on mobile.

**Files:**
- Create or modify: `apps/mobile/src/app/thread/[serverId]/[channelId]/[messageId].tsx`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/components/message-with-mentions.tsx`

**Step 1: Define the thread route shape**
- Use the same message identifiers across search, pins, and replies.

**Step 2: Implement thread view**
- Show the parent message and its replies in one flow.

**Step 3: Verify**
- Open a thread from a channel message and confirm back navigation returns to the same context.

---

### Task 3.2: Implement unread behavior and jump-to-unread

**Objective:** Make unread counts and jump behavior trustworthy.

**Files:**
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`
- Modify: `apps/mobile/src/components/tab-placeholder-screen.tsx`
- Modify: `apps/mobile/src/components/app-tabs.tsx`

**Step 1: Add state for unread and thread-read counts**
- Keep durable read state separate from ephemeral typing state.

**Step 2: Add jump-to-unread affordances**
- When available, jump the user to the correct unread message or context.

**Step 3: Verify**
- Confirm read/unread state is stable after refresh and route changes.

---

### Task 3.3: Add message search with deep links back into context

**Objective:** Let users find a message and land in the right place, without changing the current tab-based navigation model.

**Files:**
- Create: `apps/mobile/src/app/search.tsx`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`

**Step 1: Add a search route and result list**
- Search across messages with server/channel context displayed in results.

**Step 2: Add deep-link handling**
- Open a result in the correct channel, conversation, and highlighted message context.

**Step 3: Verify**
- Search for a known message and confirm the result jumps to the target context.

---

### Task 3.4: Add realtime corrections for core state

**Objective:** Keep messages, reactions, and unread state accurate under live updates.

**Files:**
- Modify: `apps/mobile/src/providers/firepit-provider.tsx`
- Modify: `apps/mobile/src/lib/firepit/http.ts`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`

**Step 1: Wire live update handling**
- Correct message edits, deletes, reaction changes, and unread counts when events arrive out of order.

**Step 2: Validate optimistic update boundaries**
- Keep optimistic UI only where the eventual server state can safely correct it.

**Step 3: Verify**
- Test with two clients and confirm the mobile app recovers from out-of-order events.

---

## Phase 4: Media and rich content

### Task 4.1: Add image uploads and image viewing

**Objective:** Support the most common media share flow.

**Files:**
- Modify: `apps/mobile/src/components/image-viewer.tsx`
- Modify: `apps/mobile/src/components/chat-input.tsx`
- Create or modify: `apps/mobile/src/lib/firepit/uploads.ts`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`

**Step 1: Define upload helpers**
- Keep uploads separate from message creation.

**Step 2: Add compose attachment flow**
- Allow selecting an image and attaching it to the outgoing message.

**Step 3: Verify**
- Upload an image, post it, and open it in the image viewer.

---

### Task 4.2: Add file uploads and attachment rendering

**Objective:** Extend compose to non-image files.

**Files:**
- Modify: `apps/mobile/src/components/chat-input.tsx`
- Modify: `apps/mobile/src/components/message-with-mentions.tsx`
- Modify: `apps/mobile/src/lib/firepit/uploads.ts`

**Step 1: Support generic file selection**
- Reuse the upload step instead of bundling file creation into message send.

**Step 2: Render attachment metadata cleanly**
- Show filename, size, and link affordances in the message view.

**Step 3: Verify**
- Upload a non-image file and confirm it appears correctly in the timeline.

---

### Task 4.3: Add emoji and GIF-related richness where supported

**Objective:** Improve message expressiveness without blocking core chat.

**Files:**
- Modify: `apps/mobile/src/components/reaction-picker.tsx`
- Modify: `apps/mobile/src/components/emoji-renderer.tsx`
- Create or modify: `apps/mobile/src/lib/firepit/emoji.ts`

**Step 1: Confirm which rich-content features are already supported by the API**
- Prioritize the features already present in the web app.

**Step 2: Add the smallest useful picker/search UI**
- Keep it fast and mobile-native.

**Step 3: Verify**
- Confirm emoji rendering and picker behavior do not regress plain-text messaging.

---

## Phase 5: Direct messages and identity surfaces

### Task 5.1: Add DM list and conversation creation

**Objective:** Make private conversations usable on mobile.

**Files:**
- Create or modify: `apps/mobile/src/app/dm/index.tsx`
- Create or modify: `apps/mobile/src/app/dm/[conversationId].tsx`
- Modify: `apps/mobile/src/lib/firepit/messages.ts`
- Modify: `apps/mobile/src/lib/firepit/types.ts`

**Step 1: Implement the DM list route**
- Show 1:1 and group conversations.

**Step 2: Implement create/new DM flow**
- Support starting new conversations from people search or profile surfaces.

**Step 3: Verify**
- Create a new DM and send a message successfully.

---

### Task 5.2: Add profile viewing and profile enrichment

**Objective:** Show the social context Firepit already exposes on web.

**Files:**
- Create or modify: `apps/mobile/src/app/user/[userId].tsx`
- Modify: `apps/mobile/src/components/ui/avatar.tsx`
- Modify: `apps/mobile/src/components/themed-view.tsx`
- Modify: `apps/mobile/src/components/themed-text.tsx`

**Step 1: Render a user profile screen**
- Show avatar, pronouns, bio, and other sparse fields safely.

**Step 2: Add relationship state displays where needed**
- Reflect block/friend/DM context if available from the API.

**Step 3: Verify**
- Open a profile from a message author or DM participant without broken states.

---

### Task 5.3: Add people search and mention autocomplete polish

**Objective:** Make people discovery and composing mentions smoother.

**Files:**
- Modify: `apps/mobile/src/components/mention-autocomplete.tsx`
- Modify: `apps/mobile/src/lib/mention-utils.ts`
- Modify: `apps/mobile/src/components/chat-input.tsx`

**Step 1: Improve mention matching**
- Support richer display names and identity labels.

**Step 2: Add a people search surface if needed**
- Reuse the same search conventions as message search where practical.

**Step 3: Verify**
- Mention autocomplete behaves correctly in long names, duplicate names, and sparse profile data.

---

## Phase 6: Server management and moderation

### Task 6.1: Add server creation and invite-based onboarding

**Objective:** Support first-join and server ownership flows.

**Files:**
- Create or modify: `apps/mobile/src/app/create-server.tsx`
- Create or modify: `apps/mobile/src/app/invite/[inviteCode].tsx`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`

**Step 1: Add the create-server route**
- Use the instance feature flags to hide unsupported server creation entry points.

**Step 2: Add invite redemption flow**
- Resolve invite previews and join flows cleanly.

**Step 3: Verify**
- Join a server through an invite and confirm landing in the right server context.

---

### Task 6.2: Add channel organization and permission editing

**Objective:** Make server admin and channel management viable on mobile.

**Files:**
- Create or modify: `apps/mobile/src/app/server/[serverId]/channels.tsx`
- Create or modify: `apps/mobile/src/app/server/[serverId]/roles.tsx`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`
- Modify: `apps/mobile/src/lib/firepit/types.ts`

**Step 1: Implement channel management screens**
- Support create, rename, move, and delete where the API permits it.

**Step 2: Implement permissions and role editing surfaces**
- Hide inaccessible actions based on the current user’s permissions.

**Step 3: Verify**
- Confirm admin actions are not shown to users who cannot perform them.

---

### Task 6.3: Add moderation and audit surfaces where useful

**Objective:** Bring important admin utilities to mobile without cluttering the main experience.

**Files:**
- Create or modify: `apps/mobile/src/app/admin/index.tsx`
- Create or modify: `apps/mobile/src/app/admin/reports.tsx`
- Create or modify: `apps/mobile/src/app/admin/audit-log.tsx`
- Modify: `apps/mobile/src/lib/firepit/servers.ts`

**Step 1: Add admin entry points behind permission checks**
- Use feature flags and permissions to hide unsupported controls.

**Step 2: Add basic moderation flows**
- Ban, unban, mute, unmute, kick, and report review should map to existing API actions.

**Step 3: Verify**
- Make sure admin surfaces do not appear for standard users.

---

## Phase 7: Notifications, settings, diagnostics, and polish

### Task 7.1: Add push notifications and notification settings

**Objective:** Make the app useful when it is not open.

**Files:**
- Modify: `apps/mobile/src/providers/firepit-provider.tsx`
- Modify: `apps/mobile/src/app/(tabs)/settings.tsx`
- Create or modify: `apps/mobile/src/app/settings/notifications.tsx`
- Modify: `apps/mobile/src/lib/firepit/persistence.ts`

**Step 1: Wire notification registration and permission prompts**
- Keep it opt-in and explicit.

**Step 2: Add notification preference screens**
- Cover global level, DM privacy, quiet hours, and overrides when supported.

**Step 3: Verify**
- Confirm notification settings persist and can be changed later.

---

### Task 7.2: Add feature-flag-aware rendering and permission-safe UI

**Objective:** Prevent dead-end actions from showing up while preserving the existing tab structure and keeping `/explore` as the likely future redesign surface.

**Files:**
- Modify: `apps/mobile/src/providers/firepit-provider.tsx`
- Modify: `apps/mobile/src/components/app-tabs.tsx`
- Modify: `apps/mobile/src/app/(tabs)/admin.tsx`
- Modify: `apps/mobile/src/app/server/[serverId].tsx`
- Modify: `apps/mobile/src/app/server/messages/[serverId]/[channelId].tsx`

**Step 1: Centralize permission checks**
- Gate actions before they are shown.

**Step 2: Centralize feature-flag checks**
- Hide unsupported entry points, especially user-created server support if disabled.

**Step 3: Verify**
- The UI should not expose actions that only fail after tap.

---

### Task 7.3: Accessibility, resilience, and list performance pass

**Objective:** Make the app dependable and comfortable to use.

**Files:**
- Modify: `apps/mobile/src/components/*.tsx` as needed
- Modify: `apps/mobile/src/components/ui/*.tsx` as needed
- Modify: `apps/mobile/src/app/**/*.tsx` as needed

**Step 1: Audit interactive controls**
- Ensure labels, focus order, and readable state are present.

**Step 2: Improve list resilience**
- Make channel, server, and message lists tolerate partial hydration and refreshes.

**Step 3: Verify**
- Run: `cd apps/mobile && bun run typecheck`
- Run: `cd apps/mobile && bun run lint`
- Manual pass on Android and web to confirm parity and layout stability.

---

## Suggested milestone order for implementation PRs

Use Graphite to stack these as a series of small dependent PRs rather than one large branch. Each phase should generally land as one stack layer, with the next phase building on top of the previous one where dependencies require it.

1. Bootstrap, auth, and route cleanup
2. Server/channel browsing
3. Message compose and actions
4. Threads, unread, and search
5. Media uploads
6. DMs and profiles
7. Server management and moderation
8. Notifications and polish

---

## Definition of done for the mobile baseline

The mobile app is ready for everyday use when a signed-in user can:
- boot into the correct instance and restore their session
- switch servers and channels
- read and send messages
- edit, delete, reply, and react to messages
- follow thread links and search links back to the right context
- see unread state accurately
- use DMs and basic profile surfaces
- receive and configure notifications
- avoid broken or permissionless action surfaces

---

## Verification commands

Use these throughout the plan:

```bash
cd apps/mobile && bun run typecheck
cd apps/mobile && bun run lint
cd apps/mobile && bun run start
cd apps/mobile && bun run android
cd apps/mobile && bun run ios
```

---

## Notes

- Preserve Firepit vocabulary; do not rename servers/channels/conversations into generic chat-app terms.
- Keep mobile route identifiers aligned with the web app’s context semantics.
- Treat server data as authoritative for membership, permissions, unread state, and message mutation results.
- Keep uploads separate from message creation.
- Prefer hiding unsupported actions over showing dead-end controls.
