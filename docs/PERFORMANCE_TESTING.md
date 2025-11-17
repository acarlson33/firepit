# Performance Testing Guide

This guide helps you verify that the performance optimizations are working correctly.

## Pre-Testing Checklist

Before testing, ensure:
- [ ] All dependencies are installed: `bun install`
- [ ] Environment variables are configured (optional for testing)
- [ ] You have Chrome DevTools or similar browser tools available
- [ ] You're testing on a realistic network (throttle to 4G or 3G)

## Testing Scenarios

### 1. Development Server Performance

Test that Turbopack provides fast development experience:

```bash
# Start development server
bun dev

# Expected:
# - Server starts in < 2 seconds
# - Hot reload in < 500ms
# - No console errors about deprecated config
```

**What to verify:**
- ✅ No warning about `experimental.turbo` being deprecated
- ✅ Fast startup time
- ✅ Changes reflect quickly with hot reload

### 2. Bundle Size Analysis

Test that bundle size is optimized:

```bash
# Analyze production bundle
bun run build:analyze

# This will:
# 1. Build the production app
# 2. Open interactive treemap in browser
# 3. Show size of each dependency
```

**What to verify:**
- ✅ lucide-react is tree-shaken (only used icons included)
- ✅ emoji-picker-react is code-split (not in main bundle)
- ✅ Total JavaScript < 1.2MB
- ✅ Main bundle < 300KB

### 3. First Load Performance

Test the actual first load time:

#### Method 1: Chrome DevTools
1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Check "Disable cache"
4. Throttle to "Fast 3G"
5. Hard refresh (Ctrl+Shift+R)
6. Observe load times

**Expected Results:**
- First Contentful Paint (FCP): < 1.2 seconds
- Largest Contentful Paint (LCP): < 2.5 seconds
- Time to Interactive (TTI): < 4 seconds
- Total Load Time: < 5 seconds

#### Method 2: Lighthouse
1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Select "Performance" only
4. Choose "Mobile" and "Simulated throttling"
5. Click "Analyze page load"

**Expected Lighthouse Scores:**
- Performance: > 90/100
- First Contentful Paint: < 1.2s
- Largest Contentful Paint: < 2.5s
- Time to Interactive: < 3.8s
- Speed Index: < 3.4s
- Total Blocking Time: < 200ms
- Cumulative Layout Shift: < 0.1

### 4. Font Loading Test

Verify fonts don't block rendering:

1. Open DevTools Network tab
2. Filter by "Font"
3. Reload page
4. Observe that:
   - ✅ Page renders before fonts load (system fonts appear first)
   - ✅ Minimal layout shift when fonts swap
   - ✅ Geist Sans loads first (preloaded)
   - ✅ Geist Mono loads later (optional)

### 5. Code Splitting Test

Verify GlobalSearch is lazy loaded:

1. Open DevTools Network tab
2. Hard refresh page
3. Observe that:
   - ✅ GlobalSearch JavaScript NOT loaded initially
4. Click search button (Ctrl+K or search icon)
5. Observe that:
   - ✅ GlobalSearch JavaScript loads now
   - ✅ Loads in < 500ms
   - ✅ Opens smoothly

### 6. Caching Test

Verify aggressive caching works:

1. First visit:
   ```bash
   # Clear all browser data first
   # Visit the site
   # Note load time
   ```

2. Second visit (same session):
   ```bash
   # Reload page (don't hard refresh)
   # Expected: < 500ms load time
   ```

3. Check cache headers:
   - Open DevTools Network tab
   - Look at static assets (.js, .css, .woff2)
   - Verify headers show:
     - `Cache-Control: public, max-age=31536000, immutable`

### 7. Real-time Connection Deferral

Verify WebSocket connections don't block initial load:

1. Open DevTools Console
2. Hard refresh page
3. Observe timing:
   - ✅ Page becomes interactive immediately
   - ✅ Appwrite client import happens after 5 seconds
   - ✅ No WebSocket connections until after 5 seconds

