import React, { useMemo } from "react";
import { Linking, Text, View, type TextStyle } from "react-native";
import Markdown from "react-native-markdown-display";
import { parseMentions } from "@/lib/mention-utils";
import { EmojiRenderer, type CustomEmoji } from "@/components/emoji-renderer";
import { useTheme } from "@/hooks/use-theme";

type MessageWithMentionsProps = {
  text: string;
  currentUserId?: string;
  knownNames?: string[];
  customEmojis?: CustomEmoji[];
};

const MARKDOWN_PATTERN =
  /(\*\*|__|\*[^*\n]+\*|_[^_\n]+_|~~|`|\[[^\]]+\]\([^)]+\)|^\s{0,3}(?:[-+*]|\d+\.)\s+|^\s{0,3}>\s+|^\s{0,3}#{1,6}\s+)/;

export function MessageWithMentions({
  text,
  customEmojis = [],
}: MessageWithMentionsProps) {
  const colors = useTheme();

  return useMemo(() => {
    // If the text contains block or inline markdown, render with full markdown renderer
    if (MARKDOWN_PATTERN.test(text)) {
      const mdStyles: Record<string, TextStyle> = {
      body: { color: colors.text, fontSize: 14, lineHeight: 20 },
      strong: { fontWeight: "700" },
      em: { fontStyle: "italic" },
      del: { textDecorationLine: "line-through", opacity: 0.7 },
      code_inline: {
        fontFamily: "monospace",
        backgroundColor: colors.backgroundElement,
        paddingHorizontal: 4,
        paddingVertical: 1,
        borderRadius: 4,
        fontSize: 13,
      },
      fence: {
        fontFamily: "monospace",
        backgroundColor: colors.backgroundElement,
        padding: 8,
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 18,
      },
      blockquote: {
        borderLeftWidth: 2,
        borderLeftColor: colors.border,
        paddingLeft: 8,
        marginVertical: 4,
        fontStyle: "italic",
      },
      link: {
        color: colors.primary,
        textDecorationLine: "underline",
      },
      list_item: { marginVertical: 2 },
    };

    return (
      <View>
        <Markdown style={mdStyles}>{text}</Markdown>
      </View>
    );
  }

  // Enhanced inline markdown renderer (bold, italic, code, links)
  type Renderer = (txt: string, keyBase: string) => React.ReactNode[];

  const renderInlineMarkdown: Renderer = (txt, keyBase) => {
    // Code
    const codeRegex = /`([^`]+)`/g;
    if (codeRegex.test(txt)) {
      codeRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = codeRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(
            ...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-c${i}-a`),
          );
        }
        parts.push(
          <Text
            key={`${keyBase}-code-${i}`}
            style={{
              fontFamily: "monospace",
              backgroundColor: colors.backgroundElement,
              paddingHorizontal: 4,
              fontSize: 13,
            }}
          >
            {m[1]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length)
        parts.push(
          ...renderInlineMarkdown(txt.slice(last), `${keyBase}-c${i}-b`),
        );
      return parts;
    }

    // Links
    const linkRegex = /(https?:\/\/[^\s]+)/g;
    if (linkRegex.test(txt)) {
      linkRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      while (true) {
        const m = linkRegex.exec(txt);
        if (!m) break;
        if (m.index > last) {
          parts.push(
            ...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-l${i}-a`),
          );
        }
        parts.push(
          <Text
            key={`${keyBase}-link-${i}`}
            style={{ color: colors.primary, textDecorationLine: "underline" }}
            onPress={() => Linking.openURL(m[0])}
          >
            {m[0]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length)
        parts.push(
          ...renderInlineMarkdown(txt.slice(last), `${keyBase}-l${i}-b`),
        );
      return parts;
    }

    // Bold
    const boldRegex = /\*\*([^*]+)\*\*/g;
    if (boldRegex.test(txt)) {
      boldRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = boldRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(
            ...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-b${i}-a`),
          );
        }
        parts.push(
          <Text key={`${keyBase}-bold-${i}`} style={{ fontWeight: "700" }}>
            {m[1]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length)
        parts.push(
          ...renderInlineMarkdown(txt.slice(last), `${keyBase}-b${i}-b`),
        );
      return parts;
    }

    // Italic
    const italicRegex = /\*([^*]+)\*/g;
    if (italicRegex.test(txt)) {
      italicRegex.lastIndex = 0;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = italicRegex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(
            ...renderInlineMarkdown(txt.slice(last, m.index), `${keyBase}-i${i}-a`),
          );
        }
        parts.push(
          <Text key={`${keyBase}-italic-${i}`} style={{ fontStyle: "italic" }}>
            {m[1]}
          </Text>,
        );
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length)
        parts.push(
          ...renderInlineMarkdown(txt.slice(last), `${keyBase}-i${i}-b`),
        );
      return parts;
    }

    // Fallback: render with emoji renderer
    return [<EmojiRenderer key={keyBase + "-e"} text={txt} customEmojis={customEmojis} />];
  };

  // Split mentions and render tokens
  const parts: Array<{ text: string; isMention?: boolean }> = [];
  const matches = parseMentions(text);
  if (matches.length === 0) {
    return (
      <View>
        <Text style={{ color: colors.text }}>
          {renderInlineMarkdown(text, "root")}
        </Text>
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
          <Text
            key={i}
            style={{
              fontWeight: "700",
              backgroundColor: colors.accent,
              color: colors.accentForeground,
              paddingHorizontal: 4,
            }}
          >
            {p.text}
          </Text>
        ) : (
          renderInlineMarkdown(p.text, `p-${i}`)
        ),
      )}
    </Text>
  );
  }, [text, customEmojis, colors]);
}

export default MessageWithMentions;
