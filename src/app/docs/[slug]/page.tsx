import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocsMarkdown } from "@/components/docs-markdown";
import { DocsShell } from "@/components/docs-shell";
import { docsPages, getDocPage } from "@/lib/docs";

type Props = {
    params: Promise<{
        slug: string;
    }>;
};

export async function generateStaticParams() {
    return docsPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const page = await getDocPage(slug);

    if (!page) {
        return {
            title: "Docs | firepit",
        };
    }

    return {
        title: `${page.title} | Docs | firepit`,
        description: page.description,
    };
}

export default async function DocsDetailPage({ params }: Props) {
    const { slug } = await params;
    const page = await getDocPage(slug);

    if (!page) {
        notFound();
    }

    const toc = page.tableOfContents.filter((entry) => entry.level === 2);

    return (
        <DocsShell
            aside={
                toc.length > 0 ? (
                    <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            On This Page
                        </div>
                        <div className="space-y-2">
                            {toc.map((entry) => (
                                <Link
                                    className="block rounded-xl px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                    href={`#${entry.id}`}
                                    key={entry.id}
                                >
                                    {entry.title}
                                </Link>
                            ))}
                        </div>
                    </div>
                ) : null
            }
            currentSlug={page.slug}
            description={page.description}
            title={page.title}
        >
            <section className="rounded-3xl border border-border/60 bg-card/70 p-8 shadow-sm backdrop-blur-sm">
                <DocsMarkdown content={page.content} />
            </section>
        </DocsShell>
    );
}
