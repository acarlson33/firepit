# File Attachments Feature Documentation

## Overview

The File Attachments feature (Roadmap #6) extends Firepit's messaging capabilities beyond images to support various file types including documents, videos, audio, archives, and code files. This feature enables users to share rich content in both channel messages and direct messages.

## Supported File Types

### Documents (Max: 10MB)
- **PDF**: `application/pdf`
- **Word**: `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- **Excel**: `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **PowerPoint**: `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- **Text**: `text/plain`, `text/csv`

### Images (Max: 5MB)
- **JPEG/JPG**: `image/jpeg`
- **PNG**: `image/png`
- **GIF**: `image/gif`
- **WebP**: `image/webp`
- **SVG**: `image/svg+xml`

### Videos (Max: 50MB)
- **MP4**: `video/mp4`
- **WebM**: `video/webm`
- **QuickTime**: `video/quicktime`
- **AVI**: `video/x-msvideo`
- **MKV**: `video/x-matroska`

### Audio (Max: 10MB)
- **MP3**: `audio/mpeg`
- **WAV**: `audio/wav`
- **OGG**: `audio/ogg`
- **M4A**: `audio/mp4`
- **FLAC**: `audio/flac`

### Archives (Max: 25MB)
- **ZIP**: `application/zip`
- **RAR**: `application/x-rar-compressed`
- **7Z**: `application/x-7z-compressed`
- **TAR**: `application/x-tar`
- **GZIP**: `application/gzip`

### Code Files (Max: 1MB)
- **JavaScript/TypeScript**: `application/javascript`, `text/javascript`, `application/typescript`, `text/typescript`
- **Python**: `text/x-python`
- **JSON**: `application/json`
- **HTML/CSS**: `text/html`, `text/css`
- **XML**: `text/xml`
- **Markdown**: `text/markdown`
- **YAML**: `application/x-yaml`

## Database Schema

### FileAttachment Type

```typescript
type FileAttachment = {
  fileId: string;           // Appwrite Storage file ID
  fileName: string;         // Original filename
  fileSize: number;         // File size in bytes
  fileType: string;         // MIME type
  fileUrl: string;          // Public view URL
  thumbnailUrl?: string;    // Optional thumbnail for videos
};
```

### Message Type Updates

Both `Message` and `DirectMessage` types now include:

```typescript
attachments?: FileAttachment[];
```

## API Endpoints

### Upload File

**Endpoint:** `POST /api/upload-file`

**Request:**
- Content-Type: `multipart/form-data`
- Body: FormData with `file` field

**Response:**
```json
{
  "fileId": "unique-file-id",
  "fileName": "document.pdf",
  "fileSize": 1048576,
  "fileType": "application/pdf",
  "fileUrl": "https://..../view?project=...",
  "downloadUrl": "https://..../download?project=...",
  "category": "documents"
}
```

**Error Responses:**
- `401 Unauthorized`: User not authenticated
- `400 Bad Request`: No file provided
- `400 Bad Request`: File type not supported
- `400 Bad Request`: File size exceeds maximum for category
- `500 Internal Server Error`: Upload failed

### Delete File

**Endpoint:** `DELETE /api/upload-file?fileId=xxx`

**Response:**
```json
{
  "success": true
}
```

**Error Responses:**
- `401 Unauthorized`: User not authenticated
- `400 Bad Request`: No fileId provided
- `500 Internal Server Error`: Delete failed

## Components

### FileIcon

Displays an appropriate icon based on file MIME type.

```tsx
import { FileIcon } from "@/components/file-icon";

<FileIcon fileType="application/pdf" className="size-6" />
```

### FileAttachmentDisplay

Displays file attachments in messages with appropriate previews:
- **Images**: Inline image display with lightbox
- **Videos**: Inline video player with controls
- **Audio**: Inline audio player
- **Other files**: Download card with icon and file info

```tsx
import { FileAttachmentDisplay } from "@/components/file-attachment-display";

<FileAttachmentDisplay attachment={fileAttachment} />
```

### FileUploadButton

Button component for uploading files with progress indication.

```tsx
import { FileUploadButton } from "@/components/file-upload-button";

<FileUploadButton
  onFileSelect={(attachment) => {
    // Handle file upload
    console.log('File uploaded:', attachment);
  }}
  disabled={false}
/>
```

### FilePreview

Preview component for displaying selected file before sending.

```tsx
import { FilePreview } from "@/components/file-upload-button";

<FilePreview
  attachment={fileAttachment}
  onRemove={() => {
    // Remove file from selection
  }}
/>
```

### FileDropZone

Drag-and-drop zone wrapper for file uploads.

```tsx
import { FileDropZone } from "@/components/file-drop-zone";

<FileDropZone
  onFileDrop={(file) => {
    // Handle dropped file
    void uploadFile(file);
  }}
  disabled={false}
>
  <div>Drag files here or click to upload</div>
</FileDropZone>
```

**Features:**
- Visual feedback when dragging files over the zone
- Prevents default browser drag behavior
- Supports file type filtering via `accept` prop
- Automatically handles first file in multi-file drops

## Utility Functions

### getFileCategory

Determines the category of a file based on MIME type.

```typescript
import { getFileCategory } from "@/components/file-icon";

const category = getFileCategory("application/pdf");
// Returns: "document"
```

**Categories:**
- `document`
- `image`
- `video`
- `audio`
- `archive`
- `code`
- `file` (default)

### formatFileSize

Formats file size in bytes to human-readable format.

```typescript
import { formatFileSize } from "@/components/file-icon";

const size = formatFileSize(1024 * 1024);
// Returns: "1 MB"
```

## Storage Configuration

### Files Bucket

The `files` bucket is configured with:
- **Bucket ID**: `files`
- **Max File Size**: 50MB
- **Allowed Extensions**: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, mp4, webm, mov, avi, mkv, mp3, wav, ogg, m4a, flac, zip, rar, 7z, tar, gz, js, ts, jsx, tsx, py, java, c, cpp, h, css, html, json, xml, yaml, yml, md, csv, svg, ico
- **Permissions**: File-level permissions (users can update/delete their own uploads)

### Environment Variables

The files bucket can be configured via environment variables:

```env
NEXT_PUBLIC_APPWRITE_FILES_BUCKET_ID=files
APPWRITE_FILES_BUCKET_ID=files
```

## Setup

### Database Initialization

Run the setup script to create the files bucket:

```bash
bun run setup
```

This will:
1. Create the `files` bucket if it doesn't exist
2. Configure allowed file extensions
3. Set maximum file size to 50MB

## Security

### Server-Side Validation

All file uploads are validated server-side for:
1. **Authentication**: User must be logged in
2. **File Type**: MIME type must be in allowed list
3. **File Size**: Must not exceed category-specific limits
4. **Rate Limiting**: Maximum 10 uploads per 5 minutes per user

### Rate Limiting

To prevent abuse, the API enforces rate limits:
- **Limit**: 10 uploads per 5-minute window per user
- **Response**: HTTP 429 (Too Many Requests) when limit exceeded
- **Headers**: 
  - `Retry-After`: Seconds until next request allowed
  - `X-RateLimit-Limit`: Maximum requests in window
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Unix timestamp when window resets

### Permissions

Files are created with:
- **Read**: Any user (files are publicly viewable)
- **Update**: File owner only
- **Delete**: File owner only

### Content Security

- MIME types are validated server-side
- File extensions are restricted at the bucket level
- File sizes are enforced per category
- Rate limiting prevents upload flooding

## Usage Example

### Uploading a File

```typescript
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload-file', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.json();
}
```

### Creating a Message with Attachments

```typescript
import type { FileAttachment } from "@/lib/types";

