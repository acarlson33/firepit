import React, { useMemo } from "react";
import { Linking, Text, View, type TextStyle } from "react-native";
import Markdown from "react-native-markdown-display";
import { parseMentions } from "@/lib/mention-utils";
import { EmojiRenderer, type CustomEmoji } from "@/components/emoji-renderer";
import { useTheme } from "@/hooks/use-theme";

type MessageWithMentionsProps = {
  text: string;
  customEmojis?: CustomEmoji[];
};

const MARKDOWN_PATTERN =
  /(\*\*|__|\*[^*\n]+\*|_[^_\n]+_|~~|`|\[[^\]]+\]\([^)]+\)|^\s{0,3}(?:[-+*]|\d+\.)\s+|^\s{0,3}>\s+|^\s{0,3}#{1,6}\s+)/;

const CODE_REGEX = /`([^`]+)`/g;
const LINK_REGEX = /(https?:\/\/[^\s]+)/g;
const BOLD_REGEX = /\*\*([^*]+)\*\*/g;
const ITALIC_REGEX = /\*([^*]+)\*/g;

type InlineRule = {
  regex: RegExp;
  recurseKey: string;
  render: (match: RegExpExecArray, key: string) => React.ReactNode;
};

export function MessageWithMentions({
  text,
  customEmojis = [],
}: MessageWithMentionsProps) {
  const colors = useTheme();

  return useMemo(() => {
    // Render emoji + mention tokens in a plain-text fragment (used by markdown text rule)
    const renderPlainText = (txt: string, keyBase: string): React.ReactNode[] => {
      const mentionMatches = parseMentions(txt);
      if (mentionMatches.length === 0) {
        return [
          <EmojiRenderer key={`${keyBase}-e`} text={txt} customEmojis={customEmojis} />,
        ];
      }
      const nodes: React.ReactNode[] = [];
      let lastIndex = 0;
      for (const m of mentionMatches) {
        if (m.startIndex > lastIndex) {
          nodes.push(
            <EmojiRenderer
              key={`${keyBase}-t${lastIndex}`}
              text={txt.slice(lastIndex, m.startIndex)}
              customEmojis={customEmojis}
            />,
          );
        }
        nodes.push(
          <Text
            key={`${keyBase}-m${m.startIndex}`}
            style={{
              fontWeight: "700",
              backgroundColor: colors.accent,
              color: colors.accentForeground,
              paddingHorizontal: 4,
            }}
          >
            {m.fullMatch}
          </Text>,
        );
        lastIndex = m.endIndex;
      }
      if (lastIndex < txt.length) {
        nodes.push(
          <EmojiRenderer
            key={`${keyBase}-t${lastIndex}`}
            text={txt.slice(lastIndex)}
            customEmojis={customEmojis}
          />,
        );
      }
      return nodes;
    };

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
        <Markdown
          style={mdStyles}
          rules={{
            text: (node) => renderPlainText(node.content ?? "", "md"),
          }}
        >
          {text}
        </Markdown>
      </View>
    );
  }

  // Enhanced inline markdown renderer (bold, italic, code, links)
  type Renderer = (txt: string, keyBase: string) => React.ReactNode[];

  const inlineRules: InlineRule[] = [
    {
      regex: CODE_REGEX,
      recurseKey: "c",
      render: (m, key) => (
        <Text
          key={key}
          style={{
            fontFamily: "monospace",
            backgroundColor: colors.backgroundElement,
            paddingHorizontal: 4,
            fontSize: 13,
          }}
        >
          {m[1]}
        </Text>
      ),
    },
    {
      regex: LINK_REGEX,
      recurseKey: "l",
      render: (m, key) => (
        <Text
          key={key}
          style={{ color: colors.primary, textDecorationLine: "underline" }}
          onPress={() => {
            Linking.openURL(m[0]).catch(() => {
              // Ignore: URL could not be opened.
            });
          }}
        >
          {m[0]}
        </Text>
      ),
    },
    {
      regex: BOLD_REGEX,
      recurseKey: "b",
      render: (m, key) => (
        <Text key={key} style={{ fontWeight: "700" }}>
          {m[1]}
        </Text>
      ),
    },
    {
      regex: ITALIC_REGEX,
      recurseKey: "i",
      render: (m, key) => (
        <Text key={key} style={{ fontStyle: "italic" }}>
          {m[1]}
        </Text>
      ),
    },
  ];

  const renderInlineMarkdown: Renderer = (txt, keyBase) => {
    for (const rule of inlineRules) {
      const regex = rule.regex;
      regex.lastIndex = 0;
      if (!regex.test(txt)) continue;
      regex.lastIndex = 0;

      const parts: React.ReactNode[] = [];
      let last = 0;
      let i = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(txt)) !== null) {
        if (m.index > last) {
          parts.push(
            ...renderInlineMarkdown(
              txt.slice(last, m.index),
              `${keyBase}-${rule.recurseKey}${i}-a`,
            ),
          );
        }
        parts.push(rule.render(m, `${keyBase}-${rule.recurseKey}-${i}`));
        last = m.index + m[0].length;
        i++;
      }
      if (last < txt.length) {
        parts.push(
          ...renderInlineMarkdown(
            txt.slice(last),
            `${keyBase}-${rule.recurseKey}${i}-b`,
          ),
        );
      }
      return parts;
    }

    // Fallback: render with emoji renderer
    return [<EmojiRenderer key={keyBase + "-e"} text={txt} customEmojis={customEmojis} />];
  };

  // Split mentions and render tokens
  const parts: Array<{ text: string; isMention?: boolean; offset: number }> = [];
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
      parts.push({ text: text.slice(lastIndex, m.startIndex), offset: lastIndex });
    }
    parts.push({ text: m.fullMatch, isMention: true, offset: m.startIndex });
    lastIndex = m.endIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), offset: lastIndex });
  }

  return (
    <Text style={{ color: colors.text }}>
      {parts.map((p, i) =>
        p.isMention ? (
          <Text
            key={`${p.offset}-${p.text}`}
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
