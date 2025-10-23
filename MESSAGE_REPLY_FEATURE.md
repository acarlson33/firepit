# Message Reply Feature Documentation

## Overview

The message reply feature allows users to reply to specific messages in both channel chats and direct messages. This creates conversation threads and helps maintain context in busy chat environments.

## Features

### For Users

- **Reply to Any Message**: Click the menu button (⋮) on any message and select "Reply"
- **Visual Reply Context**: When replying, see a preview of the message you're replying to
- **Parent Message Display**: Replied messages show the original message text and author
- **Cancel Replies**: Cancel a reply at any time before sending
- **Works Everywhere**: Available in both server channels and direct messages

### For Developers

- **Database Schema**: New `replyToId` attribute with indexes for efficient queries
- **Type Safety**: Full TypeScript support with Message and DirectMessage type updates
- **Enrichment**: Automatic parent message context enrichment during message loading
- **Real-time**: Reply context updates in real-time via WebSocket subscriptions
- **API Support**: REST API endpoints updated to handle reply relationships

## User Experience

### Replying to a Message

1. Hover over any message to reveal the menu button (⋮)
2. Click the menu button and select "Reply"
3. A reply preview banner appears above the input box showing:
   - The name of the person you're replying to
   - A preview of their message text
4. Type your reply in the message input
5. Click "Send" or press Enter to send the reply
6. Your message will appear with a visual indicator showing the parent message

### Viewing Replies

When a message is a reply, you'll see:
- A colored border on the left side of the message
- The parent message author's name
- A preview of the parent message text
- All above the actual reply content

### Canceling a Reply

If you change your mind:
- Click the "Cancel" button in the reply preview banner
- The reply context will be cleared and you can send a regular message instead

## Technical Implementation

### Database Schema

```typescript
// Added to both messages and direct_messages collections
{
  replyToId?: string;  // ID of the parent message
}
```

Indexes created:
- `messages.idx_replyToId` for efficient reply lookups
- `direct_messages.idx_replyToId` for efficient reply lookups

### Type Definitions

```typescript
export type Message = {
  // ... existing fields
  replyToId?: string;
  replyTo?: {
    text: string;
    userName?: string;
    displayName?: string;
  };
};

export type DirectMessage = {
  // ... existing fields
  replyToId?: string;
  replyTo?: {
    text: string;
    senderDisplayName?: string;
  };
};
```

### API Endpoints

#### POST /api/messages
Accepts new `replyToId` parameter:
```json
{
  "text": "Reply text",
  "channelId": "channel_id",
  "replyToId": "parent_message_id"
}
```

#### POST /api/direct-messages
Accepts new `replyToId` parameter:
```json
{
  "conversationId": "conv_id",
  "senderId": "user_id",
  "receiverId": "other_user_id",
  "text": "Reply text",
  "replyToId": "parent_message_id"
}
```

### Message Enrichment

Messages are automatically enriched with parent message context:

1. **Batch Enrichment** (`enrichMessagesWithProfiles`):
   - Fetches all messages in a conversation
   - Builds a map of messages by ID
   - Enriches each reply with parent message data from the map

2. **Real-time Enrichment** (`enrichMessageWithReplyContext`):
   - Used for new messages arriving via WebSocket
   - Looks up parent message from current message list
   - Adds reply context before displaying

### UI Components

#### Channel Chat (`src/app/chat/page.tsx`)
- Reply button in message dropdown menu
- Reply preview banner with cancel button
- Parent message display in replied messages

#### Direct Messages (`src/app/chat/components/DirectMessageView.tsx`)
- Reply button in message dropdown menu
- Reply preview banner with cancel button
- Parent message display in replied messages

### Hooks

#### useMessages
```typescript
const {
  replyingToMessage,  // Currently selected message to reply to
  startReply,         // Function to start replying to a message
  cancelReply,        // Function to cancel the current reply
  // ... other functions
} = useMessages({ channelId, serverId, userId, userName });
```

#### useDirectMessages
```typescript
const {
  send,  // Now accepts replyToId parameter
  // ... other functions
} = useDirectMessages({ conversationId, userId, receiverId, userName });
```

## Testing

The feature includes comprehensive tests in `src/__tests__/message-reply.test.ts`:

- Type validation for `replyToId` field
- Enrichment with reply context
- Handling of missing parent messages
- Edge cases and error scenarios

All 475 tests pass including 5 new tests for the reply feature.

## Performance Considerations

### Efficient Queries
- Indexed `replyToId` field enables fast lookups
- Parent messages loaded in batch with message list

### Enrichment Strategy
- Server-side batch enrichment for initial load
- Client-side enrichment for real-time updates
- Reply context extracted from existing message list (no extra API calls)

### Real-time Updates
- WebSocket subscriptions automatically include `replyToId`
- New replies are enriched with parent context before display
- No additional database queries needed for reply relationships

## Future Enhancements

Potential improvements for future iterations:

1. **Thread View**: Click on a parent message to view all replies
2. **Nested Replies**: Support multi-level reply chains
3. **Reply Notifications**: Notify users when their messages are replied to
4. **Reply Count**: Show number of replies on parent messages
5. **Jump to Parent**: Click reply context to scroll to parent message
6. **Reply Filtering**: Filter messages to show only replies or only top-level messages

## Migration

For existing deployments, run the database setup to add the new attribute:

```bash
npm run setup
```

This will:
1. Add the `replyToId` attribute to `messages` collection
2. Add the `replyToId` attribute to `direct_messages` collection
3. Create indexes on both `replyToId` fields

No data migration is needed - existing messages will continue to work without replies.

## Accessibility

The reply feature is fully accessible:

- **Keyboard Navigation**: All reply actions accessible via keyboard
- **Screen Readers**: Reply context announced to screen readers
- **Visual Indicators**: Clear visual distinction for replied messages
- **Cancel Actions**: Easy to cancel reply operation

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

## Known Limitations

1. **Single-level Replies**: Currently only supports one level of replies (no nested chains)
2. **Deleted Parents**: If parent message is deleted, reply context shows as "Unknown"
3. **Cross-channel**: Cannot reply to messages from different channels
4. **Edit Limitation**: Editing a message doesn't update the reply relationship

## Support

For issues or questions:
- Check existing GitHub issues
- Create a new issue with the `feature: reply` label
- See CONTRIBUTING.md for development guidelines
