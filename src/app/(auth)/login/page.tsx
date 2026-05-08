import { FEATURE_FLAGS, getFeatureFlag } from "@/lib/feature-flags";

import LoginForm from "./login-form";

export default async function LoginPage() {
    const showResendVerification = await getFeatureFlag(
        FEATURE_FLAGS.ENABLE_EMAIL_VERIFICATION,
    );

    return <LoginForm showResendVerification={showResendVerification} />;
}
