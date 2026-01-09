# Claude Blocker - Safari Conversion Guide

## ✅ Conversion Complete!

The Chrome extension has been successfully converted to a Safari Web Extension using Apple's `xcrun safari-web-extension-converter` tool.

---

## Project Structure

```
SafariBlocker/
├── packages/                          # Original source
│   ├── extension/                     # Chrome extension source
│   │   ├── dist/                      # Built extension (converted from)
│   │   └── src/                       # TypeScript source files
│   ├── server/                        # Node.js blocker server (unchanged)
│   └── shared/                        # Shared types (unchanged)
│
└── Claude Blocker Safari/             # Safari conversion output
    ├── Claude Blocker Safari.xcodeproj    # Xcode project
    ├── Claude Blocker Safari/             # macOS app container
    │   └── Resources/
    └── Claude Blocker Safari Extension/   # Safari extension
        ├── Info.plist
        └── SafariWebExtensionHandler.swift
```

---

## Next Steps

### 1. Open Xcode Project

```bash
open "Claude Blocker Safari/Claude Blocker Safari.xcodeproj"
```

### 2. Configure Signing

In Xcode:
1. Select the project in the navigator
2. Select "Claude Blocker Safari" target
3. Go to "Signing & Capabilities" tab
4. Choose your Team (requires Apple Developer account - $99/year for distribution)
5. Xcode will auto-generate a bundle identifier

For **local testing only**, you can use "Sign to Run Locally" (no paid account needed)

### 3. Build & Run

1. In Xcode: **Product** → **Run** (or Cmd+R)
2. This will:
   - Build the app
   - Launch the macOS app
   - The app will prompt you to enable the extension in Safari

### 4. Enable in Safari

1. Safari → **Preferences** → **Extensions**
2. Enable "Claude Blocker Safari Extension"
3. Grant permissions when prompted

### 5. Test the Extension

1. Make sure the blocker server is running (see Server Setup below)
2. Open a blocked site (configure blocklist in extension options)
3. Start Claude Code inference
4. The site should unblock

---

## Server Setup

The blocker server remains unchanged from the Chrome version.

### Install & Run Server

```bash
# Option 1: Install globally (recommended)
cd packages/server
bun install
bun link
bun link @claude-blocker/server

# Then run from anywhere:
claude-blocker

# Option 2: Run directly
cd packages/server
bun install
bun run src/index.ts
```

Server runs on `http://localhost:3001` by default.

### Claude Code Hooks

The server package includes hooks for Claude Code:
- `hooks/pre-tool-use.sh` - Notifies server when Claude starts inference
- `hooks/post-tool-use.sh` - Notifies server when Claude finishes

Install hooks:
```bash
# Copy to your Claude Code hooks directory
cp packages/server/hooks/* ~/.config/claude/hooks/
```

Or reference them in `~/.config/claude/settings.json`:
```json
{
  "hooks": [
    {
      "name": "claude-blocker-start",
      "command": "/path/to/SafariBlocker/packages/server/hooks/pre-tool-use.sh",
      "filter": {
        "event": "PreToolUse"
      }
    }
  ]
}
```

---

## Known Safari Differences

### ⚠️ Compatibility Warnings

The converter showed this warning:
```
Warning: The following keys in your manifest.json are not supported:
	open_in_tab
```

**Impact**: The options page may open in a popup instead of a full tab. This is cosmetic and doesn't affect functionality.

### API Differences (Auto-Handled by Safari)

Safari automatically translates:
- `chrome.storage` → `browser.storage`
- `chrome.tabs` → `browser.tabs`
- `chrome.runtime` → `browser.runtime`

The original JavaScript code using `chrome.*` APIs should work as-is in Safari.

### WebSocket Support

✅ **No changes needed** - Safari supports WebSockets for communication with the blocker server.

---

## Development Workflow

### Rebuilding After Changes

If you modify the extension source code:

