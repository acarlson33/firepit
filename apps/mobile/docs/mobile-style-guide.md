# Firepit Mobile Style Guide

This guide is for the model that will implement the separate mobile app. The goal is to stay behaviorally aligned with Firepit, not to invent a new product language.

## Product Vocabulary

- Use the existing Firepit nouns: servers, channels, categories, conversations, threads, pins, reactions, mentions, roles, invites, and moderation.
- Do not rename the core data model into generic chat-app terms like rooms, chats, or spaces unless the mobile UI explicitly needs a label translation.
- Keep the web app's permission model and feature-flag model intact.

## Source-Of-Truth Rules

- If the route handler, OpenAPI file, and product docs disagree, trust the handler first.
- Do not create new backend contract shapes on the mobile side just because a screen needs them.
- Treat server responses as authoritative for membership, permissions, unread counts, pinned state, and message mutation results.
- Normalize partial payloads locally instead of failing the screen.

## Data Handling

- Assume nullable profile fields are normal.
- Treat older records as potentially sparse and missing newer enrichments.
- Never reject a payload just because one optional appearance, status, or profile field is absent.
- Keep message attachments separate from message creation, because uploads are a distinct step.

## Navigation And Deep Linking

- Preserve the same context identifiers across the app: `server`, `channel`, `conversation`, `messageId`, `parentMessageId`, and `highlight`.
- Search, pins, and thread entry should all land on the same message navigation path.
- When a target message is unavailable, degrade to context-level navigation instead of failing hard.
- Keep unread jump behavior aligned across channels and direct messages.

## Realtime And State

- Use optimistic updates where they improve responsiveness, but let the server and realtime events correct the final state.
- Expect message, reaction, typing, presence, and unread updates to arrive out of order.
- Separate durable read state from ephemeral typing state.
- Use the inbox and thread-read endpoints as the source of truth for unread behavior.

## Permissions And Feature Flags

- Hide or disable actions when the current user lacks permission or when a feature flag is off.
- Do not surface fallback flows that only fail after the user taps them.
- Respect instance-level controls such as `allow_user_servers` and `defaultOnSignup`.
- Treat moderation, role editing, and audit history as permissioned surfaces, not always-on UI.

## UI Behavior

- Prefer mobile-native navigation stacks, bottom sheets, and contextual action panels over web-style modal layering.
- Keep compose flows fast and compact, especially for replies, reactions, and invite joins.
- Make destructive actions explicit and confirm them when the web UI does the same.
- Keep lists scrollable and resilient to partial hydration.

## Accessibility

- Every interactive control needs a clear label and a reachable focus order.
- Do not depend on visual state alone to communicate unread, muted, blocked, or private state.
- Provide readable labels for emoji reactions, mute toggles, invite actions, and moderation controls.

## Implementation Priorities

- First implement the flows that already exist in the web app and are core to using Firepit day to day.
- Second add the management and social features that make the product feel complete.
- Third bring across admin and diagnostic views where they are useful on mobile.

## Things The Model Should Avoid

- Do not add voice, video, or screen sharing as implied parity work. They are not part of the current web app.
- Do not rely on debug or test routes in the mobile product.
- Do not assume that every web preference or desktop setting has a mobile equivalent.
- Do not hardcode UI strings that contradict the current route semantics or permission checks.
