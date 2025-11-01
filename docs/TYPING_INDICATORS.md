# Typing Indicators - Technical Documentation

## Overview

Typing indicators show real-time feedback when users are actively composing messages in a channel or direct message (DM) conversation. This feature uses Appwrite's realtime subscription system to broadcast typing status across all connected clients.

## Architecture

### Components

1. **Client-side typing detection** (`useMessages` and `useDirectMessages` hooks)

    - Monitors input field changes
    - Sends typing status to server
    - Debounces rapid typing events
    - Supports both channels (channelId) and DMs (conversationId)

2. **Realtime subscription** (`useMessages` and `useDirectMessages` hooks)

    - Subscribes to typing collection events
    - Updates UI when other users start/stop typing
    - Filters events by channel/conversation and user

3. **Server-side API** (`/api/typing` route)
    - Stores ephemeral typing documents
    - Uses deterministic document IDs for upsert pattern
    - Auto-cleanup through client-side timeout
    - Accepts both channelId (channels) and conversationId (DMs)

### Data Flow

```
User types in input field
    ↓
Debounced typing event (400ms)
    ↓
setTyping(userId, channelId, userName, true)
    ↓
Create/Update typing document in Appwrite
    ↓
Realtime event broadcast to all subscribers
    ↓
Other clients receive update
    ↓
Update typingUsers state
    ↓
Display "User is typing..." indicator
```

## Implementation Details

### Typing Document Structure

```typescript
{
  $id: string;          // Deterministic: hashTypingKey(userId, contextId)
  userId: string;       // User who is typing
  userName?: string;    // Display name of user
  channelId: string;    // Channel ID (for channels) or conversation ID (for DMs)
  updatedAt: string;    // ISO timestamp of last update
}
```

**Note**: For backward compatibility, both channels and DMs store their context identifier in the `channelId` field. For channels, this is the actual channel ID. For DMs, this is the conversation ID.

### Permissions

-   **Read**: `Role.any()` - All users can see who is typing
-   **Update**: Creator only - Users can only update their own status
-   **Delete**: Creator only - Users can only delete their own status

### Key Features

#### 1. Debouncing

-   **Start debounce**: 400ms - Prevents rapid "started typing" events
-   **Stop timeout**: 2500ms - Automatically sends "stopped" after idle period

#### 2. Filtering

-   **Context filtering**: Only shows typing users in current channel or DM conversation
-   **Self-filtering**: Doesn't show "You are typing" to yourself

#### 3. Stale Cleanup

-   **Client-side**: Removes typing indicators older than 5 seconds
-   **Frequency**: Checks every 1 second
-   **Purpose**: Handles disconnections and missed delete events

#### 4. Display Limits

-   **Maximum shown**: 3 users (configurable via `maxTypingDisplay`)
-   **Overflow**: Shows "User1, User2, User3 and others are typing..."

## Error Handling

### Expected Errors (Gracefully Handled)

1. **404 Not Found**

    - First update attempt when document doesn't exist
    - Handled by fallback to create operation

2. **401 Unauthorized**

    - User tries to update another user's typing status
    - Swallowed silently as typing is ephemeral

3. **Network errors**
    - Subscription failures are caught and ignored
    - UI continues to work without typing indicators

### Error Recovery

All errors in the typing system are non-fatal and don't affect core messaging functionality:

```typescript
try {
    await setTyping(userId, channelId, userName, isTyping);
} catch {
    // swallow; ephemeral - typing indicators are nice-to-have
}
```

## Performance Considerations

### Subscription Pooling

-   Single shared Appwrite client for all subscriptions
-   Reference counting prevents premature connection cleanup
-   Managed by `realtime-pool.ts`

### Network Efficiency

-   Debounced updates reduce network traffic
-   Upsert pattern (update first, fallback to create) minimizes writes
-   Auto-cleanup prevents database bloat

### UI Optimization

-   State updates only when changes occur (prevents re-renders)
-   Filtered events at subscription level (not in render)
-   Optimistic typing detection (no server round-trip to start showing local typing)

## Testing

### Unit Tests

**Typing API Tests**: `src/__tests__/api-routes/typing.test.ts`