// Upload file first
const uploadResult = await uploadFile(selectedFile);

// Create attachment object
const attachment: FileAttachment = {
  fileId: uploadResult.fileId,
  fileName: uploadResult.fileName,
  fileSize: uploadResult.fileSize,
  fileType: uploadResult.fileType,
  fileUrl: uploadResult.fileUrl,
};

// Send message with attachment
await fetch('/api/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'Check out this file!',
    channelId: channelId,
    attachments: [attachment],
  }),
});
```

### Displaying Attachments

```tsx
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import type { Message } from "@/lib/types";

function MessageItem({ message }: { message: Message }) {
  return (
    <div>
      <p>{message.text}</p>
      {message.attachments?.map((attachment) => (
        <FileAttachmentDisplay
          key={attachment.fileId}
          attachment={attachment}
        />
      ))}
    </div>
  );
}
```

### Using Drag and Drop

```tsx
import { FileDropZone } from "@/components/file-drop-zone";
import { FileUploadButton, FilePreview } from "@/components/file-upload-button";
import { useState } from "react";

function ChatInput() {
  const [attachment, setAttachment] = useState<FileAttachment | null>(null);

  const handleFileDrop = async (file: File) => {
    // Upload dropped file
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/upload-file', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    setAttachment(result);
  };

  return (
    <FileDropZone onFileDrop={handleFileDrop}>
      <div className="chat-input">
        <input type="text" placeholder="Type a message..." />
        <FileUploadButton onFileSelect={setAttachment} />
        {attachment && (
          <FilePreview
            attachment={attachment}
            onRemove={() => setAttachment(null)}
          />
        )}
      </div>
    </FileDropZone>
  );
}
```

## Testing

### Running Tests

```bash
# Run all tests
bun run test

