# Onboarding Flow UI Preview

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                   [Gradient Circle with ✨ Icon]               │
│                                                                 │
│                   Welcome to Firepit!                          │
│                                                                 │
│        Let's set up your profile so others can                 │
│               get to know you better.                          │
│                                                                 │
│           Logged in as demo@example.com                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Display Name *                                                │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ How should others see your name?                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│  This is how you'll appear in conversations and on your        │
│  profile.                                                      │
│                                                                 │
│  About You                                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │ Tell us a bit about yourself...                         │ │
│  │                                                           │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│  Share your interests, what you do, or anything that helps     │
│  others connect with you. (Optional)                          │
│                                                                 │
│  ┌──────────────────────────┐  ┌─────────────────────────┐   │
│  │   Complete Setup         │  │   Skip for now          │   │
│  └──────────────────────────┘  └─────────────────────────┘   │
│                                                                 │
│        You can always update your profile later in             │
│                         Settings.                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Design Features

### Card Container
- **Rounded corners**: `rounded-3xl` (very large radius)
- **Border**: Subtle `border-border/60` with transparency
- **Background**: Glass-morphism effect with `bg-card/80 backdrop-blur`
- **Shadow**: `shadow-xl` for depth
- **Padding**: Generous `p-10` spacing

### Header Section
- **Icon**: Gradient circle with sparkles icon
  - Size: 16x16 (4rem)
  - Gradient: `from-sky-400/60 via-purple-400/60 to-transparent`
  - Shadow for elevation
- **Title**: Large `text-3xl` font, semibold weight
- **Description**: Muted foreground color for hierarchy
- **User info**: Small text showing logged-in status

### Form Fields
- **Display Name**: Required field
  - Standard input with rounded borders
  - Placeholder text for guidance
  - Helper text below explaining usage
- **Bio/About**: Optional textarea
  - Larger height (min-h-[120px])
  - 4 rows visible
  - Helper text emphasizing optional nature

### Action Buttons
- **Complete Setup**: Primary button
  - Full width on mobile, flex-1 on desktop
  - Default variant (dark background)
  - Prominent placement
- **Skip for now**: Secondary button
  - Outline variant (light background, bordered)
  - Auto width on desktop
  - Gives users choice without pressure

### Footer
- Small centered text
- Muted color
- Reassures users they can change later

## Responsive Design

- **Mobile (< 640px)**: 
  - Full-width container with padding
  - Stacked buttons (vertical)
  - Single column layout

- **Desktop (≥ 640px)**:
  - Max-width container (max-w-2xl)
  - Buttons side-by-side
  - More comfortable spacing

## Accessibility

- ✅ Proper label associations
- ✅ Required field indicators
- ✅ Descriptive placeholders
- ✅ Helper text for context
- ✅ Keyboard navigation
- ✅ Focus states with ring
- ✅ ARIA attributes where needed
- ✅ High contrast text

## User Experience

1. **Welcoming**: Friendly tone with "Welcome to Firepit!"
2. **Clear purpose**: Explains why profile setup helps
3. **Flexible**: Users can skip and set up later
4. **Guided**: Helper text explains each field
5. **No pressure**: Optional fields and skip option
6. **Reassuring**: Footer reminds users they can change settings later

## Color Palette

- Primary text: `text-foreground` (dark in light mode, light in dark mode)
- Secondary text: `text-muted-foreground` (subdued)
- Borders: `border-border/60` (60% opacity for subtlety)
- Background: `bg-card/80` (80% opacity for glass effect)
- Accent: Sky and purple gradients

## Similar to Existing UI

This design matches:
- `/register` page: Similar card layout and form structure
- `/settings` page: Same input styling and helper text pattern
- `/` home page: Matching gradient accents and card borders
- Overall app: Consistent rounded-3xl borders and backdrop blur
