import React from "react";
import { Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { parseMentions } from "@/lib/mention-utils";
import EmojiRenderer from "@/components/emoji-renderer";
import { useTheme } from "@/hooks/use-theme";

type MessageWithMentionsProps = {
  text: string;
  currentUserId?: string;
  knownNames?: string[];
};

export function MessageWithMentions({ text }: MessageWithMentionsProps) {
  const colors = useTheme();
  const MARKDOWN_PATTERN = /(\*\*|__|\*[^*\n]+\*|_[^_\n]+_|~~|`|\[[^\]]+\]\([^)]+\)|^\s{0,3}(?:[-+*]|\d+\.)\s+|^\s{0,3}>\s+|^\s{0,3}#{1,6}\s+)/m;

  // If the text contains block or inline markdown, render with a full markdown renderer
  if (MARKDOWN_PATTERN.test(text)) {
    return (
      <View>
        <Markdown style={{ body: { color: colors.text } }}>{text}</Markdown>
      </View>
    );
  }

  // Enhanced inline markdown renderer (bold, italic, code, links)
  type Renderer = (txt: string, keyBase: string) => React.ReactNode[];

  const renderInlineMarkdown: Renderer = (txt, keyBase) => {
    // Order: code -> link -> bold -> italic -> fallback (emoji)
    const codeRegex = /`([^`]+)`/g;
    if (codeRegex.test(txt)) {
      codeRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = codeRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-c${i}-a`));
        }
        parts.push(
          <Text key={`${keyBase}-code-${i}`} style={{ fontFamily: "monospace", backgroundColor: colors.backgroundElement, paddingHorizontal: 4 }}>
            {m[1]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length) parts.push(...renderInlineMarkdown(txt.slice(last), `${keyBase}-c${i}-b`));
      return parts;
    }

    const linkRegex = /(https?:\/\/[^\s]+)/g;
    if (linkRegex.test(txt)) {
      linkRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = linkRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-l${i}-a`));
        }
        parts.push(
          <Text key={`${keyBase}-link-${i}`} style={{ color: colors.primary, textDecorationLine: "underline" }} onPress={() => { /* implement linking if desired */ }}>
            {m[0]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length) parts.push(...renderInlineMarkdown(txt.slice(last), `${keyBase}-l${i}-b`));
      return parts;
    }

    const boldRegex = /\*\*([^*]+)\*\*/g;
    if (boldRegex.test(txt)) {
      boldRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = boldRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-b${i}-a`));
        }
        parts.push(
          <Text key={`${keyBase}-bold-${i}`} style={{ fontWeight: "700" }}>
            {m[1]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length) parts.push(...renderInlineMarkdown(txt.slice(last), `${keyBase}-b${i}-b`));
      return parts;
    }

    const italicRegex = /\*([^*]+)\*/g;
    if (italicRegex.test(txt)) {
      italicRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = italicRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-i${i}-a`));
        }
        parts.push(
          <Text key={`${keyBase}-italic-${i}`} style={{ fontStyle: "italic" }}>
            {m[1]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length) parts.push(...renderInlineMarkdown(txt.slice(last), `${keyBase}-i${i}-b`));
      return parts;
    }

    // Fallback: render with emoji renderer which handles :emoji: and standard emoji
    return [<EmojiRenderer key={keyBase + "-e"} text={txt} />];
  };

  // Split mentions and render tokens
  const parts: Array<{ text: string; isMention?: boolean }> = [];
  const matches = parseMentions(text);
  if (matches.length === 0) {
    return (
      <View>
        <Text style={{ color: colors.text }}>{renderInlineMarkdown(text, "root")}</Text>
      </View>
    );
  }

  let lastIndex = 0;
  for (const m of matches) {
    if (m.startIndex > lastIndex) {
      parts.push({ text: text.slice(lastIndex, m.startIndex) });
    }
    parts.push({ text: m.fullMatch, isMention: true });
    lastIndex = m.endIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  return (
    <Text style={{ color: colors.text }}>
      {parts.map((p, i) =>
        p.isMention ? (
          <Text key={i} style={{ fontWeight: "700", backgroundColor: colors.accent, color: colors.accentForeground, paddingHorizontal: 4 }}>
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{renderInlineMarkdown(p.text, `p-${i}`)}</Text>
        ),
      )}
    </Text>
  );
}

export default MessageWithMentions;