```bash
# 1. Rebuild the Chrome extension
cd packages/extension
bun run build

# 2. Update Safari extension
# The easiest way is to copy updated files into the Xcode project:
# In Xcode: Right-click extension Resources → Add Files
# Or rebuild the entire Safari project:
cd ../..
rm -rf "Claude Blocker Safari"
xcrun safari-web-extension-converter packages/extension/dist --macos-only --app-name "Claude Blocker Safari"
```

### Live Development

For faster iteration:
1. Edit TypeScript files in `packages/extension/src/`
2. Run `bun run dev` (watches for changes)
3. Rebuild Safari extension as needed
4. In Safari: **Develop** → **Allow Unsigned Extensions** (for testing)
5. Reload extension: Safari → Preferences → Extensions → Reload

---

## Testing Checklist

- [ ] Build succeeds in Xcode
- [ ] Extension appears in Safari preferences
- [ ] Extension can be enabled
- [ ] Popup opens when clicking extension icon
- [ ] Options page opens and loads
- [ ] Server starts and accepts WebSocket connections
- [ ] Sites are blocked when Claude is idle
- [ ] Sites unblock when Claude runs inference
- [ ] Blocklist configuration persists
- [ ] Emergency bypass works (5-minute override)

---

## Distribution

### For Personal Use
- Build with "Sign to Run Locally"
- Share the built app from `~/Library/Developer/Xcode/DerivedData/`

### For Public Distribution
Requires:
1. Paid Apple Developer account ($99/year)
2. Code signing with Developer ID
3. App notarization (security scan by Apple)
4. Distribution outside Mac App Store: DMG/ZIP with installer
5. Or submit to Mac App Store (requires review)

---

## Troubleshooting

### Extension Won't Enable
- Check System Preferences → Privacy & Security
- Verify app is signed (even locally)
- Try: `spctl --assess --verbose "Claude Blocker Safari.app"`

### WebSocket Connection Fails
- Ensure blocker server is running (`lsof -i :3001`)
- Check Safari console (Develop → Show Web Inspector)
- Verify manifest.json has `host_permissions: ["<all_urls>"]`

### Chrome APIs Not Working
- Safari should auto-translate `chrome.*` to `browser.*`
- If issues persist, manually update to `browser.*` in source code
- Check Safari console for specific errors

### Build Errors in Xcode
- Clean build folder: **Product** → **Clean Build Folder**
- Check Swift version compatibility
- Verify code signing settings

---

## Architecture

```
┌─────────────────┐         WebSocket         ┌──────────────────┐
│ Claude Code     │ ─────────────────────────→ │ Blocker Server   │
│ (Terminal)      │   Hooks notify inference   │ (localhost:3001) │
└─────────────────┘                            └──────────────────┘
                                                        │
                                                        │ Broadcasts
                                                        │ state changes
                                                        ↓
                                               ┌──────────────────┐
                                               │ Safari Extension │
                                               │ (Content Script) │
                                               └──────────────────┘
                                                        │
                                                        │ Injects
                                                        │ block UI
                                                        ↓
                                               ┌──────────────────┐
                                               │ Blocked Websites │
                                               └──────────────────┘
```

**Flow:**
1. Claude Code hook fires when inference starts/stops
2. Hook notifies blocker server (HTTP POST to localhost:3001)
3. Server broadcasts state change via WebSocket
4. Safari extension receives state update
5. Content script shows/hides block overlay

---

## Additional Resources

- [Safari Web Extensions Documentation](https://developer.apple.com/documentation/safariservices/safari_web_extensions)
- [Converting Chrome Extensions to Safari](https://developer.apple.com/documentation/safariservices/safari_web_extensions/converting_a_web_extension_for_safari)
- [Original claude-blocker README](https://github.com/T3-Content/claude-blocker)

---

## Notes

- This is a **local conversion** - changes won't affect the upstream claude-blocker repo
- To contribute Safari support back, fork the original repo and add Safari build instructions
- Consider creating a separate Safari branch to track Safari-specific changes

---

**Ready to build!** Open the Xcode project and hit Run (Cmd+R).

```bash
open "Claude Blocker Safari/Claude Blocker Safari.xcodeproj"
```
