import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Terms of Service | firepit",
    description: "Terms governing use of the firepit service.",
};

export default function TermsOfServicePage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-10">
            <div className="mb-8 rounded-xl border bg-card p-6">
                <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
                    Legal
                </p>
                <h1 className="font-semibold text-3xl text-foreground">
                    Terms of Service
                </h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    These terms describe expectations for using firepit,
                    including acceptable use, account responsibility, and
                    service limitations.
                </p>
            </div>

            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Introduction
                    </h2>
                    <p>
                        firepit is open-source software. The instance where you
                        are reading this policy may not be operated by the
                        original developer or maintainer of this application.
                    </p>
                    <p className="mt-3">
                        Because open-source software can be modified, we cannot
                        guarantee that every deployment uses the same code or
                        policies. As a result, we cannot provide a universally
                        binding legal agreement for every firepit instance.
                    </p>
                    <p className="mt-3">
                        This document may include provisions that are treated as
                        legally binding in some jurisdictions, but
                        enforceability depends on local law and the specific
                        operator of the instance.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Acceptable Use
                    </h2>
                    <p>
                        You agree not to use this service for unlawful activity.
                        If you do, the instance operator may suspend or ban your
                        account and take other actions necessary to enforce this
                        policy.
                    </p>
                    <p className="mt-3">
                        Where required by applicable law, operators may disclose
                        relevant information to law enforcement.
                    </p>
                    <p className="mt-3">
                        If you commit a crime while using this software, you are
                        responsible for resulting liability and damages.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Accounts
                    </h2>
                    <p>
                        You are responsible for maintaining the security of your
                        account credentials and for activity performed through
                        your account, including messages sent and files
                        uploaded.
                    </p>
                    <p className="mt-3">
                        If content is found to include CSAM (Child Sexual Abuse
                        Material), operators or administrators will remove it
                        and take the reporting steps required by law.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Content and Moderation
                    </h2>
                    <p>
                        We may remove content or restrict access when required
                        for safety, legal compliance, or policy enforcement.
                    </p>
                </section>

                <section className="rounded-xl border bg-card p-6">
                    <h2 className="mb-3 font-medium text-foreground text-lg">
                        Service Availability
                    </h2>
                    <p>
                        The service is provided as-is and may change over time.
                        We may update, suspend, or discontinue features at any
                        time.
                    </p>
                    <p className="mt-3">
                        We aim to provide a stable experience, but we are not
                        required to continue supporting every feature
                        indefinitely.
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
