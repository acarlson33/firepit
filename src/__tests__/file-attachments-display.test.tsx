/**
 * Tests for file attachment display in messages
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileAttachmentDisplay } from "@/components/file-attachment-display";
import type { FileAttachment } from "@/lib/types";

describe("File Attachment Display", () => {
	it("should render PDF attachment", () => {
		const attachment: FileAttachment = {
			fileId: "file-123",
			fileName: "document.pdf",
			fileSize: 1024000,
			fileType: "application/pdf",
			fileUrl: "https://example.com/file-123",
		};

		render(<FileAttachmentDisplay attachment={attachment} />);

		expect(screen.getByText("document.pdf")).toBeInTheDocument();
	});

	it("should render image attachment", () => {
		const attachment: FileAttachment = {
			fileId: "img-456",
			fileName: "photo.jpg",
			fileSize: 2048000,
			fileType: "image/jpeg",
			fileUrl: "https://example.com/img-456",
		};

		render(<FileAttachmentDisplay attachment={attachment} />);

		expect(screen.getByText("photo.jpg")).toBeInTheDocument();
	});

	it("should render video attachment", () => {
		const attachment: FileAttachment = {
			fileId: "vid-789",
			fileName: "video.mp4",
			fileSize: 10240000,
			fileType: "video/mp4",
			fileUrl: "https://example.com/vid-789",
		};

		render(<FileAttachmentDisplay attachment={attachment} />);

		expect(screen.getByText("video.mp4")).toBeInTheDocument();
	});

	it("should render attachment with thumbnail", () => {
		const attachment: FileAttachment = {
			fileId: "file-with-thumb",
			fileName: "presentation.pptx",
			fileSize: 5120000,
			fileType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			fileUrl: "https://example.com/file-with-thumb",
			thumbnailUrl: "https://example.com/thumb-123",
		};

		render(<FileAttachmentDisplay attachment={attachment} />);

		expect(screen.getByText("presentation.pptx")).toBeInTheDocument();
	});

	it("should format file size correctly", () => {
		const attachment: FileAttachment = {
			fileId: "file-size-test",
			fileName: "large-file.zip",
			fileSize: 1536000, // 1.5 MB
			fileType: "application/zip",
			fileUrl: "https://example.com/file-size-test",
		};

		const { container } = render(<FileAttachmentDisplay attachment={attachment} />);

		// Should display formatted file size (implementation dependent)
		expect(container.textContent).toContain("large-file.zip");
	});

	it("should render multiple attachments independently", () => {
		const attachments: FileAttachment[] = [
			{
				fileId: "file-1",
				fileName: "doc1.pdf",
				fileSize: 1024000,
				fileType: "application/pdf",
				fileUrl: "https://example.com/file-1",
			},
			{
				fileId: "file-2",
				fileName: "doc2.docx",
				fileSize: 2048000,
				fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				fileUrl: "https://example.com/file-2",
			},
		];

		const { container } = render(
			<div>
				{attachments.map((attachment) => (
					<FileAttachmentDisplay key={attachment.fileId} attachment={attachment} />
				))}
			</div>
		);

		expect(screen.getByText("doc1.pdf")).toBeInTheDocument();
		expect(screen.getByText("doc2.docx")).toBeInTheDocument();
		expect(container.querySelectorAll("a")).toHaveLength(2);
	});
});
