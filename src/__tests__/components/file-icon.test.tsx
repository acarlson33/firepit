import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FileIcon, getFileCategory, formatFileSize } from "@/components/file-icon";

describe("FileIcon", () => {
	it("should render a document icon for PDF files", () => {
		const { container } = render(<FileIcon fileType="application/pdf" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should render an image icon for image files", () => {
		const { container } = render(<FileIcon fileType="image/jpeg" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should render a video icon for video files", () => {
		const { container } = render(<FileIcon fileType="video/mp4" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should render an audio icon for audio files", () => {
		const { container } = render(<FileIcon fileType="audio/mpeg" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should render an archive icon for zip files", () => {
		const { container } = render(<FileIcon fileType="application/zip" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should render a code icon for JavaScript files", () => {
		const { container } = render(<FileIcon fileType="application/javascript" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should render a default file icon for unknown types", () => {
		const { container } = render(<FileIcon fileType="application/unknown" />);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("should apply custom className", () => {
		const { container } = render(<FileIcon className="size-10" fileType="application/pdf" />);
		const svg = container.querySelector("svg");
		expect(svg).toHaveClass("size-10");
	});
});

describe("getFileCategory", () => {
	it("should categorize document types correctly", () => {
		expect(getFileCategory("application/pdf")).toBe("document");
		expect(getFileCategory("application/msword")).toBe("document");
		expect(getFileCategory("text/plain")).toBe("document");
		expect(getFileCategory("text/csv")).toBe("document");
	});

	it("should categorize image types correctly", () => {
		expect(getFileCategory("image/jpeg")).toBe("image");
		expect(getFileCategory("image/png")).toBe("image");
		expect(getFileCategory("image/gif")).toBe("image");
	});

	it("should categorize video types correctly", () => {
		expect(getFileCategory("video/mp4")).toBe("video");
		expect(getFileCategory("video/webm")).toBe("video");
	});

	it("should categorize audio types correctly", () => {
		expect(getFileCategory("audio/mpeg")).toBe("audio");
		expect(getFileCategory("audio/wav")).toBe("audio");
	});

	it("should categorize archive types correctly", () => {
		expect(getFileCategory("application/zip")).toBe("archive");
		expect(getFileCategory("application/x-rar-compressed")).toBe("archive");
	});

	it("should categorize code types correctly", () => {
		expect(getFileCategory("application/javascript")).toBe("code");
		expect(getFileCategory("text/html")).toBe("code");
		expect(getFileCategory("application/json")).toBe("code");
	});

	it("should return 'file' for unknown types", () => {
		expect(getFileCategory("application/unknown")).toBe("file");
	});
});

describe("formatFileSize", () => {
	it("should format bytes correctly", () => {
		expect(formatFileSize(0)).toBe("0 B");
		expect(formatFileSize(100)).toBe("100 B");
		expect(formatFileSize(1023)).toBe("1023 B");
	});

	it("should format kilobytes correctly", () => {
		expect(formatFileSize(1024)).toBe("1 KB");
		expect(formatFileSize(1536)).toBe("1.5 KB");
		expect(formatFileSize(10240)).toBe("10 KB");
	});

	it("should format megabytes correctly", () => {
		expect(formatFileSize(1024 * 1024)).toBe("1 MB");
		expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
		expect(formatFileSize(1024 * 1024 * 10)).toBe("10 MB");
	});

	it("should format gigabytes correctly", () => {
		expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
		expect(formatFileSize(1024 * 1024 * 1024 * 1.5)).toBe("1.5 GB");
	});
});
