# Image Upload Feature for Server Channels

## Overview
This document describes the implementation of image upload functionality for server channels and the addition of loading skeletons for images in both server channels and direct messages.

## Features Implemented

### 1. Image Upload Support in Server Channels
- Users can now upload images in server channels, matching the existing functionality in direct messages
- Supports standard image formats (validated client-side)
- Maximum file size: 5MB (validated client-side)
- Images are stored in Appwrite Storage with proper permissions

### 2. Loading Skeletons for Images
- Added `ImageWithSkeleton` component that shows a skeleton placeholder while images are loading
- Handles loading states, error states, and successful image display
- Applied to both:
  - Direct Messages (DirectMessageView)
  - Server Channels (chat page)

### 3. Image Viewing
- Click on any image to view it in full-screen modal
- Keyboard accessible (Enter or Space to open, Escape to close)
- Works in both DMs and server channels

## Technical Implementation

### Files Modified

#### 1. Type Definitions (`src/lib/types.ts`)
Added image fields to the `Message` type:
```typescript
imageFileId?: string;
imageUrl?: string;
```

#### 2. API Route (`src/app/api/messages/route.ts`)
- Updated POST endpoint to accept `imageFileId` and `imageUrl`
- Modified validation to allow messages with only images (no text required)
- Added image fields to message creation and response

#### 3. useMessages Hook (`src/app/chat/hooks/useMessages.ts`)
- Updated `send()` function to accept image parameters
- Modified realtime message parsing to include image fields
- Updated validation to allow image-only messages

#### 4. Chat Page (`src/app/chat/page.tsx`)
- Added image upload button with file input
- Added image preview with remove functionality
- Created `handleSendWithImage()` function to upload images before sending
- Added `ImageWithSkeleton` component usage in message rendering
- Added image viewer modal for full-screen display

#### 5. Direct Message View (`src/app/chat/components/DirectMessageView.tsx`)
- Replaced standard `<img>` with `ImageWithSkeleton` component
- Maintains existing image upload functionality

#### 6. New Components
Created `src/components/image-with-skeleton.tsx`:
- Displays skeleton while image loads
- Shows error message if image fails to load
- Handles all accessibility features (keyboard, click events)
- Fully reusable across the application

### Tests Added

#### 1. API Route Tests (`src/__tests__/api-routes/messages-image-upload.test.ts`)
5 comprehensive tests covering:
- Creating messages with images
- Creating image-only messages (no text)
- Validation for missing required fields
- Handling messages with text but no image
- Partial image data (fileId without URL)

#### 2. Component Tests (`src/__tests__/components/image-with-skeleton.test.tsx`)
7 tests covering:
- Skeleton display during loading
- Image display after successful load
- Error message display on load failure
- Click event handling
- Keyboard event handling
- Custom className application
- Accessibility attribute validation

#### 3. Updated Existing Tests
- Updated `messages.test.ts` to match new validation error messages

## Usage Guide

### For Users

#### Uploading Images in Server Channels
1. Navigate to any server channel
2. Click the image icon (📷) button next to the message input
3. Select an image file (max 5MB)
4. Preview appears above the input field
5. Optionally add text to accompany the image
6. Click "Send" to post the message

#### Viewing Images
1. Click on any image in a message
2. Image opens in full-screen viewer
3. Click outside the image or press Escape to close

### For Developers

#### Using ImageWithSkeleton Component
```tsx
import { ImageWithSkeleton } from "@/components/image-with-skeleton";

<ImageWithSkeleton
  src="https://example.com/image.jpg"
  alt="Description of image"
  className="custom-styles"
  onClick={handleClick}
  onKeyDown={handleKeyPress}
  role="button"
  tabIndex={0}
/>
```

#### Sending Messages with Images
The `send()` function in `useMessages` hook now accepts optional image parameters:
```typescript
await send(e, imageFileId, imageUrl);
```

## Database Schema
No database schema changes were required. The existing `messages` collection supports the optional `imageFileId` and `imageUrl` fields.

## Security Considerations
- Client-side validation for file type and size
- Images stored with user-specific permissions in Appwrite Storage
- Only authenticated users can upload images
- Server-side validation in the API route

## Performance Optimizations
- Lazy loading of images with skeleton placeholders
- Image URLs are generated at upload time and cached
- No blocking of message sending while image loads
- Progressive enhancement approach

## Testing
All tests pass successfully:
- 381 total tests passing
- 5 new tests for image upload API
- 7 new tests for ImageWithSkeleton component
- All existing tests continue to pass

## Accessibility
- Full keyboard navigation support
- ARIA labels and roles properly set
- Skeleton provides visual feedback during loading
- Error states clearly communicated
- Images have proper alt text

## Browser Compatibility
- Works in all modern browsers
- Graceful degradation for older browsers
- File input fallback for browsers without drag-and-drop

## Future Enhancements
Potential improvements for future releases:
- Drag-and-drop image upload
- Image compression before upload
- Multiple image upload in single message
- Image editing (crop, resize) before sending
- Thumbnail generation for faster loading
- Image gallery view for multiple images in a conversation

## Known Limitations
- Maximum file size: 5MB (configurable in code)
- Supported formats: Standard web image formats (jpg, png, gif, webp, etc.)
- No image editing capabilities
- One image per message

## Conclusion
The image upload feature successfully extends server channels with the same rich media capabilities available in direct messages, while also improving the user experience across the application with loading skeletons for all images.
