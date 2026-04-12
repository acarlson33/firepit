import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { getOrCreateUserProfile, updateUserProfile } from "@/lib/appwrite-profiles";
import { logger } from "@/lib/newrelic-utils";

type PatchBody = {
    dmEncryptionPublicKey?: string;
};

const PUBLIC_KEY_MAX_LENGTH = 256;

const isLikelyBase64 = (value: string): boolean =>
    /^[A-Za-z0-9+/=_-]+$/.test(value);

export async function GET() {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);

        return NextResponse.json({
            dmEncryptionPublicKey: profile.dmEncryptionPublicKey,
            userId: user.$id,
        });
    } catch (error) {
        logger.error("Failed to fetch DM encryption key metadata", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getServerSession();
        if (!user?.$id) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        let body: PatchBody;
        try {
            body = (await request.json()) as PatchBody;
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON body" },
                { status: 400 },
            );
        }

        const dmEncryptionPublicKey = body.dmEncryptionPublicKey;

        if (
            typeof dmEncryptionPublicKey !== "string" ||
            dmEncryptionPublicKey.length === 0 ||
            dmEncryptionPublicKey.length > PUBLIC_KEY_MAX_LENGTH ||
            !isLikelyBase64(dmEncryptionPublicKey)
        ) {
            return NextResponse.json(
                { error: "Invalid dmEncryptionPublicKey" },
                { status: 400 },
            );
        }

        const profile = await getOrCreateUserProfile(user.$id, user.name);
        const updated = await updateUserProfile(profile.$id, {
            dmEncryptionPublicKey,
        });

        return NextResponse.json({
            dmEncryptionPublicKey: updated.dmEncryptionPublicKey,
            userId: user.$id,
        });
    } catch (error) {
        logger.error("Failed to update DM encryption key metadata", {
            error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
