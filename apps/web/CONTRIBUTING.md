# Contributing to Firepit

Thank you for your interest in contributing to Firepit! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

-   [Code of Conduct](#code-of-conduct)
-   [Getting Started](#getting-started)
-   [Development Workflow](#development-workflow)
-   [Code Style Guidelines](#code-style-guidelines)
-   [Testing Requirements](#testing-requirements)
-   [Pull Request Process](#pull-request-process)
-   [Issue Reporting](#issue-reporting)
-   [Project Architecture](#project-architecture)

## 🤝 Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

-   Be respectful and considerate in all interactions
-   Welcome newcomers and help them get started
-   Accept constructive criticism gracefully
-   Focus on what's best for the community
-   Show empathy towards other community members

## 🚀 Getting Started

### Prerequisites

-   Node.js 18+ or Bun 1.0+
-   Appwrite instance (cloud or self-hosted)
-   Git
-   Code editor (VS Code recommended)

### Initial Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/your-username/firepit.git
cd firepit
```

2. **Install dependencies**

```bash
bun install
```

3. **Set up environment variables**

```bash
cp .env.local.example .env.local
# Edit .env.local with your Appwrite credentials
```

4. **Validate configuration**

```bash
bun run validate-env
```

5. **Initialize database**

```bash
bun run setup
```

6. **Start development server**

```bash
bun dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the app.

## 🔄 Development Workflow

### Branching Strategy

-   `main` - Production-ready code
-   `develop` - Integration branch for features
-   `feature/*` - New features
-   `fix/*` - Bug fixes
-   `docs/*` - Documentation updates
-   `test/*` - Test improvements

### Creating a Feature Branch

```bash
# Update your local main branch
git checkout main
git pull origin main

# Create a feature branch
git checkout -b feature/your-feature-name
```

### Making Changes

1. **Write your code** following our [Code Style Guidelines](#code-style-guidelines)
2. **Add tests** for new functionality
3. **Run linter** to catch issues early:

```bash
bun lint
```

4. **Run tests** to ensure nothing breaks:

```bash
bun run test
```

5. **Commit your changes** with clear messages:

```bash
git add .
git commit -m "feat: add user profile editing functionality"
```

We follow [Conventional Commits](https://www.conventionalcommits.org/):

-   `feat:` - New feature
-   `fix:` - Bug fix
-   `docs:` - Documentation changes
-   `style:` - Code style changes (formatting, etc.)
-   `refactor:` - Code refactoring
-   `test:` - Adding or updating tests
-   `chore:` - Maintenance tasks

## 🎨 Code Style Guidelines

### TypeScript

-   **Use TypeScript** for all new code
-   **Define types** explicitly for function parameters and return values
-   **Avoid `any`** - use proper types or `unknown` when necessary
-   **Use interfaces** for object shapes, types for unions/intersections

```typescript
// ✅ Good
interface User {
    id: string;
    name: string;
    email: string;
}

async function getUser(userId: string): Promise<User> {
    // ...
}

// ❌ Bad
async function getUser(userId: any) {
    // ...
}
```

### React Components

-   **Use functional components** with hooks
-   **Destructure props** in function parameters
-   **Use arrow functions** for component definitions
-   **Name components** with PascalCase
-   **Export from bottom** of file

```typescript
// ✅ Good
interface ButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
}

const Button = ({ label, onClick, disabled = false }: ButtonProps) => {
    return (
        <button onClick={onClick} disabled={disabled}>
            {label}
        </button>
    );
};

export { Button };

// ❌ Bad
export default function button(props: any) {
    return <button onClick={props.onClick}>{props.label}</button>;
}
```

### Appwrite Integration

-   **Use centralized clients** from `src/lib/appwrite-core.ts`
-   **Handle errors** with try-catch and proper error types
-   **Use type guards** for Appwrite error checking
-   **Never expose** API keys in client code

```typescript
// ✅ Good
import { getUserClient } from "@/lib/appwrite-core";
import { isAppwriteError } from "@/lib/appwrite-errors";

export async function getUserProfile(userId: string) {
    try {
        const { databases } = getUserClient();
        const profile = await databases.getDocument("main", "profiles", userId);
        return { success: true, data: profile };
    } catch (error) {
        if (isAppwriteError(error) && error.code === 404) {
            return { success: false, error: "Profile not found" };
        }
        throw error;
    }
}
```

### Accessibility

-   **Use semantic HTML** (`<button>`, `<nav>`, `<main>`, etc.)
-   **Add ARIA labels** when necessary
-   **Ensure keyboard navigation** works
-   **Test with screen readers** when possible
-   **Don't use positive `tabIndex`** values

### File Organization

```
src/
├── app/                    # Next.js pages (App Router)
│   ├── page.tsx           # Route pages
│   └── layout.tsx         # Layouts
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   └── [feature].tsx     # Feature components
├── lib/                   # Utility functions
│   ├── appwrite-*.ts     # Appwrite integration modules
│   ├── utils.ts          # General utilities
│   └── types.ts          # Shared type definitions
└── __tests__/            # Test files (mirrors src structure)
```

## 🧪 Testing Requirements

### Test Coverage Goals

-   **Minimum 20% overall coverage** (currently at 22.36%)
-   **80%+ coverage for security modules** (auth, roles, permissions)
-   **100% pass rate** - No failing tests allowed in PRs
-   **Test new features** - All new code should include tests

### Writing Tests

We use Vitest for testing. Test files should:

-   Be placed in `src/__tests__/`
-   Have the same name as the file being tested with `.test.ts` suffix
-   Use descriptive test names that explain what's being tested

```typescript
// src/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { formatDate } from "@/lib/utils";

describe("formatDate", () => {
    it("should format ISO date to readable format", () => {
        const input = "2024-01-15T10:30:00Z";
        const output = formatDate(input);
        expect(output).toBe("January 15, 2024");
    });

    it("should handle invalid dates gracefully", () => {
        const input = "invalid-date";
        const output = formatDate(input);
        expect(output).toBe("Invalid Date");
    });
});
```

### Running Tests

```bash
# Run all tests
bun run test

# Run tests in watch mode
bun run test --watch

# Run with coverage report
bun run test:coverage

# Run specific test file
bun run test src/__tests__/utils.test.ts
```

### Test Best Practices

-   **Mock external dependencies** (Appwrite SDK, fetch calls)
-   **Test edge cases** (null, undefined, empty strings)
-   **Use descriptive assertions** with clear error messages
-   **Avoid test interdependencies** - each test should be independent
-   **Clean up after tests** using `afterEach` hooks

## 🔀 Pull Request Process

### Before Submitting

1. **Update your branch** with latest main:

```bash
git checkout main
git pull origin main
git checkout your-branch
git rebase main
```

2. **Run all checks**:

```bash
# Lint
bun lint

# Tests
bun run test

# Environment validation (if you changed env vars)
bun run validate-env
```

3. **Update documentation** if you:
    - Added new environment variables
    - Changed API endpoints
    - Added new features
    - Modified deployment process

### Submitting the PR

1. **Push your branch**:

```bash
git push origin your-branch
```

2. **Create PR on GitHub**:
    - Use clear, descriptive title
    - Follow the PR template
    - Link related issues
    - Add screenshots for UI changes
    - Request reviews from maintainers

### PR Template

```markdown
## Description

Brief description of what this PR does.

## Type of Change

-   [ ] Bug fix
-   [ ] New feature
-   [ ] Breaking change
-   [ ] Documentation update

## Changes Made

-   Change 1
-   Change 2
-   Change 3

## Testing

-   [ ] All existing tests pass
-   [ ] Added new tests for new functionality
-   [ ] Tested manually in browser
-   [ ] Tested on mobile/responsive

## Screenshots (if applicable)

[Add screenshots here]

## Related Issues

Closes #123
Related to #456

## Checklist

-   [ ] Code follows project style guidelines
-   [ ] Self-review completed
-   [ ] Comments added for complex code
-   [ ] Documentation updated
-   [ ] No new warnings generated
-   [ ] Tests pass locally
```

### Review Process

-   Maintainers will review your PR within 2-3 business days
-   Address feedback by pushing new commits
-   Once approved, maintainers will merge your PR
-   Your contribution will be credited in release notes

## 🐛 Issue Reporting

### Before Creating an Issue

1. **Search existing issues** to avoid duplicates
2. **Check documentation** (README, DEPLOYMENT.md)
3. **Try troubleshooting** steps in DEPLOYMENT.md
4. **Verify your environment** with `bun run validate-env`

### Bug Reports

Use the bug report template and include:

-   **Clear description** of the bug
-   **Steps to reproduce** the issue
-   **Expected behavior** vs actual behavior
-   **Screenshots** if applicable
-   **Environment details** (OS, Node version, Bun version)
-   **Console errors** if any
-   **Relevant logs** from the application

### Feature Requests

Use the feature request template and include:

-   **Problem statement** - what problem does this solve?
-   **Proposed solution** - your idea for implementing it
-   **Alternatives considered** - other approaches you thought about
-   **Additional context** - mockups, examples, references

### Questions and Discussions

For general questions, use [GitHub Discussions](https://github.com/your-org/firepit/discussions) instead of issues:

-   How to implement a feature
-   Best practices
-   Deployment questions
-   General help requests

## 🏗️ Project Architecture

### Tech Stack

-   **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS
-   **Backend**: Appwrite (BaaS), Node.js/Bun
-   **Database**: Appwrite Database (document-based)
-   **Auth**: Appwrite Auth (with session management)
-   **Storage**: Appwrite Storage (for avatars)
-   **Testing**: Vitest, React Testing Library
-   **Linting**: ESLint (flat config)
-   **Type Checking**: TypeScript 5.7+

### Key Modules

#### Appwrite Integration (`src/lib/appwrite-*.ts`)

-   `appwrite-core.ts` - Core client initialization and config
-   `appwrite-auth.ts` - Authentication functions
-   `appwrite-roles.ts` - Role-based access control
-   `appwrite-messages.ts` - Message CRUD operations
-   `appwrite-moderation.ts` - Moderation actions
-   `appwrite-audit.ts` - Audit trail logging

#### Component Architecture

-   **shadcn/ui components** (`src/components/ui/`) - Base UI primitives
-   **Feature components** (`src/components/`) - Business logic components
-   **App Router pages** (`src/app/`) - Routes and layouts

### State Management

-   **React Query** (`@tanstack/react-query`) - Server state and caching
-   **React Context** - Theme and user preferences
-   **URL state** - Navigation and filters

### Authentication Flow

1. User signs up/logs in via Appwrite Auth
2. Session created and stored in cookies
3. Role checked on each request (admin/moderator/user)
4. Protected routes redirect unauthenticated users

### Database Schema

See `scripts/setup-appwrite.ts` for complete schema definition:

-   `servers` - Chat servers
-   `channels` - Channels within servers
-   `messages` - Chat messages
-   `profiles` - User profiles
-   `conversations` - DM conversations
-   `direct_messages` - Direct messages
-   `statuses` - User status updates
-   `audit` - Moderation audit log

## 📚 Additional Resources

-   [Next.js Documentation](https://nextjs.org/docs)
-   [Appwrite Documentation](https://appwrite.io/docs)
-   [React Query Documentation](https://tanstack.com/query/latest)
-   [TailwindCSS Documentation](https://tailwindcss.com/docs)
-   [Vitest Documentation](https://vitest.dev/)

## ❓ Questions?

If you have questions about contributing:

1. Check the [README](./README.md) and [DEPLOYMENT.md](./DEPLOYMENT.md)
2. Search [existing issues](https://github.com/your-org/firepit/issues)
3. Ask in [GitHub Discussions](https://github.com/your-org/firepit/discussions)
4. Tag maintainers in issues/PRs for clarification

---

Thank you for contributing to Firepit! 🔥
