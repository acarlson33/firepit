import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FileAttachmentDisplay } from "@/components/file-attachment-display";

describe("FileAttachmentDisplay", () => {
    it("keeps inline image attachments width-constrained", () => {
        const { container } = render(
            <FileAttachmentDisplay
                attachment={{
                    fileId: "file-1",
                    fileName: "legacy-image.png",
                    fileSize: 1024,
                    fileType: "image/png",
                    fileUrl: "https://example.com/legacy-image.png",
                }}
            />,
        );

        expect(container.innerHTML).toContain("max-w-full");
        expect(container.innerHTML).toContain("h-auto");
        expect(container.innerHTML).toContain("block max-w-full");
    });

    it("keeps inline video attachments width-constrained", () => {
        const { container } = render(
            <FileAttachmentDisplay
                attachment={{
                    fileId: "file-2",
                    fileName: "legacy-video.mp4",
                    fileSize: 2048,
                    fileType: "video/mp4",
                    fileUrl: "https://example.com/legacy-video.mp4",
                }}
            />,
        );

        expect(container.innerHTML).toContain("max-w-full");
        expect(container.innerHTML).toContain("h-auto");
    });
});
