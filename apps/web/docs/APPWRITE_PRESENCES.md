---
layout: article
title: Presences
description: Use the Appwrite Presences API to track which users are currently active, broadcast their status, and subscribe to live presence updates over Realtime.
---

The Appwrite **Presences API** tracks which users are currently active in your app and lets every connected client see those statuses in realtime. You can use it to render online indicators next to teammates, show who is viewing a document, broadcast a "typing" status in a chat, or surface "looking at the same page" cues during collaboration.

A presence is a short-lived record tied to a user. Each record carries a `userId`, a `status` string (for example `online`, `away`, `editing`), an optional `metadata` JSON object for richer context (a cursor position, the document the user is viewing, the device they are on), and an `expiresAt` timestamp that controls when the record is automatically cleaned up.

Presences are exposed as both a regular HTTP resource and a [Realtime](/docs/apis/realtime) channel, so the same record can be written by any client or server SDK and read live by every subscriber that has permission.

# How it works {% #how-it-works %}

A presence has two sides that are always in sync.

**It is durable.** When you write a presence, it sticks around until it expires or you delete it. That means you can `list()` presences at any time to see who is online right now, including from a server-side function, without having to keep a Realtime connection open.

**It is live.** Every change to a presence fires an event on the `presences` and `presences.<PRESENCE_ID>` [Realtime](/docs/apis/realtime) channels. Subscribers get `upsert`, `update`, and `delete` events in milliseconds, over the same Realtime connection they are already using for rows and files.

A typical "online dot" loop looks like this:

1. Client A signs in and calls `presences.upsert({...})`. An `upsert` event fires on the presence channels.
2. Client B, subscribed to `Channel.presences()`, receives the event and shows A as online.
3. Client A keeps the record alive by upserting again on focus, route change, or a periodic timer, which slides `expiresAt` forward.
4. When `expiresAt` passes, the record is removed and a `delete` event fires. B drops A from its list.
5. If A signs out cleanly, they call `presences.delete(...)` and the `delete` event fires immediately, no waiting on expiry.

This gives you two ways to keep a presence alive, and you pick whichever fits your UI:

- **Heartbeat.** Upsert on focus, route change, or a periodic timer to push `expiresAt` forward. Best when presence should persist briefly across short disconnects (a quick network blip, a tab switch) or when you write presence from server code that has no live socket.
- **While connected.** Call `realtime.upsertPresence(...)` over an open Realtime connection and the record is automatically deleted when that connection closes. Best for "online while the tab is open" UIs where you do not want to manage a heartbeat yourself.

The `realtime.upsertPresence(...)` call mirrors the REST `presences.upsert(...)` signature, but the record's lifetime is tied to the WebSocket rather than to `expiresAt`:

```client-web
import { Client, Realtime, ID, Permission, Role } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const realtime = new Realtime(client);

await realtime.upsertPresence({
    presenceId: ID.unique(),
    status: 'online',
    permissions: [
        Permission.read(Role.users())
    ]
});
```

The SDK remembers the latest payload and re-sends it after a reconnect, so a brief network drop will not flip the user offline. There is no heartbeat to manage. The record disappears automatically the moment the WebSocket closes for good (tab close, sign out, sustained network loss).

# Upsert a presence {% #upsert-a-presence %}

`upsert` creates a presence or updates the existing record with the same `presenceId`. Call it on every page navigation, focus change, or heartbeat without worrying about duplicates. From a client session, `userId` is inferred from the signed-in user; from a server SDK with an API key, pass `userId` explicitly. Server SDKs need an [API key](/docs/advanced/platform/api-keys) with the `presences.write` scope.

{% multicode %}

```client-web
import { Client, Presences, ID, Permission, Role } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

const presence = await presences.upsert({
    presenceId: ID.unique(),
    status: 'online',
    metadata: { page: '/dashboard' },
    permissions: [
        Permission.read(Role.users())
    ]
});
```

```server-nodejs
const sdk = require('node-appwrite');
const { Permission, Role } = sdk;

const client = new sdk.Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<YOUR_PROJECT_ID>')
    .setKey('<YOUR_API_KEY>');

const presences = new sdk.Presences(client);

const presence = await presences.upsert({
    presenceId: '<PRESENCE_ID>',
    userId: '<USER_ID>',
    status: 'online',
    permissions: [
        Permission.read(Role.users())
    ]
});
```

{% /multicode %}

A few notes on the parameters:

