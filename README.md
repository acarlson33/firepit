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

- **Real-time Chat** - WebSocket-based messaging with typing indicators
- **Server & Channels** - Discord-like server organization with multiple channels
- **Direct Messages** - Private conversations between users
- **User Status** - Online/offline presence with custom status messages
- **Moderation Tools** - Soft delete, restore, and hard delete messages with full audit trails
- **Role-Based Access** - Admin, moderator, and user roles with granular permissions
- **User Profiles** - Customizable profiles with avatar support
- **TypeScript** - Full type safety across the entire codebase
- **Next.js 15** - App Router with React Server Components
- **TailwindCSS** - Modern, responsive UI design
- **shadcn/ui** - High-quality, accessible UI components
- **PWA Ready** - Progressive Web App support for mobile installation
- **Comprehensive Tests** - 221+ tests with 100% pass rate and growing coverage

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** or **Bun 1.0+** installed
- An **Appwrite instance** (cloud or self-hosted):
  - Cloud: [appwrite.io](https://appwrite.io) (free tier available)
  - Self-hosted: [Installation Guide](https://appwrite.io/docs/installation)
- **Git** for cloning the repository

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/firepit.git
cd firepit

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.local.example .env.local
nano .env.local  # Edit with your Appwrite credentials

# 4. Validate your configuration
bun run validate-env

# 5. Initialize the database
bun run setup

# 6. Start the development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the web application.
Open [http://localhost:3000](http://localhost:3000) to see your application.

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide with step-by-step instructions
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development workflow and contribution guidelines

## 🗂️ Project Structure

```
firepit/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/              # Utility functions and Appwrite integration
│   └── __tests__/        # Vitest test suites
├── scripts/
│   ├── setup-appwrite.ts    # Database initialization script
│   └── validate-env.ts      # Environment validation script
├── public/               # Static assets
├── DEPLOYMENT.md         # Deployment documentation
└── .env.local.example    # Environment variable template
```

## 🛠️ Available Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `bun dev`           | Start development server (with Turbopack)    |
| `bun build`         | Build for production                         |
| `bun start`         | Start production server                      |
| `bun test`          | Run all tests with Vitest                    |
| `bun test:coverage` | Run tests with coverage report               |
| `bun lint`          | Check code with ESLint                       |
| `bun lint:fix`      | Fix auto-fixable linting issues              |
| `bun validate-env`  | Validate environment configuration           |
| `bun setup`         | Initialize Appwrite database and collections |

## 🔧 Configuration

### Environment Variables

The application requires several environment variables. Copy `.env.local.example` to `.env.local` and configure:

- `NEXT_PUBLIC_APPWRITE_ENDPOINT` - Your Appwrite API endpoint
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID` - Your Appwrite project ID
- `APPWRITE_API_KEY` - Server-side API key with full permissions

For a complete list and detailed explanations, see [DEPLOYMENT.md](./DEPLOYMENT.md#2-environment-configuration).

### First-Time Setup

1. **Create an Appwrite account and project** at [appwrite.io](https://appwrite.io)
2. **Generate an API key** with required scopes (see DEPLOYMENT.md)
3. **Configure environment variables** in `.env.local`
4. **Run validation**: `bun run validate-env`
5. **Initialize database**: `bun run setup`
6. **Start the app**: `bun dev`
7. **Create your account** in the UI
8. **Make yourself admin** by setting `APPWRITE_ADMIN_USER_IDS` in `.env.local`

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## 🐛 Troubleshooting

### Common Issues

- **"Appwrite endpoint not configured"** - Check your `.env.local` file exists and has the correct values
- **"Project not found"** - Verify your `NEXT_PUBLIC_APPWRITE_PROJECT_ID` matches your Appwrite Console
- **"Missing scope" errors** - Regenerate your API key with all required permissions
- **Setup script fails** - Ensure your API key has databases, collections, attributes, and indexes permissions

For more solutions, see [DEPLOYMENT.md - Troubleshooting](./DEPLOYMENT.md#troubleshooting).

## 🧪 Testing

This project maintains a comprehensive test suite with 100% pass rate:

```bash
# Run all tests
bun test

# Run tests with coverage report
bun test:coverage

# Run tests in watch mode (during development)
bun test --watch
```

Current test coverage: **22.36%** statements (growing)

- 221+ tests passing
- Focus on security-critical modules (auth, roles, moderation)

## 📦 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables from `.env.local`
4. Deploy!

### Self-Hosted

```bash
# Build the application
bun build

# Start production server
bun start
```

For production deployment with Nginx, Docker, or other platforms, see [DEPLOYMENT.md - Production Deployment](./DEPLOYMENT.md#production-deployment).

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Development workflow
- Code style guidelines
- Testing requirements
- Pull request process
- Issue reporting templates

## 📄 License
Licensed under the GNU General Public License v2 [License](./LICENSE)

## 🙏 Acknowledgments

Built with:

- [Next.js](https://nextjs.org/)
- [Appwrite](https://appwrite.io/)
- [TailwindCSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Vitest](https://vitest.dev/)

## 📧 Support

- **Documentation**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/firepit/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/firepit/discussions)
