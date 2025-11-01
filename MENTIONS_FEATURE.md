# @Mentions Feature Implementation

## Overview

This document describes the implementation of @mentions functionality for both server channels and direct messages in the QPC application.

## Status: Backend Complete, UI Integration Pending

✅ **Completed:**

-   Type definitions extended with `mentions?: string[]`
-   Mention parsing utilities created
-   Autocomplete component created
-   Message rendering component created
-   API endpoints updated to accept and store mentions
-   Message sending functions updated to parse mentions

⏳ **Pending:**

-   Database schema update (add `mentions` attribute to collections)
-   Integrate MentionAutocomplete into chat input UI
-   Update message rendering to use MessageWithMentions component
-   Realtime subscription handling for mentions field
-   Optional: Notification system for mentioned users

## Architecture

### Type Definitions

**File:** `src/lib/types.ts`

Extended both `Message` and `DirectMessage` types with:

```typescript
mentions?: string[];
```

This field stores an array of usernames (without the @ symbol) that were mentioned in the message.

### Mention Parsing Utilities

**File:** `src/lib/mention-utils.ts`

Provides comprehensive mention parsing functionality:

-   **`parseMentions(text: string)`** - Parses text and returns array of mention objects with position, length, and username
-   **`extractMentionedUsernames(text: string)`** - Extracts just the usernames from @mentions
-   **`getMentionAtCursor(text: string, cursorPosition: number)`** - Gets the mention being typed at cursor position
-   **`replaceMentionAtCursor(text: string, cursorPosition: number, username: string)`** - Replaces partial mention with full @mention

**Regex Pattern:** `/@([a-zA-Z][a-zA-Z0-9_-]*)/g`

-   Matches @username patterns
-   Username must start with a letter
-   Can contain letters, numbers, hyphens, underscores

### UI Components

#### MentionAutocomplete

**File:** `src/components/mention-autocomplete.tsx`

Interactive autocomplete dropdown for @mentions:

-   Filters users by display name as user types
-   Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
-   Shows user avatar and display name
-   Positions below cursor
-   Highlights selected item

**Props:**

```typescript
{
  query: string;              // Current search query (text after @)
  users: UserProfileData[];   // Available users to mention
  position: { top: number; left: number };
  onSelect: (username: string) => void;
  onClose: () => void;
}
```

#### MessageWithMentions

**File:** `src/components/message-with-mentions.tsx`

Renders message text with highlighted @mentions:

-   Highlights current user's mentions differently (bg-blue-500)
-   Shows user profile on mention hover
-   Other mentions use subtle background (bg-gray-700)
-   Preserves original message formatting

**Props:**

```typescript
{
    text: string; // Message text
    currentUserId: string; // Current user's ID to highlight their mentions
}
```

### API Endpoints

#### Channel Messages

**File:** `src/app/api/messages/route.ts`

**POST /api/messages**

Updated request body to accept:

```typescript
{
  text: string;
  channelId: string;
  serverId?: string;
  imageFileId?: string;
  imageUrl?: string;
  replyToId?: string;
  mentions?: string[];  // NEW
}
```

Stores mentions in database if provided:

```typescript
if (mentions && Array.isArray(mentions) && mentions.length > 0) {
    messageData.mentions = mentions;
}
```

#### Direct Messages

**File:** `src/app/api/direct-messages/route.ts`

**POST /api/direct-messages**

Updated request body to accept:

```typescript
{
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  imageFileId?: string;
  imageUrl?: string;
  replyToId?: string;
  mentions?: string[];  // NEW
}
```

Same storage logic as channel messages.

### Client-Side Message Sending

#### Channel Messages

**File:** `src/app/chat/hooks/useMessages.ts`

The `send()` function now:

1. Extracts mentioned usernames from message text using `extractMentionedUsernames(value)`
2. Includes mentions array in API request if any found
3. Sends `undefined` if no mentions to keep payload clean

```typescript
const mentions = extractMentionedUsernames(value);

const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        text: value,
        channelId,
        serverId: serverId || undefined,
        imageFileId,
        imageUrl,
        replyToId,
        mentions: mentions.length > 0 ? mentions : undefined,
    }),
});
```

#### Direct Messages

**File:** `src/lib/appwrite-dms-client.ts`

The `sendDirectMessage()` function now:

1. Extracts mentioned usernames from message text
2. Includes mentions array in API request

```typescript
const mentions = extractMentionedUsernames(text);

const response = await fetch("/api/direct-messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        conversationId,
        senderId,
        receiverId,
        text,
        imageFileId,
        imageUrl,
        replyToId,
        mentions: mentions.length > 0 ? mentions : undefined,
    }),
});
```

