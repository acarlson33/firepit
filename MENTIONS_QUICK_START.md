# Quick Start: Using @Mentions

## For Users

### How to Mention Someone

1. **Start typing @** in any message input (channel or DM)
2. **Begin typing a username** - an autocomplete dropdown will appear
3. **Use arrow keys** (↑/↓) to navigate the suggestions
4. **Press Enter** or click to select a user
5. **Send your message** as normal

### Example

```
Type: "Hey @al"
Autocomplete shows: alice, alex, alfred
Press ↓ to select "alice"
Press Enter
Result: "Hey @alice"
```

### Keyboard Shortcuts

-   **↑ / ↓** - Navigate autocomplete
-   **Enter** - Select highlighted user
-   **Escape** - Close autocomplete
-   **Continue typing** - Filter results

### Visual Feedback

When viewing messages:

-   **Your mentions** appear with blue highlighting
-   **Other mentions** appear with gray highlighting
-   Hover over mentions to see user info (coming soon)

## For Developers

### Testing Mentions

1. **Create a test message**

    ```bash
    # Start the dev server
    bun run dev

    # Navigate to /chat
    # Select a channel or DM
    # Type: "Hello @testuser"
    ```

2. **Verify in database**

    ```bash
    # Check Appwrite console
    # Open messages collection
    # Find your message
    # Verify mentions: ["testuser"]
    ```

3. **Test autocomplete**
    - Type @ in message input
    - Verify dropdown appears
    - Type characters to filter
    - Verify users update
    - Select and verify insertion

### Database Setup

If you need to manually add the attributes:

```typescript
// Using Appwrite SDK
await databases.createStringAttribute(
    "main", // database ID
    "messages", // collection ID
    "mentions", // attribute key
    64, // max username length
    false, // not required
    undefined, // no default
    true // is array
);

// Repeat for 'direct_messages' collection
```

### API Usage

```typescript
// Send a message with mentions
const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        text: "Hey @alice, check this out!",
        channelId: "channel-123",
        mentions: ["alice"],
    }),
});

// Get messages with mentions
const messages = await fetch("/api/messages?channelId=channel-123");
// Each message may have: { ..., mentions: ['alice', 'bob'] }
```

### Component Usage

```tsx
import { ChatInput } from '@/components/chat-input';
import { MessageWithMentions } from '@/components/message-with-mentions';

// Input with autocomplete
<ChatInput
  value={text}
  onChange={setText}
  placeholder="Type a message"
/>

// Display with highlighted mentions
<MessageWithMentions
  text={message.text}
  currentUserId={currentUser.$id}
/>
```

## Troubleshooting

### Autocomplete doesn't appear

-   Check that you typed @ followed by at least one character
-   Verify `/api/users/search` endpoint is accessible
-   Check browser console for errors
-   Ensure you're in a channel or DM (not in server browser)

### Mentions not highlighting

-   Verify message object includes `mentions` field
-   Check that username matches exactly
-   Ensure `MessageWithMentions` component is being used
-   Check currentUserId prop is correct

### Mentions not saved

-   Check that mentions are being parsed before send
-   Verify API endpoint receives mentions array
-   Check database has mentions attribute
-   Look for errors in server logs

### Build errors

```bash
# Clean build
rm -rf .next
bun run build

# Check for TypeScript errors
bunx tsc --noEmit
```

## Performance Tips

1. **Autocomplete debouncing** - Already implemented (150ms)
2. **Limit results** - Already limited to 10 users
3. **Cache user searches** - Consider adding for frequent queries
4. **Lazy load users** - Current implementation loads on demand

## Next Steps

Now that mentions are working, consider:

1. **Add notifications** - Notify users when mentioned
2. **Search by mentions** - Filter messages by who was mentioned
3. **@here/@everyone** - Channel-wide mentions
4. **Mobile optimization** - Better keyboard handling on mobile
5. **Analytics** - Track mention usage patterns

---

**Questions?** Check `MENTIONS_FEATURE.md` for detailed documentation.
