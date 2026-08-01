# React Native Emoji Picker

<div align="center">
  <img src="https://img.shields.io/npm/v/@hiraku-ai/react-native-emoji-picker?style=flat-square" alt="npm version" />
  <img src="https://img.shields.io/npm/l/@hiraku-ai/react-native-emoji-picker?style=flat-square" alt="license" />
  <img src="https://img.shields.io/npm/dt/@hiraku-ai/react-native-emoji-picker?style=flat-square" alt="downloads" />
</div>

<p align="center">
  <img src="https://raw.githubusercontent.com/hirakudotai/react-native-emoji-picker/main/images/hiraku-react-native-emoji-picker.jpg" alt="React Native Emoji Picker" width="600" />
</p>

A powerful, flexible emoji picker for React Native with modal and inline modes, extensive customization, and cross-platform support.

**Important note:** This component was “vibe coded,” so it may have issues. Please use it with caution.

## ✨ Features

- **🎯 Flexible Integration** - Modal, inline, or headless with hooks
- **🛠️ High Customization** - Allows for almost total freedom
- **🔍 Smart Search** - Fast emoji search with debouncing
- **📂 Category Navigation** - Intuitive tab-based browsing
- **🕐 Recent Emojis** - Automatically tracks frequently used emojis
- **🎨 Full Theming** - Built-in dark mode + custom themes
- **⚡ High Performance** - Optimized FlatList rendering
- **📱 Cross-Platform** - iOS, Android, and Web ready

## 🎉 Expo Go Compatible

This library works seamlessly with **Expo Go** - no custom native code required! All dependencies are supported in Expo managed workflow. Just install and start using it in your Expo projects.

## 🎮 Live Demo

Try out the interactive demo with customization options: **[react-native-emoji-picker.netlify.app](https://react-native-emoji-picker.netlify.app/)**

## 📦 Installation

```bash
npm install @hiraku-ai/react-native-emoji-picker
```

### Peer Dependencies

```bash
npm install @react-native-async-storage/async-storage react-native-svg
```

## 🚀 Quick Start

### Modal Version

```jsx
import React, { useState } from 'react';
import EmojiPickerModal, { emojiData } from '@hiraku-ai/react-native-emoji-picker';

function App() {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Button title="Pick Emoji" onPress={() => setVisible(true)} />
      <EmojiPickerModal
        visible={visible}
        onClose={() => setVisible(false)}
        onEmojiSelect={(emoji) => console.log(emoji)}
        emojis={emojiData}
      />
    </>
  );
}
```

### Inline Version

```jsx
import { EmojiPicker, emojiData } from '@hiraku-ai/react-native-emoji-picker';

<View style={{ height: 400 }}>
  <EmojiPicker
    emojis={emojiData}
    onEmojiSelect={(emoji) => console.log(emoji)}
    onClose={() => {}}
  />
</View>
```

### Bottom Sheet / Gesture Handler

Pass `BottomSheetFlatList` for both props to fix scroll conflicts on Android when using `@gorhom/bottom-sheet`.

```jsx
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { EmojiPicker, emojiData } from '@hiraku-ai/react-native-emoji-picker';

<EmojiPicker
  emojis={emojiData}
  onEmojiSelect={(emoji) => console.log(emoji)}
  FlatListComponent={BottomSheetFlatList}
  TabFlatListComponent={BottomSheetFlatList}
/>
```

### Headless Mode

```jsx
import { useEmojiPicker, useEmojiPickerRenderer, EmojiPickerThemeProvider, emojiData } from '@hiraku-ai/react-native-emoji-picker';

function CustomPickerContent() {
  const { flatListData, emojiSections, selectedSkinTone, searchQuery, getModifiedEmoji, updateRecentEmojis } = useEmojiPicker({
    emojis: emojiData
  });

  const { renderItem, renderEmptyComponent } = useEmojiPickerRenderer({
    onEmojiSelect: (emoji) => console.log(emoji),
    getModifiedEmoji,
    updateRecentEmojis,
    selectedSkinTone,
    emojiSections,
    searchQuery,
  });

  // Bring your own scroll component
  return (
    <YourFlatList
      data={flatListData}
      renderItem={renderItem}
      ListEmptyComponent={renderEmptyComponent}
      keyExtractor={(item) => item.id}
    />
  );
}

function CustomPicker() {
  return (
    <EmojiPickerThemeProvider>
      <CustomPickerContent />
    </EmojiPickerThemeProvider>
  );
}
```

## 📚 What's Included

### 🎯 Ready-to-Use Components
Drop these in and you're done:
- `EmojiPickerModal` - Full-featured modal with everything built-in
- `EmojiPicker` - Embeddable inline version

### 🔧 Building Blocks for Custom UIs
Mix and match these standalone components:
- `EmojiSearch` - Search bar with debouncing
- `EmojiTabs` - Category navigation tabs
- `SkinToneSelector` - Skin tone picker button
- All category icons - Use our icon set in your custom UI

### 🎨 Headless Mode for Total Control
Build completely custom interfaces:
- `useEmojiPicker` - All logic: search, filtering, recent emojis, skin tones, category ordering
- `useEmojiPickerRenderer` - Ready-made `renderItem` and `renderEmptyComponent` for your own scroll component
- Complete control over layout — works with `BottomSheetFlatList`, `FlashList`, or anything FlatList-compatible

### 🎭 Theme System
- `EmojiPickerThemeProvider` - Wrap your app for consistent theming
- `useEmojiPickerTheme` - Access theme values anywhere
- `lightTheme` / `darkTheme` - Pre-built themes
- `PartialTheme` - Override specific colors

### 📦 Data & Utilities
- `emojiData` - Complete emoji dataset (3600+ emojis)
- `SKIN_TONES` - All skin tone modifiers
- `Category` - Category constants
- Full TypeScript types included

## 📖 Documentation

- [API Reference](./documentation/api-reference.md) - Complete prop reference
- [Theming Guide](./documentation/theming.md) - Customizing colors and styles  
- [Advanced Features](./documentation/advanced-features.md) - Filtering, custom renders, performance
- [Headless Mode](./documentation/headless-mode.md) - Build custom UIs with hooks
- [TypeScript Guide](./documentation/typescript-guide.md) - Type definitions and examples


## 📄 License

Apache License 2.0

## 👨‍💻 Author

**Stef Buzas** ([https://stefbuzas.com](https://stefbuzas.com)) at Hiraku ([https://hiraku.ai](https://hiraku.ai))

## 🔗 Links

- [GitHub](https://github.com/hirakudotai/react-native-emoji-picker)
- [Issues](https://github.com/hirakudotai/react-native-emoji-picker/issues)
- [NPM](https://www.npmjs.com/package/@hiraku-ai/react-native-emoji-picker)