## Database Schema

### Required Attribute Addition

You need to add the `mentions` attribute to both collections via Appwrite Console or migration script:

**Collection:** `messages`

-   Attribute Key: `mentions`
-   Type: String Array
-   Required: No
-   Array: Yes
-   Size: 64 (max username length)

**Collection:** `direct_messages`

-   Attribute Key: `mentions`
-   Type: String Array
-   Required: No
-   Array: Yes
-   Size: 64 (max username length)

### Migration Script Example

```typescript
import { databases } from "@/lib/appwrite-server";
import {
    DATABASE_ID,
    MESSAGES_COLLECTION,
    DIRECT_MESSAGES_COLLECTION,
} from "@/lib/appwrite-core";

async function addMentionsAttribute() {
    // Add to messages collection
    await databases.createStringAttribute(
        DATABASE_ID,
        MESSAGES_COLLECTION,
        "mentions",
        64,
        false, // not required
        undefined, // no default
        true // is array
    );

    // Add to direct_messages collection
    await databases.createStringAttribute(
        DATABASE_ID,
        DIRECT_MESSAGES_COLLECTION,
        "mentions",
        64,
        false,
        undefined,
        true
    );
}
```

## UI Integration Guide

### 1. Add State for Autocomplete

In your chat input component:

```typescript
const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
const [mentionQuery, setMentionQuery] = useState("");
const [autocompletePosition, setAutocompletePosition] = useState({
    top: 0,
    left: 0,
});
const [availableUsers, setAvailableUsers] = useState<UserProfileData[]>([]);
```

### 2. Detect @ Character Input

```typescript
function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    const cursorPosition = e.target.selectionStart || 0;

    const mention = getMentionAtCursor(text, cursorPosition);

    if (mention) {
        setMentionQuery(mention.username);
        setShowMentionAutocomplete(true);

        // Calculate position for autocomplete dropdown
        // (you'll need to get input element position)
        setAutocompletePosition({
            top: inputTop + inputHeight,
            left: cursorLeft,
        });

        // Fetch users matching the query
        fetchUsers(mention.username);
    } else {
        setShowMentionAutocomplete(false);
    }
}
```

### 3. Render Autocomplete

```tsx
{
    showMentionAutocomplete && (
        <MentionAutocomplete
            query={mentionQuery}
            users={availableUsers}
            position={autocompletePosition}
            onSelect={(username) => {
                const cursorPosition = inputRef.current?.selectionStart || 0;
                const newText = replaceMentionAtCursor(
                    text,
                    cursorPosition,
                    username
                );
                setText(newText);
                setShowMentionAutocomplete(false);
            }}
            onClose={() => setShowMentionAutocomplete(false)}
        />
    );
}
```

### 4. Update Message Rendering

Replace plain text rendering with:

```tsx
<MessageWithMentions text={message.text} currentUserId={currentUser.$id} />
```

## Testing Checklist

-   [ ] Database attributes added to both collections
-   [ ] Autocomplete appears when typing @ in chat input
-   [ ] Autocomplete filters users by display name
-   [ ] Arrow keys navigate autocomplete
-   [ ] Enter selects user from autocomplete
-   [ ] Escape closes autocomplete
-   [ ] Selected @mention is inserted into input
-   [ ] Sending message extracts usernames correctly
-   [ ] API receives mentions array
-   [ ] Database stores mentions array
-   [ ] Message rendering highlights mentions
-   [ ] Current user's mentions have different styling
-   [ ] Realtime updates include mentions field
-   [ ] Works in both channel messages and DMs

## Future Enhancements

1. **Notifications**

    - Notify users when they are mentioned
    - Add "Mentions" tab to show all messages mentioning the user
    - Unread mention count badge

2. **Search & Filtering**

    - Filter messages by mentions
    - Search for all mentions of a specific user

3. **Permissions**

    - Option to mention @everyone / @here (channel-wide)
    - Role-based mentions (e.g., @moderators)

4. **Rich Mention Display**
    - Show user avatar in autocomplete
    - Show user status (online/offline)
    - Show user role badges

## Known Limitations

1. Mentions are stored but not used for notifications yet
2. No server-side validation of mentioned usernames
3. No limit on number of mentions per message
4. Autocomplete doesn't filter out users not in the channel/conversation

## ESLint Notes

You may see false positive lint warnings about "unused variables" for:

-   `mentions` parameter in API routes (it IS used when adding to messageData)
-   `extractMentionedUsernames` import (it IS called in send functions)

These can be safely ignored or suppressed. The build succeeds despite these warnings.
