import { Account, Client } from "node-appwrite";
import { NextResponse } from "next/server";

import { getEnvConfig } from "@/lib/appwrite-core";
import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";
import { logger } from "@/lib/newrelic-utils";

function buildLoginRedirect(requestUrl: string): {
    loginRedirectUrl: URL;
    parsedRequestUrl: URL;
} {
    const parsedRequestUrl = new URL(requestUrl);

    return {
        loginRedirectUrl: new URL("/login", parsedRequestUrl),
        parsedRequestUrl,
    };
}

export async function GET(request: Request) {
    const { loginRedirectUrl, parsedRequestUrl } = buildLoginRedirect(
        request.url,
    );

    let featureEnabled: boolean;
    try {
        featureEnabled = await getFeatureFlag(
            FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION,
        );
    } catch (error) {
        logger.error("Failed to check email verification feature flag", {
            error: error instanceof Error ? error.message : String(error),
        });
        loginRedirectUrl.searchParams.set("verified", "0");
        return NextResponse.redirect(loginRedirectUrl);
    }

    if (!featureEnabled) {
        return NextResponse.redirect(loginRedirectUrl);
    }

    const userId = parsedRequestUrl.searchParams.get("userId")?.trim() || "";
    const secret = parsedRequestUrl.searchParams.get("secret")?.trim() || "";

    if (!userId || !secret) {
        loginRedirectUrl.searchParams.set("verified", "0");
        return NextResponse.redirect(loginRedirectUrl);
    }

    try {
        const { endpoint, project } = getEnvConfig();
        const client = new Client().setEndpoint(endpoint).setProject(project);
        const account = new Account(client);

        await account.updateVerification({
            userId,
            secret,
        });

        loginRedirectUrl.searchParams.set("verified", "1");
        return NextResponse.redirect(loginRedirectUrl);
    } catch (error) {
        logger.error("Email verification callback failed", {
            error: error instanceof Error ? error.message : String(error),
            hasUserId: userId.length > 0,
            loginRedirectUrl: loginRedirectUrl.toString(),
        });
        loginRedirectUrl.searchParams.set("verified", "0");
        return NextResponse.redirect(loginRedirectUrl);
    }
}
