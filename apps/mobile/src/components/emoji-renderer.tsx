import React, { useMemo, useEffect, useState } from "react";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import { cacheManager } from "@/lib/cache/CacheManager";

export type CustomEmoji = {
  fileId: string;
  url: string;
  name: string;
};

type Props = {
  text: string;
  customEmojis?: CustomEmoji[];
};

function CachedEmojiImage({ name, url }: { name: string; url: string }) {
  const [cachedUri, setCachedUri] = useState<string | null>(null);

  useEffect(() => {
    if (!cacheManager.shouldCacheEmojis()) return;
    let cancelled = false;
    cacheManager
      .getCachedEmoji(name)
      .then((cached) => {
        if (cancelled) return;
        if (cached) {
          setCachedUri(cached);
        } else {
          cacheManager
            .cacheEmoji(name, url)
            .then((downloaded) => {
              if (!cancelled && downloaded) setCachedUri(downloaded);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [name, url]);

  return (
    <Image
      source={{ uri: cachedUri || url }}
      style={{ width: 20, height: 20 }}
      contentFit="contain"
    />
  );
}

// Basic mapping of common emoji names to unicode
export const STANDARD_EMOJI: Record<string, string> = {
  smile: "😄",
  grin: "😁",
  joy: "😂",
  rofl: "🤣",
  sweat_smile: "😅",
  laughing: "😆",
  wink: "😉",
  blush: "😊",
  yum: "😋",
  sunglasses: "😎",
  heart_eyes: "😍",
  kissing_heart: "😘",
  kissing: "😗",
  kissing_closed_eyes: "😙",
  stuck_out_tongue_winking_eye: "😜",
  stuck_out_tongue: "😛",
  neutral_face: "😐",
  expressionless: "😑",
  no_mouth: "😶",
  smirk: "😏",
  unamused: "😒",
  roll_eyes: "🙄",
  grimacing: "😬",
  lying_face: "🤥",
  relieved: "😌",
  pensive: "😔",
  sleepy: "😪",
  sleeping: "😴",
  mask: "😷",
  face_with_thermometer: "🤒",
  face_with_head_bandage: "🤕",
  nauseated_face: "🤢",
  sneezing_face: "🤧",
  hot_face: "🥵",
  cold_face: "🥶",
  woozy_face: "🥴",
  dizzy_face: "😵",
  exploding_head: "🤯",
  cowboy_hat_face: "🤠",
  partying_face: "🥳",
  star_struck: "🤩",
  zany_face: "🤪",
  shushing_face: "🤫",
  face_with_symbols_over_mouth: "🤬",
  face_with_hand_over_mouth: "🤭",
  thinking: "🤔",
  zipper_mouth_face: "🤐",
  face_with_raised_eyebrow: "🤨",
  hushed: "😯",
  frowning: "😦",
  anguished: "😧",
  fearful: "😨",
  weary: "😩",
  angry: "😠",
  rage: "😡",
  cry: "😢",
  sob: "😭",
  scream: "😱",
  confounded: "😖",
  persevere: "😣",
  disappointed: "😞",
  sweat: "😓",
  tired_face: "😫",
  yawning_face: "🥱",
  triumph: "😤",
  angry_face: "😠",
  smiling_face_with_halo: "😇",
  imp: "👿",
  skull: "💀",
  skull_and_crossbones: "☠",
  poop: "💩",
  clown_face: "🤡",
  japanese_ogre: "👹",
  japanese_goblin: "👺",
  ghost: "👻",
  alien: "👽",
  robot: "🤖",
  wave: "👋",
  raised_hand: "✋",
  ok_hand: "👌",
  v: "✌",
  crossed_fingers: "🤞",
  love_you_gesture: "🤟",
  metal: "🤘",
  call_me_hand: "🤙",
  point_left: "👈",
  point_right: "👉",
  point_up_2: "👆",
  middle_finger: "🖕",
  point_down: "👇",
  point_up: "☝",
  thumbsup: "👍",
  thumbsdown: "👎",
  fist: "✊",
  punch: "👊",
  clap: "👏",
  raised_hands: "🙌",
  open_hands: "👐",
  palms_up_together: "🤲",
  handshake: "🤝",
  pray: "🙏",
  nail_care: "💅",
  selfie: "🤳",
  muscle: "💪",
  leg: "🦵",
  foot: "🦶",
  ear: "👂",
  nose: "👃",
  brain: "🧠",
  tooth: "🦷",
  bone: "🦴",
  eyes: "👀",
  eye: "👁",
  tongue: "👅",
  lips: "👄",
  baby: "👶",
  child: "🧒",
  boy: "👦",
  girl: "👧",
  adult: "🧑",
  man: "👨",
  woman: "👩",
  older_adult: "🧓",
  old_man: "👴",
  old_woman: "👵",
  heart: "❤",
  orange_heart: "🧡",
  yellow_heart: "💛",
  green_heart: "💚",
  blue_heart: "💙",
  purple_heart: "💜",
  black_heart: "🖤",
  brown_heart: "🤎",
  white_heart: "🤍",
  broken_heart: "💔",
  heartpulse: "💗",
  heartbeat: "💓",
  two_hearts: "💕",
  sparkling_heart: "💖",
  revolving_hearts: "💞",
  cupid: "💘",
  gift_heart: "💝",
  heart_decoration: "💟",
  heavy_heart_exclamation: "❣",
  fire: "🔥",
  sparkles: "✨",
  star: "⭐",
  star2: "🌟",
  dizzy: "💫",
  boom: "💥",
  anger: "💢",
  sweat_drops: "💦",
  dash: "💨",
  hole: "🕳",
  speech_balloon: "💬",
  eye_in_speech_bubble: "👁‍🗨",
  right_anger_bubble: "🗯",
  thought_balloon: "💭",
  zzz: "💤",
  ok: "🆗",
  yes: "✅",
  no: "❌",
  check_mark: "✅",
  cross_mark: "❌",
  plus: "➕",
  minus: "➖",
  multiply: "✖",
  divide: "➗",
  question: "❓",
  exclamation: "❗",
  warning: "⚠",
  bangbang: "‼",
  interrobang: "⁉",
  100: "💯",
  heavy_check_mark: "✔",
  x: "❌",
  recycle: "♻",
  trident: "🔱",
  name_badge: "📛",
  beginner: "🔰",
  o: "⭕",
  white_check_mark: "✅",
  ballot_box_with_check: "☑",
  radio_button: "🔘",
  link: "🔗",
  curly_loop: "➰",
  wavy_dash: "〰",
  part_alternation_mark: "〽",
  triangular_flag_on_post: "🚩",
  crossed_flags: "🎌",
  black_flag: "🏴",
  white_flag: "🏳",
  checkered_flag: "🏁",
  triangular_flag: "🚩",
  rainbow_flag: "🏳‍🌈",
  pirate_flag: "🏴‍☠",
  atom_symbol: "⚛",
  om: "🕉",
  star_of_david: "✡",
  wheel_of_dharma: "☸",
  yin_yang: "☯",
  latin_cross: "✝",
  orthodox_cross: "☦",
  star_and_crescent: "☪",
  peace_symbol: "☮",
  menorah: "🕎",
  six_pointed_star: "🔯",
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpius: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
  ophiuchus: "⛎",
  six: "6️⃣",
  seven: "7️⃣",
  eight: "8️⃣",
  nine: "9️⃣",
  keycap_ten: "🔟",
  zero: "0️⃣",
  one: "1️⃣",
  two: "2️⃣",
  three: "3️⃣",
  four: "4️⃣",
  five: "5️⃣",
  hash: "#️⃣",
  asterisk: "*️⃣",
  eject_button: "⏏",
  arrow_forward: "▶",
  pause_button: "⏸",
  play_pause: "⏯",
  stop_button: "⏹",
  record_button: "⏺",
  next_track_button: "⏭",
  previous_track_button: "⏮",
  fast_forward: "⏩",
  rewind: "⏪",
  arrow_double_up: "⏫",
  arrow_double_down: "⏬",
  arrow_backward: "◀",
  arrow_up_small: "🔼",
  arrow_down_small: "🔽",
  arrow_right: "➡",
  arrow_left: "⬅",
  arrow_up: "⬆",
  arrow_down: "⬇",
  arrow_upper_right: "↗",
  arrow_lower_right: "↘",
  arrow_lower_left: "↙",
  arrow_upper_left: "↖",
  arrow_up_down: "↕",
  left_right_arrow: "↔",
  leftwards_arrow_with_hook: "↩",
  arrow_right_hook: "↪",
  arrow_heading_up: "⤴",
  arrow_heading_down: "⤵",
  information_source: "ℹ",
  copyright: "©",
  registered: "®",
  tm: "™",
  new: "🆕",
  free: "🆓",
  up: "🆙",
  cool: "🆒",
  ng: "🆖",
  cinema: "🎦",
  signal_strength: "📶",
  vibration_mode: "📳",
  mobile_phone_off: "📴",
  female_sign: "♀",
  male_sign: "♂",
  medical_symbol: "⚕",
  infinity: "♾",
  fleur_de_lis: "⚜",
  heart_exclamation: "❣",
  heavy_exclamation_mark: "❗",
  heavy_heart_exclamation_mark_ornament: "❣",
  heavy_plus_sign: "➕",
  heavy_minus_sign: "➖",
  heavy_division_sign: "➗",
  heavy_multiplication_x: "✖",
  ballot_box_with_ballot: "🗳",
  white_square_button: "🔳",
  black_square_button: "🔲",
  black_circle: "⚫",
  white_circle: "⚪",
  red_circle: "🔴",
  large_blue_circle: "🔵",
  large_orange_diamond: "🔶",
  large_blue_diamond: "🔷",
  small_orange_diamond: "🔸",
  small_blue_diamond: "🔹",
  small_red_triangle: "🔺",
  small_red_triangle_down: "🔻",
  white_square: "⬜",
  black_square: "⬛",
  red_square: "🟥",
  orange_square: "🟧",
  yellow_square: "🟨",
  green_square: "🟩",
  blue_square: "🟦",
  purple_square: "🟪",
  brown_square: "🟫",
  black_large_square: "⬛",
  white_large_square: "⬜",
  black_medium_square: "◼",
  white_medium_square: "◻",
  black_medium_small_square: "◾",
  white_medium_small_square: "◽",
  black_small_square: "▪",
  white_small_square: "▫",
  orange_circle: "🟠",
  yellow_circle: "🟡",
  green_circle: "🟢",
  purple_circle: "🟣",
  brown_circle: "🟤",
  brown: "🟤",
};

const EMOJI_TOKEN_PATTERN = /:([a-zA-Z0-9_+-]+):/g;

export function EmojiRenderer({ text, customEmojis = [] }: Props) {
  const parts = useMemo(() => {
    const result: Array<{ type: "text" | "emoji" | "custom"; content: string; offset: number; url?: string; name?: string }> = [];
    let lastIndex = 0;

    for (const match of text.matchAll(EMOJI_TOKEN_PATTERN)) {
      const [fullMatch, emojiName] = match;
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        result.push({ type: "text", content: text.slice(lastIndex, matchIndex), offset: lastIndex });
      }

      // Check custom emojis first
      const custom = customEmojis.find((e) => e.name.toLowerCase() === emojiName.toLowerCase());
      if (custom) {
        result.push({ type: "custom", content: fullMatch, offset: matchIndex, url: custom.url, name: custom.name });
      } else {
        // Check standard emoji
        const unicode = STANDARD_EMOJI[emojiName.toLowerCase()];
        if (unicode) {
          result.push({ type: "emoji", content: unicode, offset: matchIndex });
        } else {
          result.push({ type: "text", content: fullMatch, offset: matchIndex });
        }
      }

      lastIndex = matchIndex + fullMatch.length;
    }

    if (lastIndex < text.length) {
      result.push({ type: "text", content: text.slice(lastIndex), offset: lastIndex });
    }

    return result;
  }, [text, customEmojis]);

  if (parts.length === 0) return null;

  return (
    <Text>
      {parts.map((part) => {
        if (part.type === "custom" && part.url) {
          const emojiName = part.name ?? part.content;
          return (
            <CachedEmojiImage
              key={`${part.type}-${part.offset}`}
              name={emojiName}
              url={part.url}
            />
          );
        }
        return <Text key={`${part.type}-${part.offset}`}>{part.content}</Text>;
      })}
    </Text>
  );
}
