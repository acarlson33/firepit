import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";

import LoginForm from "./login-form";

export default async function LoginPage() {
    let showResendVerification = false;
    try {
        const flag = await getFeatureFlag(
            FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION,
        );
        showResendVerification = Boolean(flag);
    } catch (err) {
        // If flag lookup fails, default to false and surface the error for debugging
        // but avoid breaking the page render.
        // eslint-disable-next-line no-console
        console.error("Failed to read feature flag ENABLE_EMAIL_VERIFICATION", err);
    }

    return <LoginForm showResendVerification={showResendVerification} />;
}
