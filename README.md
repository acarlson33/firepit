# firepit

Converted from a monorepo (Turborepo) structure into a single root Next.js application.

## Features

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