-   POST endpoint authentication and validation
-   DELETE endpoint authentication and validation
-   channelId and conversationId parameter support
-   Error handling for missing typing collection

**DM Typing Tests**: `src/__tests__/dm-typing-indicators.test.ts`

-   DM typing subscription setup
-   Event parsing and filtering for conversations
-   State management for DM typing users
-   Stale indicator cleanup for DMs

**Channel Typing Tests**: `src/__tests__/typing-subscription.test.ts`

-   Subscription setup and teardown
-   Event parsing and validation
-   State management (add, update, remove)
-   Channel filtering
-   User filtering
-   Stale indicator cleanup

Run tests:

```bash
bun run test src/__tests__/api-routes/typing.test.ts
bun run test src/__tests__/dm-typing-indicators.test.ts
bun run test src/__tests__/typing-subscription.test.ts
```

### Manual Testing

#### Channels

1. **Basic typing**: Type in a channel, verify indicator appears for other users
2. **Stop typing**: Stop typing, verify indicator disappears after 2.5s
3. **Channel switch**: Switch channels, verify indicators reset
4. **Multiple users**: Have 3+ users type simultaneously, verify display limit
5. **Stale cleanup**: Disconnect while typing, verify cleanup after 5s

#### Direct Messages

1. **DM typing**: Type in a DM conversation, verify indicator appears for the other user
2. **DM stop typing**: Stop typing in a DM, verify indicator disappears after 2.5s
3. **DM switch**: Switch between DM conversations, verify indicators reset
4. **DM stale cleanup**: Disconnect while typing in a DM, verify cleanup after 5s

## Configuration

### Environment Variables

```bash
# Required for typing indicators
APPWRITE_TYPING_COLLECTION_ID=typing

# These are also required
APPWRITE_DATABASE_ID=main
APPWRITE_ENDPOINT=https://your-instance.appwrite.io/v1
APPWRITE_PROJECT_ID=your-project-id
```

### Setup

The typing collection is automatically created by the setup script:

```bash
bun run setup
```

This creates:

-   Collection: `typing`
-   Attributes: `userId`, `userName`, `channelId`, `updatedAt`
-   Indexes: `idx_channel`, `idx_updated`

## Troubleshooting

### Typing indicators not appearing

1. **Check environment variables**: Ensure `APPWRITE_TYPING_COLLECTION_ID` is set
2. **Check collection exists**: Run `bun run setup` to create it
3. **Check permissions**: Verify collection has public read permissions
4. **Check browser console**: Look for subscription errors

### Indicators stuck (not clearing)

1. **Check stale cleanup**: Should auto-remove after 5 seconds
2. **Check console errors**: Look for delete operation failures
3. **Refresh page**: This will reset the subscription

### 404 or 401 errors in console

These are normal and expected! The typing system uses a try-update-fallback-create pattern that generates harmless 404 errors on first typing event. All errors are caught and don't affect functionality.

## Future Enhancements

Potential improvements for future versions:

1. **Server-side TTL**: Use Appwrite scheduled functions to auto-delete old typing docs
2. **Typing speed indicator**: Show fast/slow typing animations
3. **Rich typing status**: Show "typing a reply" vs "editing message"
4. **Per-channel typing limits**: Prevent typing indicator spam in busy channels
5. **Typing analytics**: Track average typing time, most active typers, etc.

## Related Files

### Channel Typing

-   `/src/app/chat/hooks/useMessages.ts` - Channel typing logic
-   `/src/lib/appwrite-messages.ts` - `setTyping()` function for channels

### DM Typing

-   `/src/app/chat/hooks/useDirectMessages.ts` - DM typing logic
-   `/src/app/chat/components/DirectMessageView.tsx` - DM UI with typing indicators

### API and Infrastructure

-   `/src/app/api/typing/route.ts` - Typing status API (supports both channels and DMs)
-   `/src/lib/realtime-pool.ts` - Subscription pooling

### Tests

-   `/src/__tests__/api-routes/typing.test.ts` - API route tests
-   `/src/__tests__/dm-typing-indicators.test.ts` - DM typing tests
-   `/src/__tests__/typing-subscription.test.ts` - Channel typing tests

### Setup

-   `/scripts/setup-appwrite.ts` - Collection setup
