import { NextResponse } from "next/server";
import { getEnvConfig } from "@/lib/appwrite-core";
import { getFeatureFlag, FEATURE_FLAGS } from "@/lib/feature-flags";

interface InstanceInfo {
	instanceName: string;
	instanceUrl: string;
	appwriteEndpoint: string;
	appwriteProjectId: string;
	features: {
		emailVerification: boolean;
		auditLogging: boolean;
	};
	support: {
		email: string | null;
		url: string | null;
	};
	meta: {
		version: string;
		buildTime: string;
		environment: string;
	};
}

async function getInstanceFeatures(): Promise<InstanceInfo["features"]> {
	const [emailVerification, auditLogging] = await Promise.all([
		getFeatureFlag(FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION).catch(() => false),
		getFeatureFlag(FEATURE_FLAGS.ENABLE_AUDIT_LOGGING).catch(() => true),
	]);

	return {
		emailVerification,
		auditLogging,
	};
}

export async function GET(): Promise<NextResponse<InstanceInfo>> {
	const env = getEnvConfig();

	const instanceName =
		process.env.FIREPIT_INSTANCE_NAME?.trim() || "Firepit";
	const instanceUrl =
		(process.env.SERVER_URL?.trim() ||
			process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
			"")
			.replace(/\/$/, "");

	const features = await getInstanceFeatures();

	const instanceInfo: InstanceInfo = {
		instanceName,
		instanceUrl,
		appwriteEndpoint: env.endpoint,
		appwriteProjectId: env.project,
		features,
		support: {
			email: process.env.FIREPIT_SUPPORT_EMAIL?.trim() || null,
			url: process.env.FIREPIT_SUPPORT_URL?.trim() || null,
		},
		meta: {
			version: process.env.FIREPIT_API_VERSION || "1.0.0",
			buildTime: process.env.BUILD_TIME || new Date().toISOString(),
			environment: process.env.NODE_ENV || "development",
		},
	};

	return NextResponse.json(instanceInfo);
}
