import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ID, Permission, Role } from "node-appwrite";
import { getServerClient } from "@/lib/appwrite-server";
import { getServerSession } from "@/lib/auth-server";
import { getEnvConfig } from "@/lib/appwrite-core";
import {
	logger,
	recordError,
	setTransactionName,
	trackApiCall,
	addTransactionAttributes,
	recordEvent,
} from "@/lib/newrelic-utils";

// Helper to create JSON responses with CORS headers
function jsonResponse(data: unknown, init?: ResponseInit) {
	const headers = new Headers(init?.headers);
	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
	headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	return NextResponse.json(data, {
		...init,
		headers,
	});
}

// Handle preflight requests
export async function OPTIONS() {
	return jsonResponse({});
}

// File type configurations based on roadmap specs
const FILE_TYPE_CONFIG = {
	documents: {
		mimeTypes: [
			"application/pdf",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-powerpoint",
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			"text/plain",
			"text/csv",
		],
		maxSize: 10 * 1024 * 1024, // 10MB
	},
	images: {
		mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
		maxSize: 5 * 1024 * 1024, // 5MB
	},
	videos: {
		mimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"],
		maxSize: 50 * 1024 * 1024, // 50MB
	},
	audio: {
		mimeTypes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/flac"],
		maxSize: 10 * 1024 * 1024, // 10MB
	},
	archives: {
		mimeTypes: [
			"application/zip",
			"application/x-rar-compressed",
			"application/x-7z-compressed",
			"application/x-tar",
			"application/gzip",
		],
		maxSize: 25 * 1024 * 1024, // 25MB
	},
	code: {
		mimeTypes: [
			"application/javascript",
			"text/javascript",
			"application/typescript",
			"text/typescript",
			"text/x-python",
			"application/json",
			"text/html",
			"text/css",
			"text/xml",
			"text/markdown",
			"application/x-yaml",
		],
		maxSize: 1 * 1024 * 1024, // 1MB
	},
};

// Validate file type and get category
function validateFileType(mimeType: string, size: number): { valid: boolean; category?: string; error?: string } {
	for (const [category, config] of Object.entries(FILE_TYPE_CONFIG)) {
		if (config.mimeTypes.includes(mimeType)) {
			if (size > config.maxSize) {
				const maxSizeMB = config.maxSize / (1024 * 1024);
				return {
					valid: false,
					error: `File size exceeds maximum for ${category}: ${maxSizeMB}MB`,
				};
			}
			return { valid: true, category };
		}
	}
	return { valid: false, error: "File type not supported" };
}

/**
 * POST /api/upload-file
 * Upload a file to Appwrite Storage (supports various file types)
 */
