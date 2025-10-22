# Emoji and Custom Emoji Support

## Overview
This document describes the implementation of emoji and custom emoji support for both direct messages and server channels in Firepit.

## Features Implemented

### 1. Standard Emoji Picker
- Users can insert standard emojis from a comprehensive emoji picker
- Emoji picker is accessible via a button next to the message input
- Supports emoji search and categories
- Works in both server channels and direct messages

### 2. Custom Emoji Upload and Sharing
- Users can upload custom emojis with unique names
- Maximum file size: 10MB
- Supported formats: Standard image formats (jpg, png, gif, webp, etc.)
- Custom emojis are stored in Appwrite Storage with proper permissions
- Emojis are accessible to all users globally (shared across the platform)
- Read-only access for all users; only uploader can delete their own emojis

### 3. Custom Emoji Management
- Upload new custom emojis via the emoji picker interface
- Name validation (alphanumeric, hyphens, and underscores only)
- Custom emojis are fetched from the server and shared across all users
- Emojis are cached locally for offline access
- Emojis use React Query for efficient caching and revalidation

### 4. Emoji Rendering
- Custom emojis use `:emoji-name:` syntax
- Automatic conversion of custom emoji syntax to emoji images
- Custom emojis are sized to match standard emojis (20px × 20px)
- Lazy loading for optimal performance
- Loading skeletons handled by the emoji picker component

### 5. Caching Strategy
- Custom emojis are fetched from the server on initial load
- Server data is cached in localStorage for offline access
- React Query provides automatic cache management
- Stale time: 5 minutes (data considered fresh)
- Cache time: 30 minutes (data kept in memory)
- Automatic revalidation on focus and reconnect

## Technical Implementation

### Files Created

#### 1. Upload API Route (`src/app/api/upload-emoji/route.ts`)
Handles custom emoji upload and deletion:
- **POST endpoint**: Upload a new custom emoji
  - Validates file type (images only)
  - Validates file size (max 10MB)
  - Validates emoji name format
  - Stores file in Appwrite Storage with emoji name as file name
  - Returns file ID, URL, and name
- **DELETE endpoint**: Delete a custom emoji
  - Requires file ID
  - Only owner can delete

#### 2. Custom Emojis API Route (`src/app/api/custom-emojis/route.ts`)
Fetches all custom emojis using admin client:
- **GET endpoint**: List all custom emojis
  - Uses admin client to access Appwrite Storage
  - Retrieves all files from the emojis bucket
  - Extracts emoji names from file names
  - Returns array of emoji objects
  - Accessible to all users (read-only)

#### 3. Emoji Picker Component (`src/components/emoji-picker.tsx`)
Comprehensive emoji selection interface:
- Dynamic import of emoji-picker-react for code splitting
- Standard emoji grid with search
- Custom emoji upload form
- Custom emoji grid display
- Emoji insertion callback

#### 4. Emoji Renderer Component (`src/components/emoji-renderer.tsx`)
Renders text with custom emoji support:
- Parses `:emoji-name:` syntax
- Converts to emoji images
- Falls back to text if emoji not found
- Optimized with React.memo

#### 5. Custom Emojis Hook (`src/hooks/useCustomEmojis.ts`)
Manages custom emoji state and operations:
- Fetches custom emojis from server API endpoint
- Uses localStorage as offline cache fallback
- Uploads new custom emojis
- Deletes custom emojis
- React Query integration for caching
- Loading states

#### 6. Setup Script Update (`scripts/setup-appwrite.ts`)
- Creates `emojis` bucket with 10MB size limit
- Allows standard image formats

#### 7. Component Updates
- **Chat Page** (`src/app/chat/page.tsx`):
  - Integrated emoji picker button
  - Emoji renderer for messages
  - Custom emoji upload handler
- **Direct Message View** (`src/app/chat/components/DirectMessageView.tsx`):
  - Integrated emoji picker button
  - Emoji renderer for messages
  - Custom emoji upload handler

### Tests Added

#### 1. API Route Tests (`src/__tests__/api-routes/upload-emoji.test.ts`)
6 validation tests covering:
- Emoji name format validation
- File size limit validation
- Image file type validation
- URL format generation
- Emoji name extraction from file name
- File name creation from emoji name and extension

#### 2. Component Tests (`src/__tests__/components/emoji-renderer.test.tsx`)
9 tests covering:
- Plain text rendering
- Single custom emoji rendering
- Multiple custom emoji rendering
- Unknown emoji handling
- Mixed content rendering
- CSS class validation
- Lazy loading attributes
- Empty emoji list handling

## Usage Guide

### For Users

#### Inserting Standard Emojis
1. Click the smile icon (😊) button next to the message input
2. Browse or search for an emoji
3. Click to insert it into your message

#### Uploading Custom Emojis
1. Click the smile icon (😊) button next to the message input
2. Click the "Add" button in the Custom Emojis section
3. Enter a unique name (e.g., `party-parrot`)
   - Must contain only letters, numbers, hyphens, and underscores