# Run file-related tests only
bun run test upload-file
bun run test file-icon
```

### Test Coverage

The feature includes comprehensive tests for:
- ✅ File upload API endpoint
- ✅ File deletion API endpoint
- ✅ File type validation
- ✅ File size validation
- ✅ Authentication checks
- ✅ Rate limiting logic
- ✅ Error handling
- ✅ File icon component
- ✅ File category detection
- ✅ File size formatting

## Recent Enhancements

### Security Features
- ✅ **Rate Limiting**: Prevents upload flooding (10 uploads per 5 minutes per user)
- ✅ **Rate Limit Headers**: Provides clear feedback when limits are exceeded
- ✅ **In-Memory Store**: Fast rate limit checks with automatic cleanup

### UI Integration
- ✅ **File Upload Button**: One-click file selection with progress indication
- ✅ **File Preview**: Preview selected files before sending
- ✅ **Drag & Drop Zone**: Intuitive drag-and-drop interface with visual feedback
- ✅ **File Icons**: Smart icon selection based on file type

## Future Enhancements

Potential improvements for future iterations:

1. **Virus Scanning**: Integrate ClamAV or VirusTotal API
2. **Chunked Uploads**: Support large files with resumable uploads
3. **Video Thumbnails**: Generate thumbnails for video files
4. **PDF Preview**: Inline PDF viewer component
5. **Multiple Files**: Support uploading multiple files at once
6. **File Compression**: Automatic compression for large files
7. **CDN Integration**: Serve files through CDN for better performance
8. **Redis Rate Limiting**: Distributed rate limiting for multi-server deployments

## Troubleshooting

### File Upload Fails

1. Check user is authenticated
2. Verify file type is supported
3. Confirm file size is within limits
4. Check if rate limit is exceeded (look for 429 response)
5. Check Appwrite bucket configuration
6. Review API endpoint logs

### Rate Limit Exceeded (429 Error)

1. Wait for the time specified in `Retry-After` header
2. Check `X-RateLimit-Reset` header for exact reset timestamp
3. Reduce upload frequency (max 10 per 5 minutes)
4. Implement client-side rate limit tracking

### Files Not Displaying

1. Verify attachment data structure
2. Check file URL is accessible
3. Ensure proper CORS configuration
4. Review browser console for errors

### Performance Issues

1. Implement lazy loading for images
2. Use thumbnail URLs for videos
3. Consider CDN for file serving
4. Optimize file sizes before upload

## Related Documentation

- [ROADMAP.md](./ROADMAP.md) - Feature roadmap
- [IMAGE_UPLOAD_FEATURE.md](./IMAGE_UPLOAD_FEATURE.md) - Image upload documentation
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
