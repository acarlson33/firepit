import { Children, isValidElement } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function flattenText(children: React.ReactNode): string {
    return Children.toArray(children)
        .map((child) => {
            if (typeof child === "string" || typeof child === "number") {
                return String(child);
            }

            if (isValidElement<{ children?: React.ReactNode }>(child)) {
                return flattenText(child.props.children);
            }

            return "";
        })
        .join("");
}

function slugifyHeading(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

type DocsMarkdownProps = {
    content: string;
};

export function DocsMarkdown({ content }: DocsMarkdownProps) {
    return (
        <div className="space-y-6 text-sm leading-7 text-foreground sm:text-base">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    h1: ({ children }) => (
                        <h1 className="text-4xl font-semibold tracking-tight text-balance">
                            {children}
                        </h1>
                    ),
                    h2: ({ children }) => {
                        const id = slugifyHeading(flattenText(children));

                        return (
                            <h2
                                className="scroll-mt-24 border-t border-border/60 pt-8 text-2xl font-semibold tracking-tight"
                                id={id}
                            >
                                {children}
                            </h2>
                        );
                    },
                    h3: ({ children }) => {
                        const id = slugifyHeading(flattenText(children));

                        return (
                            <h3
                                className="scroll-mt-24 text-lg font-semibold tracking-tight"
                                id={id}
                            >
                                {children}
                            </h3>
                        );
                    },
                    p: ({ children }) => (
                        <p className="text-muted-foreground">{children}</p>
                    ),
                    ul: ({ children }) => (
                        <ul className="space-y-2 pl-5 text-muted-foreground marker:text-primary list-disc">
                            {children}
                        </ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="space-y-2 pl-5 text-muted-foreground marker:text-primary list-decimal">
                            {children}
                        </ol>
                    ),
                    li: ({ children }) => <li>{children}</li>,
                    hr: () => <hr className="border-border/60" />,
                    code: ({ children, className }) => {
                        if (className) {
                            return (
                                <code className="block overflow-x-auto rounded-2xl border border-border/60 bg-muted/70 px-4 py-3 font-mono text-xs leading-6 text-foreground">
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground">
                                {children}
                            </code>
                        );
                    },
                    pre: ({ children }) => <>{children}</>,
                    table: ({ children }) => (
                        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background/70">
                            <table className="min-w-full border-collapse text-left text-sm">
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead className="bg-muted/60">{children}</thead>
                    ),
                    th: ({ children }) => (
                        <th className="px-4 py-3 font-semibold text-foreground">
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td className="border-t border-border/50 px-4 py-3 text-muted-foreground">
                            {children}
                        </td>
                    ),
                    a: ({ children, href }) => (
                        <a
                            className="font-medium text-primary underline underline-offset-4"
                            href={href}
                        >
                            {children}
                        </a>
                    ),
                    blockquote: ({ children }) => (
                        <blockquote className="rounded-r-2xl border-l-4 border-primary/50 bg-muted/40 px-4 py-3 text-muted-foreground">
                            {children}
                        </blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