- `presenceId` (**required**) is the unique ID of the presence record. Use `ID.unique()` on first creation and persist it for subsequent updates so the same record is reused for the same user across sessions.
- `status` (**required**) is a free-form string up to 256 characters. There are no reserved values, so pick whatever vocabulary fits your app (`online`, `away`, `busy`, `editing`, `typing`).
- `userId` is set automatically from the authenticated session on client SDKs and is required on server SDKs.
- `metadata` is an arbitrary JSON object. Use it to carry any context that subscribers should see together with the status.
- `expiresAt` is optional. Without it, Appwrite applies a default TTL (see [Expiry and cleanup](#expiry-and-cleanup) below).
- `permissions` controls who can read or modify the presence record, the same way it works on rows and files. Without permissions, only the owner and project keys can see it.

# Get a presence {% #get-a-presence %}

Fetch a single presence by its `presenceId`. Records whose `expiresAt` is in the past are treated as not found.

{% multicode %}

```client-web
import { Client, Presences } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

const presence = await presences.get({
    presenceId: '<PRESENCE_ID>'
});
```

```server-nodejs
const sdk = require('node-appwrite');

const client = new sdk.Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<YOUR_PROJECT_ID>')
    .setKey('<YOUR_API_KEY>');

const presences = new sdk.Presences(client);

const presence = await presences.get({
    presenceId: '<PRESENCE_ID>'
});
```

{% /multicode %}

# List presences {% #list-presences %}

`list` returns the active set. Expired records are filtered out automatically, so the response is always "who is here right now". Pass [Queries](/docs/products/databases/queries) to filter by `status`, `userId`, or any indexed field, and pass `ttl` to cache the response server-side for a configurable number of seconds.

{% multicode %}

```client-web
import { Client, Presences, Query } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

const result = await presences.list({
    queries: [Query.equal('status', ['online'])]
});
```

```server-nodejs
const sdk = require('node-appwrite');

const client = new sdk.Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<YOUR_PROJECT_ID>')
    .setKey('<YOUR_API_KEY>');

const presences = new sdk.Presences(client);

const result = await presences.list({
    queries: [sdk.Query.equal('status', ['online'])]
});
```

{% /multicode %}

# Update a presence {% #update-a-presence %}

`update` patches a subset of fields on an existing record without re-sending the whole payload. Every field except `presenceId` is optional, so a "go away" handler only needs to send `status`. **One naming difference to watch for:** the method is named `update` on client SDKs and `updatePresence` (with each language's case convention) on server SDKs, where it also requires `userId`. This is the only point at which the client and server surfaces diverge.

{% multicode %}

```client-web
import { Client, Presences } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

const presence = await presences.update({
    presenceId: '<PRESENCE_ID>',
    status: 'away'
});
```

```server-nodejs
const sdk = require('node-appwrite');

const client = new sdk.Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<YOUR_PROJECT_ID>')
    .setKey('<YOUR_API_KEY>');

const presences = new sdk.Presences(client);

const presence = await presences.updatePresence({
    presenceId: '<PRESENCE_ID>',
    userId: '<USER_ID>',
    status: 'away'
});
```

{% /multicode %}

# Delete a presence {% #delete-a-presence %}

`delete` removes a record immediately and fires a `delete` event on the presence channels. Use it when you want a user to go offline without waiting for `expiresAt` to elapse, for example on sign out or admin force-offline.

{% multicode %}

```client-web
import { Client, Presences } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

await presences.delete({
    presenceId: '<PRESENCE_ID>'
});
```

```server-nodejs
const sdk = require('node-appwrite');

const client = new sdk.Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<YOUR_PROJECT_ID>')
    .setKey('<YOUR_API_KEY>');

const presences = new sdk.Presences(client);

await presences.delete({
    presenceId: '<PRESENCE_ID>'
});
```

{% /multicode %}

# Subscribe to presence updates {% #subscribe-to-presence-updates %}

Presence is most useful when other clients can react to it live. Use the `Channel.presences()` helper to subscribe to the global presences channel, or `Channel.presence('<PRESENCE_ID>')` to follow a single record. All Realtime subscriptions are gated by the [permissions system](/docs/advanced/platform/permissions), so a client will only receive updates for presences it has permission to read.

```client-web
import { Client, Realtime, Channel } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const realtime = new Realtime(client);

const subscription = await realtime.subscribe(Channel.presences(), response => {
    if (response.events.includes('presences.*.delete')) {
        console.log('Presence expired or removed', response.payload);
    } else if (response.events.includes('presences.*.upsert') || response.events.includes('presences.*.update')) {
        console.log('Presence created or updated', response.payload);
    }
});
```

The `events` array follows the same pattern as every other Appwrite resource:

- `presences.*.upsert` and `presences.<PRESENCE_ID>.upsert` for the unified create-or-update path that fires on every `upsert()` call.
- `presences.*.update` and `presences.<PRESENCE_ID>.update` for status, metadata, or expiry changes made via the REST `update()` operation.
- `presences.*.delete` and `presences.<PRESENCE_ID>.delete` for records that were deleted explicitly or expired automatically.

Note that there is no separate `create` event, the `upsert` event covers both first-time creation and subsequent writes.

This gives you a clean signal for "user just came online", "user changed status", and "user went offline", without writing any custom socket logic.

# Presence channels {% #presence-channels %}

{% table %}

- Channel
- Channel Helper
- Description

---

- `presences`
- `Channel.presences()`
- Any upsert, update, or delete event on any presence the subscriber can read.

---

- `presences.<ID>`
- `Channel.presence('<PRESENCE_ID>')`
- Any upsert, update, or delete event on a specific presence record.
  {% /table %}

You can also append `.upsert()`, `.update()`, or `.delete()` to `Channel.presence('<PRESENCE_ID>')` to narrow the stream to a single event type, identical to how channel filters work on every other resource.

# Expiry and cleanup {% #expiry-and-cleanup %}

Every presence carries an `expiresAt` timestamp. Once that time passes, Appwrite removes the record automatically and emits a `delete` event on the presence channels, so subscribers can react to "user went offline" without any explicit signal from the client that owned the presence.

You can pass an explicit `expiresAt` up to **30 days in the future**. If you omit it, Appwrite applies a sensible default that fits the typical heartbeat pattern: keep upserting the presence every few seconds while the user is active, and let it expire naturally a short time after the last heartbeat.

```client-web
import { Client, Presences, ID, Permission, Role } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

const presence = await presences.upsert({
    presenceId: ID.unique(),
    status: 'online',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    permissions: [
        Permission.read(Role.users())
    ]
});
```

To remove a presence immediately, for example on sign out or when the user closes a document, use the [Delete a presence](#delete-a-presence) operation above.

# Permissions and scopes {% #permissions-and-scopes %}

Presences use the standard Appwrite [permissions system](/docs/advanced/platform/permissions). Set read permissions on a presence to control who can subscribe to it:

- `Role.any()` makes the presence visible to anyone, including unauthenticated visitors.
- `Role.users()` restricts visibility to signed-in users.
- `Role.team('<TEAM_ID>')` shares the presence with a specific team, which is the right choice for collaboration features where only teammates should see each other's status.

Pass a `permissions` array to `upsert()` to attach roles to a presence. For example, to make a presence visible only to a specific team:

```client-web
import { Client, Presences, ID, Permission, Role } from "appwrite";

const client = new Client()
    .setEndpoint('https://<REGION>.cloud.appwrite.io/v1')
    .setProject('<PROJECT_ID>');

const presences = new Presences(client);

const presence = await presences.upsert({
    presenceId: ID.unique(),
    status: 'online',
    permissions: [
        Permission.read(Role.team('<TEAM_ID>'))
    ]
});
```

Server SDKs need an API key with the `presences.read` scope to list or read presences, and `presences.write` to upsert or delete them. Client sessions can always update their own presence without an extra scope.

If you do not pass a `permissions` array when upserting a presence, Appwrite defaults to giving read access only to the user who created it, so no other client can subscribe to it. To share a presence more broadly, you must set permissions explicitly.

# Use cases {% #use-cases %}

The Presences API is a good fit any time you need to render "who is here right now" rather than "what has been written to storage":

- **Online indicators** in a directory or contacts list
- **Collaboration cursors** that show which document or section each teammate is viewing
- **Typing indicators** in chat or comment threads
- **Live attendee lists** for live streams, classrooms, or shared dashboards
- **Locking signals** that warn a teammate when someone else is already editing a row

For longer-lived state, like a user's profile or settings, use [account preferences](/docs/products/auth/preferences) or a row in your database instead. Presence is intentionally short-lived and self-cleaning.

# Related {% #related %}

- [Realtime overview](/docs/apis/realtime)
- [Realtime channels reference](/docs/apis/realtime/channels)
- [Realtime payload structure](/docs/apis/realtime/payload)
- [Authentication: Presences](/docs/products/auth/presences)
