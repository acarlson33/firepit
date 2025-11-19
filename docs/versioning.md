# Dynamic Versioning

This project uses a dynamic versioning system that automatically determines the version based on the git state at build time.

## How It Works

### Build-Time Version Generation

During the build process, the `scripts/generate-version.ts` script runs and:

1. **Checks the current git commit**: Gets the full SHA and short SHA (first 7 characters)
2. **Looks for git tags**: Checks if the current commit is tagged or if there's a latest tag
3. **Determines the version**:
   - **If the current commit has a tag**: Uses that tag as the version (e.g., `v1.0.2`) with `isCanary: false`
   - **If the current commit is NOT tagged but there's a latest tag**: Creates a canary version using the latest tag as the base (e.g., `v1.0.2-canary.43ac7bd`) with `isCanary: true`
   - **If no tags exist at all**: Uses `0.0.0-canary.43ac7bd` as the version with `isCanary: true`
4. **Generates metadata**: Creates `src/generated/version-metadata.json` with:
   - `version`: The determined version string
   - `commitSha`: Full git commit SHA
   - `commitShort`: Short git commit SHA (7 chars)
   - `buildTime`: ISO timestamp of when the build was created
   - `isCanary`: Boolean indicating if this is a canary/pre-release version
   - `latestTag`: The most recent git tag (or null if none exist)
   - `branch`: The git branch name

### Version API Endpoint

The `/api/version` endpoint serves version information that includes:

- Current deployed version
- Latest GitHub release version
- Whether an update is available
- Build metadata (commit SHA, build time, branch)
- Canary status

### UI Display

The admin version check component (`src/app/admin/version-check.tsx`) displays:

- Current version with a "Canary" badge if applicable
- Commit SHA and branch information
- Build timestamp
- Update notifications when a new release is available

## Usage

### Building

The version generation is automatically triggered during the build:

```bash
bun run build
```

This runs:
1. `bun run generate-version` - Generates version metadata
2. `bun run build:sw` - Builds the service worker
3. `next build` - Builds the Next.js application

### Development

In development mode, the version API falls back to a default development version (`1.0.0-dev`) if the metadata file doesn't exist.

### Creating Releases

To create a stable release:

1. Tag the commit with a version number:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. Build and deploy:
   ```bash
   bun run build
   # Deploy to your hosting platform
   ```

The version will automatically be set to `v1.0.0` (not canary).

### Canary Builds

Any build from a commit that isn't tagged will be marked as a canary build:

- The version will be based on the latest tag (e.g., `v1.0.2-canary.43ac7bd`)
- If no tags exist, it will use `0.0.0-canary.43ac7bd`
- The version always includes the short commit SHA (7 characters)
- The `isCanary` flag will be `true`
- The UI will display a "Canary" badge

This approach ensures that canary builds are clearly identifiable while maintaining a logical progression from the latest stable release.

## Examples

### Tagged Release
```json
{
  "version": "v1.0.0",
  "commitSha": "abc123...",
  "commitShort": "abc123d",
  "buildTime": "2024-01-01T00:00:00Z",
  "isCanary": false,
  "latestTag": "v1.0.0",
  "branch": "main"
}
```

### Canary Build (ahead of v1.0.0)
```json
{
  "version": "v1.0.0-canary.def456e",
  "commitSha": "def456...",
  "commitShort": "def456e",
  "buildTime": "2024-01-02T00:00:00Z",
  "isCanary": true,
  "latestTag": "v1.0.0",
  "branch": "main"
}
```

### Initial Build (no tags)
```json
{
  "version": "0.0.0-canary.abc123d",
  "commitSha": "abc123...",
  "commitShort": "abc123d",
  "buildTime": "2024-01-01T00:00:00Z",
  "isCanary": true,
  "latestTag": null,
  "branch": "main"
}
```

## Testing

The version API includes comprehensive tests in `src/__tests__/version-api.test.ts` that verify:

- Version comparison logic
- GitHub API integration
- Error handling
- Caching behavior
- Build metadata integration

Run tests with:
```bash
bun run test src/__tests__/version-api.test.ts
```
