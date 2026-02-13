# New User Onboarding Flow

## Overview

This feature provides a guided onboarding experience for new users after they register an account. The flow helps users set up basic profile information including their display name and bio.

## User Flow

1. **Registration**: User creates an account at `/register`
2. **Redirect**: After successful registration, user is redirected to `/onboarding` (instead of directly to `/chat`)
3. **Profile Setup**: User is presented with a clean, welcoming form to:
   - Enter their display name (required)
   - Optionally add a bio/about section
   - Skip the setup if they prefer
4. **Completion**: After completing or skipping, user is redirected to `/chat`

## Design Principles

The onboarding UI follows the existing Firepit design system:

- **Consistent styling**: Uses the same Card, Button, Input, and Label components
- **Rounded borders**: 3xl rounded corners matching the app's aesthetic
- **Backdrop blur**: Glass-morphism effect with `bg-card/80 backdrop-blur`
- **Gradient accents**: Subtle sky/purple gradient icons
- **Accessible**: Proper labels, ARIA attributes, and keyboard navigation
- **Responsive**: Mobile-first design that scales to desktop

## Components

### `/app/onboarding/page.tsx`
- Client-side React component
- Form validation (display name required)
- Loading states
- Error handling with toast notifications
- Skip option for users who want to set up later

### `/app/onboarding/actions.ts`
- Server action for profile creation
- Uses existing `getOrCreateUserProfile` and `updateUserProfile` functions
- Validates input and handles errors gracefully

## Testing

Tests are located at `src/__tests__/onboarding.test.tsx` and cover:
- Component rendering
- Form field presence and validation
- Button functionality
- Display of user information

Run tests with:
```bash
npm run test src/__tests__/onboarding.test.tsx
```

## Customization

Users can always update their profile later in `/settings`, where they can:
- Change display name
- Update bio
- Add pronouns, location, website
- Upload avatar

## Future Enhancements

Potential improvements for future iterations:
- Multi-step wizard for additional profile fields
- Avatar upload during onboarding
- Server selection if multiple servers exist
- Welcome tour of the chat interface
- Profile completion percentage
