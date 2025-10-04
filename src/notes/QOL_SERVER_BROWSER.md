# QoL Features: Server Browser & Auto-Join

## Summary

Added two quality-of-life features to improve the user experience:

1. **Server Browser** - Browse and join available servers directly from the chat UI
2. **Auto-Join Single Server** - Automatically join new users to the server when there's only one on the instance

## Changes Made

### 1. Auto-Join Single Server on Registration

#### `/src/app/(auth)/login/actions.ts`

Added `autoJoinSingleServer()` function that:

- Checks if memberships are enabled
- Queries for total server count (limit 2 to optimize)
- Only proceeds if there's exactly 1 server
- Checks if user is already a member
- Creates membership with "member" role if not already joined
- Silently fails for non-critical errors

Called automatically after successful registration:

```typescript
// If login succeeded and memberships are enabled, auto-join single server
if (loginResult.success) {
  try {
    await autoJoinSingleServer(userId);
  } catch {
    // Non-critical: auto-join failed, user can manually join later
  }
}
```

**Benefits**:

- Single-server instances: Users can immediately start chatting
- Multi-server instances: Users choose which servers to join
- Zero-server instances: Gracefully skips without errors
- No breaking changes to existing registration flow

### 2. Server Browser Component

#### `/src/app/chat/components/ServerBrowser.tsx`

New client component that displays:

- Card UI with title "Available Servers"
- List of all servers with name and ID
- "Join" button for each server
- Loading states while fetching/joining
- Error handling with toast notifications
- Disabled when memberships not enabled

Features:

- Fetches servers from `/api/servers/public`
- Joins servers via `/api/servers/join`
- Refreshes page after successful join
- Shows appropriate messages for empty states

### 3. Server Browser API Endpoints

#### `/src/app/api/servers/public/route.ts`

GET endpoint that:

- Lists all servers (limit 100)
- Orders by creation date (newest first)
- Returns minimal server info: `$id`, `name`, `ownerId`
- Uses server SDK for secure access
- No authentication required (public endpoint)

#### `/src/app/api/servers/join/route.ts`

POST endpoint that:

- Validates `serverId` and `userId` parameters
- Checks if server exists
- Checks if user is already a member
- Creates membership with "member" role
- Sets appropriate permissions
- Returns detailed error messages

Error handling:

- 400: Missing parameters, already a member, memberships disabled
- 404: Server not found
- 500: Database errors

### 4. Chat UI Integration

#### `/src/app/chat/page.tsx`

Added `<ServerBrowser />` to the sidebar:

- Positioned below servers and channels sections
- Passes `userId`, `membershipEnabled` props
- Refreshes page after successful join
- Only shows when memberships are enabled

## User Experience

### New User Registration Flow

**Single Server Instance**:

1. User registers account
2. Automatically joined to the single server ✨
3. Can immediately see channels and chat
4. No manual joining required

**Multi-Server Instance**:

1. User registers account
2. Sees server browser in chat sidebar
3. Clicks "Join" on desired servers
4. Server appears in their server list

### Existing User Flow

**Discovering Servers**:

1. Open chat page
2. Scroll to "Available Servers" section
3. Browse all servers on the instance
4. Click "Join" to add to your server list
5. Page refreshes - server now appears in sidebar

**Already a Member**:

- Join button shows "Already a member" error
- No duplicate memberships created
- Safe to click multiple times

## Technical Details

### Auto-Join Logic

```typescript
// Only runs if:
1. Registration succeeded
2. Memberships are enabled
3. Exactly 1 server exists
4. User is not already a member

// Creates membership with:
- serverId: The single server's ID
- userId: New user's ID
- role: "member" (not owner)
- permissions: User can read/write their own membership
```

### Server Browser Security

**Public Server List**:

- Anyone can see all servers
- No sensitive data exposed (just name and ID)
- Appropriate for community instances

**Join Permission**:

- Creates membership with user permissions
- Server owner maintains delete rights
- Admin/moderators can manage via admin panel

**Membership Validation**:

- Prevents duplicate memberships
- Checks server existence before joining
- Returns clear error messages

## Edge Cases Handled

✅ **Zero servers**: Auto-join skips gracefully, browser shows "no servers" message  
✅ **One server**: Auto-join works, browser shows single server  
✅ **Multiple servers**: Auto-join skips, browser shows all  
✅ **Memberships disabled**: Auto-join skips, browser shows disabled message  
✅ **Already a member**: Join API returns helpful error  
✅ **Server deleted**: Join API returns 404  
✅ **Network errors**: Toast notifications show errors

## Configuration

**Memberships Enabled**:

- Set `NEXT_PUBLIC_APPWRITE_MEMBERSHIPS_COLLECTION_ID` environment variable
- Both features work automatically

**Memberships Disabled**:

- Auto-join skips (no memberships to create)
- Server browser shows disabled message
- All servers are public by default

## Testing Checklist

- [ ] Create new account on single-server instance → auto-joined
- [ ] Create new account on multi-server instance → not auto-joined
- [ ] Create new account with memberships disabled → no errors
- [ ] Server browser loads all servers
- [ ] Click "Join" on server → success
- [ ] Click "Join" on already-joined server → error message
- [ ] Click "Join" without login → error message
- [ ] Server browser with memberships disabled → shows disabled message
- [ ] Server browser with no servers → shows empty message

## Future Enhancements

Possible improvements:

- Show member count for each server
- Filter servers by name
- Show which servers you're already in
- Add server categories/tags
- Show server description
- Private servers (invite-only)
- Server search functionality

## Benefits

**For Single-Server Communities**:

- Instant onboarding - no manual setup
- New users can chat immediately
- Reduced friction in user flow

**For Multi-Server Communities**:

- Easy server discovery
- No need to know server IDs
- Visual browsing experience

**For Admins**:

- Less support burden
- Users self-serve server joining
- Reduced onboarding emails

## Migration Notes

**Existing Users**:

- No impact - auto-join only runs on registration
- Can still use server browser to join more servers

**Existing Servers**:

- No migration needed
- All servers automatically appear in browser
- No changes to server permissions

**Backward Compatibility**:

- All features gracefully degrade
- Works with or without memberships
- No breaking changes to existing APIs
