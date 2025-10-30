# Server Admin & Moderation Guide

> **Status:** ✅ Production Ready (Completed October 2025)

Complete guide for server owners and moderators on managing their Firepit servers.

## Table of Contents

1. [Server Admin Panel](#server-admin-panel)
2. [Moderation Actions](#moderation-actions)
3. [Role Management](#role-management)
4. [Channel Permissions](#channel-permissions)
5. [Audit Logging](#audit-logging)
6. [Best Practices](#best-practices)

## Server Admin Panel

### Accessing the Admin Panel

**Location:** Chat page → Server header → Shield icon button

**Requirements:**

-   Must be the server owner
-   Shield button appears next to server name when you have admin access

### Panel Overview

The admin panel has 4 tabs:

#### 1. Overview Tab

**Server Statistics:**

-   Total Members - Current member count
-   Channels - Number of channels
-   Total Messages - All-time message count
-   Recent (24h) - Messages in last 24 hours
-   Banned Users - Currently banned members
-   Muted Users - Currently muted members

**Server Information:**

-   Server ID (for support/debugging)
-   Your role (Owner/Administrator)

#### 2. Members Tab

**Features:**

-   Search members by name/username
-   View all server members with avatars
-   See role assignments for each member
-   Quick moderation actions (Mute, Kick, Ban)

**Member List Shows:**

-   Avatar/profile picture
-   Display name and username
-   Number of roles assigned
-   Ban/mute status badges

**Actions Available:**

-   **Mute** - Prevent sending messages (can still read)
-   **Kick** - Remove from server (can rejoin via invite)
-   **Ban** - Permanently remove and block rejoin

#### 3. Moderation Tab

**Quick Stats:**

-   Banned Users count with red badge
-   Muted Users count with yellow badge

**Quick Actions:**

-   Manage Members - Jump to Members tab
-   View Audit Log - Jump to Audit Log tab

**Use Cases:**

-   Check moderation status at a glance
-   Quick navigation to member management
-   See moderation activity overview

#### 4. Audit Log Tab

**Shows Recent Actions:**

-   Action type (ban, mute, kick, unban, unmute)
-   Moderator who performed action
-   Target user who was affected
-   Reason provided (if any)
-   Timestamp of action
-   Additional details

**Features:**

-   Color-coded badges (red=ban, yellow=mute, gray=kick)
-   Last 50 actions shown by default
-   Automatic profile enrichment (shows names, not just IDs)

## Moderation Actions

### Banning Users

**What it does:**

-   Removes user from server immediately
-   Adds to `banned_users` collection
-   Deletes membership record
-   Prevents rejoining via invites
-   Logs action to audit trail

**How to ban:**

1. Open Admin Panel (Shield icon)
2. Go to Members tab
3. Find user in list
4. Click red "Ban" button
5. Optionally add reason
6. Confirm action

**Example reasons:**

-   "Spam and harassment"
-   "Violation of server rules"
-   "Inappropriate content"
-   "Repeated warnings ignored"

**API Endpoint:**

```typescript
POST /api/servers/[serverId]/moderation
{
  "action": "ban",
  "userId": "user123",
  "reason": "Repeated rule violations"
}
```

### Muting Users

**What it does:**

-   Adds user to `muted_users` collection
-   Prevents sending messages (can still read)
-   User remains in server
-   Can see all content but cannot respond
-   Logs action to audit trail

**How to mute:**

1. Open Admin Panel
2. Go to Members tab
3. Find user
4. Click "Mute" button
5. Optionally add reason
6. Confirm action

**When to use:**

-   Temporary cooldown period
-   Warning before ban
-   Spam prevention
-   Disruptive behavior

### Kicking Users

**What it does:**

-   Removes user from server
-   Deletes membership record
-   Does NOT add to banned list
-   User can rejoin via invite
-   Logs action to audit trail

**How to kick:**

1. Open Admin Panel
2. Go to Members tab
3. Find user
4. Click "Kick" button
5. Optionally add reason
6. Confirm action

**When to use:**

-   Inactive members cleanup
-   Temporary removal
-   Less severe than ban
-   Testing membership issues

### Unbanning Users

**What it does:**

-   Removes from `banned_users` collection
-   Allows user to rejoin via invite
-   Does NOT automatically readd to server
-   Logs action to audit trail

**How to unban:**

1. Check Audit Log for banned user ID
2. Use API or database directly (UI coming soon)

**API Endpoint:**

```typescript
POST /api/servers/[serverId]/moderation
{
  "action": "unban",
  "userId": "user123"
}
```

### Unmuting Users

**What it does:**

-   Removes from `muted_users` collection
-   Restores message sending ability
-   User can immediately participate again
-   Logs action to audit trail

**How to unmute:**

1. Check Audit Log for muted user ID
2. Use API or database directly (UI coming soon)

**API Endpoint:**

```typescript
POST /api/servers/[serverId]/moderation
{
  "action": "unmute",
  "userId": "user123"
}
```

## Role Management

### Creating Roles

**Steps:**

1. Open Server Settings (Gear icon)
2. Click "Create Role" button
3. Set role name (e.g., "Moderator")
4. Choose color (hex code)
5. Set position (hierarchy)
6. Toggle permissions
7. Set mentionable option
8. Click "Create Role"

**Permission Types:**

| Permission       | Description                  | Use For            |
| ---------------- | ---------------------------- | ------------------ |
| Read Messages    | View channels and history    | Everyone (usually) |
| Send Messages    | Send messages in channels    | Active members     |
| Manage Messages  | Delete/edit others' messages | Moderators         |
| Manage Channels  | Create/edit/delete channels  | Admins             |
| Manage Roles     | Create/edit/delete roles     | Senior Admins      |
| Manage Server    | Change server settings       | Trusted Admins     |
| Mention Everyone | Use @everyone/@here          | Staff only         |
| Administrator    | All permissions + bypass     | Trusted only       |

### Editing Roles

**Steps:**

1. Open Server Settings
2. Find role in list
3. Click Settings icon
4. Modify properties
5. Click "Save Changes"

**What you can edit:**

-   Role name
-   Color
-   Position (hierarchy)
-   All permission flags
-   Mentionable setting

### Deleting Roles

**Steps:**

1. Open Server Settings
2. Find role in list
3. Click Trash icon
4. Click again to confirm

**⚠️ Warning:** Deleting a role removes it from all members who have it.

### Assigning Roles to Members

**Steps:**

1. Open Server Settings
2. Find role in list
3. Click Users icon
4. Search for member
5. Click member to add
6. Click X to remove

**Features:**

-   Search by display name or username
-   See current role assignments
-   Add multiple roles per member
-   Remove roles individually

### Role Hierarchy

**How it works:**

-   Higher position = more powerful
-   Can only manage roles below your highest role
-   Owner can manage all roles
-   Position determines display order

**Example hierarchy:**

```
Position 10: Owner (automatic)
Position 9:  Admin
Position 5:  Moderator
Position 3:  Trusted Member
Position 1:  Member
Position 0:  @everyone
```

## Channel Permissions

### Setting Up Channel Overrides

**When to use:**

-   Private staff channels
-   Read-only announcements
-   Restricted access channels
-   Voice-only channels (future)

**Steps:**

1. Select a channel
2. Click Settings icon in channel header
3. Click "Channel Permissions"
4. Click "Add Override"
5. Choose Role or User
6. Set Allow/Deny permissions
7. Click "Create Override"

### Role-Based Overrides

**Example: Admin-only channel**

1. Create override for @everyone role
2. Deny: `readMessages`, `sendMessages`
3. Admin role can still access (base permissions)

**Example: Announcements channel**

1. Create override for @everyone role
2. Allow: `readMessages`
3. Deny: `sendMessages`
4. Moderator role can post (base permissions)

### User-Specific Overrides

**When to use:**

-   Temporary access for guests
-   Muted users in specific channels
-   Special privileges for contributors

**Example: Guest access**

1. Create override for guest user
2. Allow: `readMessages`, `sendMessages`
3. Only in specific channels
4. Remove when no longer needed

### Permission Priority

**Order (highest to lowest):**

1. Server Owner - always full access
2. Administrator Role - bypasses channel overrides
3. User-specific override - highest for non-admins
4. Role override - applied to all with role
5. Base role permissions - combined from all roles
6. Default deny - no access unless granted

**Key rules:**

-   Deny always beats Allow
-   User overrides beat role overrides
-   Administrator ignores all overrides

## Audit Logging

### What Gets Logged

**Moderation Actions:**

-   Ban
-   Unban
-   Mute
-   Unmute
-   Kick

**Information Captured:**

-   Action type
-   Moderator user ID
-   Target user ID
-   Server ID
-   Reason (if provided)
-   Additional details
-   Timestamp (automatic)

### Viewing Audit Logs

**Location:** Admin Panel → Audit Log tab

**Shows:**

-   Last 50 actions by default
-   Color-coded action badges
-   Moderator and target names (not just IDs)
-   Timestamps in local timezone
-   Reason and details

**Filtering:** (Coming soon)

-   By action type
-   By moderator
-   By target user
-   By date range

### Audit Log API

```typescript
GET /api/servers/[serverId]/audit-logs?limit=50

Response:
[
  {
    "$id": "log123",
    "action": "ban",
    "moderatorId": "mod456",
    "moderatorName": "John Admin",
    "targetUserId": "user789",
    "targetUserName": "Spammer99",
    "reason": "Repeated spam violations",
    "timestamp": "2025-10-30T15:30:00Z",
    "details": "User banned from server"
  }
]
```

### Compliance & Record Keeping

**Retention:**

-   Audit logs stored indefinitely
-   Use for:
    -   Accountability
    -   Dispute resolution
    -   Pattern detection
    -   Compliance reporting

**Privacy:**

-   Only visible to server owner
-   Contains user IDs and actions
-   Does not store message content
-   Moderator actions are transparent

## Best Practices

### Moderation Guidelines

1. **Document Rules:** Clear server rules pinned in a rules channel
2. **Warning System:** Warn before ban (document warnings in audit log)
3. **Proportional Response:** Match action severity to violation
4. **Consistency:** Apply rules equally to all members
5. **Appeal Process:** Allow users to appeal bans
6. **Staff Training:** Ensure all mods understand policies

### Role Structure

**Recommended roles:**

```
Owner (automatic)
├── Administrator (full access)
├── Senior Moderator (manage messages + channels)
├── Moderator (manage messages only)
├── Trusted Member (mention everyone)
├── Member (basic permissions)
└── @everyone (default permissions)
```

**Permission distribution:**

-   **@everyone:** Read + Send messages only
-   **Member:** Add reactions, embed links
-   **Trusted Member:** Mention everyone (earn this)
-   **Moderator:** Manage messages (delete spam)
-   **Senior Moderator:** Manage channels too
-   **Administrator:** All permissions except server ownership

### Channel Organization

**Public channels:**

-   Use @everyone role with basic permissions
-   No overrides needed

**Staff channels:**

-   Deny @everyone from reading
-   Staff roles automatically have access

**Announcement channels:**

-   Allow @everyone to read
-   Deny @everyone from sending
-   Moderators can post

**Private projects:**

-   User-specific overrides for collaborators
-   Temporary access (remove when done)

### Security Recommendations

1. **Limit Admins:** Only 2-3 administrators maximum
2. **Use Roles:** Prefer role permissions over user overrides
3. **Regular Audits:** Review role assignments monthly
4. **Monitor Activity:** Check audit logs weekly
5. **Backup Data:** Export member list regularly
6. **Document Changes:** Note why roles changed in audit reasons

### Handling Common Issues

#### Spam Attack

1. **Immediate:** Mute user
2. **Review:** Check message history
3. **Action:** Ban if intentional spam
4. **Cleanup:** Delete spam messages
5. **Learn:** Adjust auto-mod rules

#### Harassment Reports

1. **Gather:** Screenshot evidence
2. **Review:** Check audit log for pattern
3. **Warn:** First offense warning + mute
4. **Escalate:** Second offense = ban
5. **Support:** Offer resources to victim

#### Role Confusion

1. **Check:** User's current roles
2. **Verify:** Permission calculation
3. **Test:** Try action yourself with same roles
4. **Fix:** Adjust role permissions or overrides
5. **Document:** Note in admin notes

#### Lost Access

1. **Verify:** User is still in server
2. **Check:** Not banned or muted
3. **Review:** Channel overrides
4. **Confirm:** Role assignments
5. **Restore:** Fix permissions or reassign roles

## Integration with Other Features

### With Reactions

-   Muted users can still react to messages
-   Manage Messages permission allows removing reactions
-   No special configuration needed

### With @Mentions

-   Mention Everyone permission controls @everyone/@here
-   Muted users cannot send mentions (cannot send messages)
-   Administrator can always mention

### With DMs

-   Bans do not affect DMs between users
-   Server moderation only applies to server content
-   Use block feature for DM issues (future)

## Troubleshooting

### User Can't See Moderation Options

**Check:**

-   User is server owner
-   Shield button visible in server header
-   Not trying to moderate DMs (only servers)

### Moderation Action Fails

**Common causes:**

-   Target user is server owner (cannot moderate owner)
-   Network error (retry)
-   User already banned/muted
-   Permissions changed mid-action

**Solutions:**

-   Refresh page and retry
-   Check audit log for success
-   Verify user status in database

### Audit Log Not Showing Actions

**Check:**

-   Action actually completed successfully
-   Refresh the admin panel
-   API returned success response
-   Database collection has records

### Stats Not Updating

**Refresh triggers:**

-   Opening admin panel
-   Switching tabs
-   Manual page refresh

**Note:** Stats update on load, not real-time (for performance)

## Future Enhancements

-   [ ] Bulk moderation actions
-   [ ] Scheduled unmute/unban
-   [ ] Moderation dashboard analytics
-   [ ] Export audit logs
-   [ ] Automated mod actions (auto-mute on spam)
-   [ ] User warnings system
-   [ ] Moderation templates
-   [ ] Appeal system integration
-   [ ] Moderator activity reports

## API Reference

### Server Stats

```typescript
GET / api / servers / [serverId] / stats;
```

### Moderation Actions

```typescript
POST /api/servers/[serverId]/moderation
Body: { action, userId, reason? }
Actions: "ban" | "mute" | "kick" | "unban" | "unmute"
```

### Audit Logs

```typescript
GET /api/servers/[serverId]/audit-logs?limit=50
```

### Member List

```typescript
GET / api / servers / [serverId] / members;
```

## Support

**Issues:** [GitHub Issues](https://github.com/acarlson33/firepit/issues)  
**Discussions:** [GitHub Discussions](https://github.com/acarlson33/firepit/discussions)  
**Documentation:** `/docs` folder

---

**Last Updated:** October 30, 2025  
**Version:** 1.0.0  
**Status:** Production Ready ✅