### 8. Mobile Performance

Test on mobile device or emulation:

1. Open DevTools
2. Toggle device toolbar (Ctrl+Shift+M)
3. Select "Moto G4" or similar
4. Throttle to "Slow 3G"
5. Test the site

**Expected Results:**
- Page loads in < 8 seconds on Slow 3G
- No horizontal scrolling
- Touch interactions work smoothly
- Viewport properly configured

### 9. Loading State Test

Verify loading states provide good UX:

1. Throttle network to "Slow 3G"
2. Navigate to a new page
3. Observe:
   - ✅ Loading spinner appears immediately
   - ✅ No blank white screen
   - ✅ Loading message is clear

### 10. Production Build Test

Verify production optimizations:

```bash
# Build for production
bun run build

# Expected output:
# - No warnings about deprecated config
# - Build completes successfully
# - Shows route sizes
# - All routes are server-rendered (no static HTML)

# Start production server
bun start

# Test in browser
# Expected: Even faster than dev mode
```

## Performance Metrics to Track

### Core Web Vitals
Monitor these in production with New Relic or Google Analytics:

- **Largest Contentful Paint (LCP)**: < 2.5s (Good)
- **First Input Delay (FID)**: < 100ms (Good)
- **Cumulative Layout Shift (CLS)**: < 0.1 (Good)

### Additional Metrics
- **First Contentful Paint (FCP)**: < 1.8s
- **Time to Interactive (TTI)**: < 3.8s
- **Speed Index**: < 3.4s
- **Total Blocking Time (TBT)**: < 300ms

## Common Issues & Solutions

### Issue: Bundle still too large
**Solution:**
1. Run `bun run build:analyze`
2. Identify largest dependencies
3. Consider lazy loading or replacing with lighter alternatives

### Issue: Fonts still blocking render
**Solution:**
1. Verify `font-display: swap` is set
2. Check fallback fonts are working
3. Ensure only critical fonts are preloaded

### Issue: Slow on first load but fast on repeat
**Solution:**
This is expected! The optimizations focus on:
- First load: 2-3 seconds (good)
- Repeat visits: ~100ms (excellent due to caching)

### Issue: Real-time features slow to connect
**Solution:**
This is intentional - they're deferred 5 seconds to prioritize page load.
Users can interact with the page before real-time connects.

## Automated Testing

### Setup Performance Tests
Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Lighthouse CI
  run: |
    npm install -g @lhci/cli
    lhci autorun --config=lighthouserc.json
```

### Performance Budgets
Set budgets in `next.config.ts`:

```javascript
experimental: {
  webVitalsAttribution: ['CLS', 'LCP', 'FID'],
}
```

## Monitoring in Production

### New Relic Dashboard
1. Log into New Relic
2. Navigate to Browser → Page views
3. Check Core Web Vitals tab
4. Set up alerts for:
   - LCP > 2.5s
   - FID > 100ms
   - CLS > 0.1

### Real User Monitoring (RUM)
Track actual user experience:
- Average load time by geography
- Performance by device type
- Slowest pages/routes
- Bundle size impact

## Success Criteria

The optimizations are working if:
- ✅ First load < 3 seconds on Fast 3G
- ✅ Lighthouse Performance score > 90
- ✅ All Core Web Vitals in "Good" range
- ✅ Bundle size < 1.2MB
- ✅ Repeat visits < 500ms
- ✅ No console errors
- ✅ Smooth interactions

## Reporting Issues

If performance doesn't meet targets:

1. **Capture evidence:**
   - Lighthouse report
   - Network waterfall screenshot
   - Bundle analyzer screenshot
   - DevTools Performance profile

2. **Provide details:**
   - Browser and version
   - Network conditions
   - Device/platform
   - Specific route/page

3. **Open issue with:**
   - Link to evidence
   - Steps to reproduce
   - Expected vs actual metrics

---

**Next Steps:**
1. Run through all testing scenarios
2. Document any issues found
3. Monitor production metrics
4. Iterate on optimizations as needed
