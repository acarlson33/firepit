# firepit

> warning: missing important features. This is currently in early alpha testing, expect bugs and issues to arise. Not recommended for production or enterprise use.

The original idea was for an open source "extension" of sorts to discord, since then it has been scrapped and then re-made to be it's own project. Functions like a discord clone with some added features.

## Features
- **Server support** - support for servers like on discord
- **Channel support** - support for channels like on discord
- **User profiles and status support** - missing external integration, but support for in app statuses and profiles
- **Moderation** - Instance wide moderation and administration 
- **Individual server moderation** - not currently supported, but will come in a later update with roles

## Codebase Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Turborepo** - Optimized monorepo build system
- **PWA** - Progressive Web App support
- **Husky** - Git hooks for code quality

## Getting Started

First, install the dependencies:

```bash
bun install
```

Then, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the web application.

## Project Structure

```
firepit/
├── src/            # Application source (Next.js app router)
├── public/         # Static assets
├── index.css       # Tailwind / global styles
├── next.config.ts  # Next.js configuration
└── eslint.config.js
```

## Available Scripts

- `bun dev`: Start the dev server
- `bun build`: Build the Next.js app
- `bun start`: Start the production build
- `bun test`: Run tests via Vitest
- `bun lint`: Run ESLint (flat config)
- `bun setup`: Run setup script to prepare appwrite