4. Select an image file (max 10MB)
5. Click "Upload"
6. Your custom emoji is now available to use

#### Using Custom Emojis
1. Type `:emoji-name:` in your message
   - Example: `:party-parrot:`
2. The text will automatically render as the custom emoji image
3. Or use the emoji picker to select from available custom emojis

### For Developers

#### Using the Emoji Picker
```tsx
import { EmojiPicker } from "@/components/emoji-picker";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";

function MyComponent() {
  const { customEmojis, uploadEmoji } = useCustomEmojis();
  const [text, setText] = useState("");

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  return (
    <EmojiPicker
      onEmojiSelect={handleEmojiSelect}
      customEmojis={customEmojis}
      onUploadCustomEmoji={uploadEmoji}
    />
  );
}
```

#### Using the Emoji Renderer
```tsx
import { EmojiRenderer } from "@/components/emoji-renderer";
import { useCustomEmojis } from "@/hooks/useCustomEmojis";

function MessageDisplay({ text }: { text: string }) {
  const { customEmojis } = useCustomEmojis();

  return (
    <div>
      <EmojiRenderer text={text} customEmojis={customEmojis} />
    </div>
  );
}
```

#### Custom Emoji Data Structure
```typescript
type CustomEmoji = {
  fileId: string;    // Appwrite file ID
  url: string;       // Full URL to emoji image
  name: string;      // Emoji name (without colons)
};
```

## Environment Variables

### Required
```bash
APPWRITE_EMOJIS_BUCKET_ID=emojis
```

This variable is automatically set by the setup script. The bucket is created with:
- Maximum file size: 10MB
- Allowed extensions: jpg, jpeg, png, gif, webp

## Database Schema

No database schema changes were required. Custom emojis are stored in Appwrite Storage only.

## Storage Structure

### Emojis Bucket
- **Bucket ID**: `emojis` (configurable via `APPWRITE_EMOJIS_BUCKET_ID`)
- **Max File Size**: 10MB
- **Permissions**:
  - Read: Any (public)
  - Update: Owner only
  - Delete: Owner only

## Security Considerations

- Client-side validation for file type and size
- Server-side validation in the API route
- Name validation to prevent injection attacks
- Only authenticated users can upload emojis
- Only emoji owners can delete their uploads
- File size limits prevent storage abuse

## Performance Optimizations

### Caching
- LocalStorage for persistent client-side cache
- React Query for in-memory cache management
- Automatic background revalidation
- Stale-while-revalidate pattern

### Lazy Loading
- Emoji images use `loading="lazy"` attribute
- Emoji picker component is dynamically imported
- Code splitting reduces initial bundle size

### Rendering
- EmojiRenderer component uses React.memo
- Efficient regex-based parsing
- Minimal re-renders

## Accessibility

- Emoji picker button has proper ARIA label
- Custom emoji images have descriptive alt text
- Keyboard navigation supported in emoji picker
- Screen reader friendly emoji names

## Browser Compatibility

- Works in all modern browsers
- Graceful degradation for older browsers
- LocalStorage fallback handling
- File input fallback

## Testing

Test suite includes:
- 6 validation tests for API route (upload and fetching)
- 9 component tests for emoji renderer
- Total: 15 tests

Run tests with:
```bash
npm test -- emoji
```

## Known Limitations

- Maximum file size: 10MB (configurable in code)
- Custom emoji names should be unique globally (not enforced, duplicate names may cause confusion)
- No bulk upload support
- No emoji editing capabilities
- One emoji picker instance per component
- Maximum 100 emojis fetched per request (pagination not implemented)

## Future Enhancements

Potential improvements for future releases:
- Global emoji marketplace/sharing
- Emoji collections/packs
- Animated emoji support
- Emoji usage analytics
- Emoji reactions (like Discord/Slack)
- Emoji autocomplete in text input
- Bulk emoji upload
- Emoji categories for custom emojis
- Admin emoji moderation

## Migration Notes

For existing installations:
1. Run `npm install` to get emoji-picker-react dependency
2. Set `APPWRITE_EMOJIS_BUCKET_ID=emojis` in your environment
3. Run `npm run setup` to create the emojis bucket
4. Restart your application

## Troubleshooting

### Emojis Not Appearing
- Check that `APPWRITE_EMOJIS_BUCKET_ID` is set
- Verify the emojis bucket exists in Appwrite
- Clear localStorage and refresh the page
- Check browser console for API errors
- Verify the `/api/custom-emojis` endpoint is accessible

### Upload Fails
- Verify file is under 10MB
- Check file is a valid image format
- Ensure emoji name is valid (alphanumeric, hyphens, underscores only)
- Check user is authenticated

### Performance Issues
- Clear browser cache
- Check network connection to Appwrite
- Verify localStorage isn't full

## Conclusion

The emoji and custom emoji feature successfully adds rich expression capabilities to Firepit, allowing users to communicate with both standard and custom emojis. The implementation follows best practices for performance, security, and user experience.