export async function POST(request: NextRequest) {
	const startTime = Date.now();

	try {
		setTransactionName("POST /api/upload-file");

		logger.info("Starting file upload");
		const session = await getServerSession();
		if (!session?.$id) {
			logger.warn("Unauthorized upload attempt");
			return jsonResponse({ error: "Unauthorized" }, { status: 401 });
		}
		logger.info("Session verified", { userId: session.$id });

		addTransactionAttributes({ userId: session.$id });

		const env = getEnvConfig() as {
			endpoint: string;
			buckets: { files: string };
			project: string;
		};
		logger.info("Using bucket", { bucketId: env.buckets.files });

		const formData = await request.formData();
		const file = formData.get("file") as File;

		if (!file) {
			logger.warn("No file in upload request");
			return jsonResponse({ error: "No file provided" }, { status: 400 });
		}
		logger.info("File received", {
			name: file.name,
			type: file.type,
			size: file.size,
		});

		// Validate file type and size
		const validation = validateFileType(file.type, file.size);
		if (!validation.valid) {
			logger.warn("Invalid file", { type: file.type, size: file.size, error: validation.error });
			return jsonResponse({ error: validation.error }, { status: 400 });
		}

		const { storage } = getServerClient();

		// Convert File to buffer and recreate as File for node-appwrite
		const arrayBuffer = await file.arrayBuffer();
		const blob = new Blob([arrayBuffer], { type: file.type });
		const uploadFile = new File([blob], file.name, { type: file.type });

		logger.info("Uploading to Appwrite storage", { category: validation.category });
		const uploadStartTime = Date.now();

		// Upload to Appwrite Storage
		const uploadedFile = await storage.createFile(env.buckets.files, ID.unique(), uploadFile, [
			Permission.read(Role.any()),
			Permission.update(Role.user(session.$id)),
			Permission.delete(Role.user(session.$id)),
		]);

		const uploadDuration = Date.now() - uploadStartTime;
		trackApiCall("/api/upload-file", "POST", 200, uploadDuration, {
			operation: "uploadFile",
			fileSize: file.size,
			fileType: file.type,
			category: validation.category,
		});

		logger.info("Upload successful", {
			fileId: uploadedFile.$id,
			size: file.size,
			duration: uploadDuration,
			category: validation.category,
		});

		// Track upload event
		recordEvent("FileUpload", {
			fileId: uploadedFile.$id,
			userId: session.$id,
			fileSize: file.size,
			fileType: file.type,
			category: validation.category,
			duration: uploadDuration,
		});

		// Generate URL for the file
		const fileUrl = `${env.endpoint}/storage/buckets/${env.buckets.files}/files/${uploadedFile.$id}/view?project=${env.project}`;
		const downloadUrl = `${env.endpoint}/storage/buckets/${env.buckets.files}/files/${uploadedFile.$id}/download?project=${env.project}`;

		logger.info("File URL generated", { url: fileUrl });
		return jsonResponse({
			fileId: uploadedFile.$id,
			fileName: file.name,
			fileSize: file.size,
			fileType: file.type,
			fileUrl,
			downloadUrl,
			category: validation.category,
		});
	} catch (error) {
		recordError(error instanceof Error ? error : new Error(String(error)), {
			context: "POST /api/upload-file",
			endpoint: "/api/upload-file",
			userId: request.headers.get("x-user-id"),
		});

		logger.error("File upload failed", {
			error: error instanceof Error ? error.message : String(error),
			duration: Date.now() - startTime,
		});

		const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
		return jsonResponse({ error: errorMessage }, { status: 500 });
	}
}

/**
 * DELETE /api/upload-file?fileId=xxx
 * Delete a file from Appwrite Storage
 */
export async function DELETE(request: NextRequest) {
	const startTime = Date.now();

	try {
		setTransactionName("DELETE /api/upload-file");

		const session = await getServerSession();
		if (!session?.$id) {
			logger.warn("Unauthorized delete attempt");
			return jsonResponse({ error: "Unauthorized" }, { status: 401 });
		}

		addTransactionAttributes({ userId: session.$id });

		const env = getEnvConfig();

		const { searchParams } = new URL(request.url);
		const fileId = searchParams.get("fileId");

		if (!fileId) {
			logger.warn("No fileId provided for delete");
			return jsonResponse({ error: "No fileId provided" }, { status: 400 });
		}

		addTransactionAttributes({ fileId });

		const { storage } = getServerClient();

		const deleteStartTime = Date.now();
		await storage.deleteFile(env.buckets.files, fileId);

		trackApiCall("/api/upload-file", "DELETE", 200, Date.now() - deleteStartTime, {
			operation: "deleteFile",
			fileId,
		});

		recordEvent("FileDelete", {
			fileId,
			userId: session.$id,
		});

		logger.info("File deleted", {
			fileId,
			userId: session.$id,
			duration: Date.now() - startTime,
		});

		return jsonResponse({ success: true });
	} catch (error) {
		recordError(error instanceof Error ? error : new Error(String(error)), {
			context: "DELETE /api/upload-file",
			endpoint: "/api/upload-file",
		});

		logger.error("File delete failed", {
			error: error instanceof Error ? error.message : String(error),
		});

		return jsonResponse({ error: "Failed to delete file" }, { status: 500 });
	}
}
