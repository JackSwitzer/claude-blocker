# Claude Blocker - Safari + Herd Integration

## Overview
Safari extension that blocks distracting sites (YouTube, X) when no Claude sessions are actively working. Integrates with Herd to track all Claude Code sessions via Convex.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  Herd (TUI)     │────────▶│  Convex Cloud   │◀────────│ Blocker Server  │
│  Session Mgmt   │         │  (Session DB)   │         │  (localhost:8765)│
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                                                  │
                                                                  │ WebSocket
                                                                  ▼
                                                         ┌─────────────────┐
                                                         │ Safari Extension│
                                                         │ (Content Script)│
                                                         └─────────────────┘
```

## How It Works

1. **Herd tracks sessions**: When you spawn a Claude from Herd, it creates a session in Convex
2. **Blocker polls Convex**: Every 2 seconds, checks for active sessions
3. **Extension blocks/unblocks**:
   - Any active session → sites unblocked
   - All sessions idle → sites blocked + videos paused

## Setup

### 1. Start Blocker Server
```bash
~/.claude/scripts/start-blocker.sh
```

### 2. Launch Safari Extension
```bash
open '/Users/jackswitzer/Library/Developer/Xcode/DerivedData/Claude_Blocker_Safari-cpytjsgwftidbjabhxeprybryfcz/Build/Products/Debug/Claude Blocker Safari.app'
```

### 3. Enable Extension
Safari → Settings → Extensions → Enable "Claude Blocker Safari Extension"

## Usage

1. **Launch Herd**: Run `herd` in terminal
2. **Spawn Claude**: Press `a` (active projects) or `d` (desktop), select project
3. **Work**: Browse normally - sites unblocked while Claude is active
4. **Idle**: When all Claude sessions stop, blocker kicks in and pauses media

## Features

- ✅ Blocks x.com, youtube.com (configurable in extension settings)
- ✅ Auto-pauses videos when blocked
- ✅ Multi-session support (any active = unblocked)
- ✅ No fullscreen takeover when spawning from Herd
- ✅ Aggressive pause on page load (videos can't start)

## Development

### Rebuild Extension
```bash
cd ~/Desktop/ClaudePlugins/SafariBlocker
./rebuild.sh
```

### Check Server Status
```bash
curl http://localhost:8765/status
```

### Blocked Domains
Configure in extension: Safari → Settings → Extensions → Claude Blocker → Configure

## Known Issues

- **Safari service worker error**: Extension shows "Cannot connect to extension" but still works (pauses videos based on connection failures = safe default)
- **Herd doesn't track yet**: Sessions created via direct `claude` command (not from Herd) won't be tracked
- **5-minute bypass button**: Not implemented yet

## Files

- **Server**: `~/Desktop/ClaudePlugins/SafariBlocker/packages/server/`
- **Extension**: `~/Desktop/ClaudePlugins/SafariBlocker/packages/extension/`
- **Herd**: `~/.claude/command-center/`
- **Scripts**: `~/.claude/scripts/start-blocker.sh`
