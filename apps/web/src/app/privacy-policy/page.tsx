import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Privacy Policy | firepit",
    description: "How firepit collects, uses, and protects your data.",
};

export default function PrivacyPolicyPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-10">
            <div className="mb-8 rounded-xl border bg-card p-6">
                <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
                    Legal
                </p>
                <h1 className="font-semibold text-3xl text-foreground">
                    Privacy Policy
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    This page describes what data firepit collects, how that
                    data is used, and important limitations for self-hosted and
                    open-source deployments.
                </p>
            </div>

            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Introduction and Notices
                    </h2>
                    <p>
                        Welcome to the firepit Privacy Policy. This document is
                        intended to clearly explain your rights as a user of the
                        service.
                    </p>
                    <p className="mt-3">
                        firepit is open-source software. The instance where you
                        are reading this policy may not be operated by the
                        original maintainer of the application. Because
                        open-source software can be modified by anyone, we
                        cannot guarantee that every deployment matches the
                        original codebase or policy text.
                    </p>
                    <p className="mt-3">
                        For that reason, this page focuses on transparency about
                        what the original program collects and how it is
                        intended to function.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Information We Collect
                    </h2>
                    <p>
                        We collect account details (such as email and display
                        name), usage activity needed to operate chat features,
                        and limited telemetry for reliability and product
                        improvement.
                    </p>
                    <p className="mt-3">
                        While message content is stored to provide core chat
                        functionality, it is not intentionally collected for
                        analytics purposes.
                    </p>

                    <ul className="mt-4 list-disc space-y-2 pl-6">
                        <li>
                            Account information: email, display name, and
                            profile picture (if provided).
                        </li>
                        <li>
                            Usage data: feature usage, performance metrics, and
                            error reports.
                        </li>
                        <li>
                            Message content: stored to provide messaging
                            functionality.
                        </li>
                        <li>
                            Metadata: timestamps, message IDs, and read receipts
                            used for core messaging features.
                        </li>
                        <li>
                            Telemetry: PostHog may collect additional data
                            needed for analytics and reliability.
                            <ul className="mt-2 list-disc space-y-2 pl-6">
                                <li>
                                    Device information: browser type, operating
                                    system, and device model.
                                </li>
                                <li>
                                    Interaction data: clicks, page views, and
                                    feature usage.
                                </li>
                                <li>
                                    Performance data: load times, error rates,
                                    and related diagnostics.
                                </li>
                                <li>
                                    Location data: IP-based inferred location
                                    for security and analytics. This is
                                    generally city-level and not precise GPS
                                    data.
                                </li>
                            </ul>
                        </li>
                    </ul>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        How We Use Data
                    </h2>
                    <p>
                        firepit instances collect data to deliver application
                        functionality such as authentication, messaging, and
                        moderation.
                    </p>
                    <p className="mt-3">
                        Depending on deployment settings, some account-related
                        information may be accessible to the instance operator
                        and to backend services that power the app. Operators
                        may be able to reset account credentials, but should not
                        be able to view plaintext passwords.
                    </p>
                    <p className="mt-3">
                        Telemetry data may be used by an instance operator to
                        troubleshoot and improve the service. Because
                        deployments are independently operated, we cannot
                        guarantee how each operator handles data beyond the
                        defaults in this codebase.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Data Retention
                    </h2>
                    <p>
                        Data retention can vary by deployment and provider plan.
                        For example, PostHog commonly provides retention such
                        as:
                    </p>
                    <ul className="mt-3 list-disc space-y-2 pl-6">
                        <li>Free plan: typically up to 1 year.</li>
                        <li>Paid plans: may allow longer retention windows.</li>
                    </ul>
                    <p className="mt-3">
                        Message and account data may be retained by default to
                        provide core functionality, while telemetry may be kept
                        for shorter periods to balance insight with privacy.
                    </p>
                    <p className="mt-3">
                        Instance operators can adjust retention settings based
                        on their infrastructure and policy requirements.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Contact
                    </h2>
                    <p>
                        If you have privacy questions, contact your instance
                        administrators using the support channels they provide.
                    </p>
                </section>
            </div>

            <div className="mt-8 rounded-lg border bg-card p-4">
                <Link className="text-primary underline" href="/register">
                    Back to registration
                </Link>
            </div>
        </div>
    );
}
