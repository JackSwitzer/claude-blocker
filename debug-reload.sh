#!/bin/bash
# Debug script: Rebuild extension, reload Safari, open x.com with console logging

set -e

echo "=== Safari Blocker Debug Reload ==="
echo ""

# 1. Kill Safari
echo "1. Quitting Safari..."
osascript -e 'tell application "Safari" to quit' 2>/dev/null || true
sleep 2

# 2. Build extension
echo "2. Building extension..."
cd /Users/jackswitzer/Desktop/ClaudePlugins/SafariBlocker
./rebuild.sh 2>&1 | tail -5

# 3. Check server status
echo ""
echo "3. Server status:"
curl -s http://localhost:8765/status | python3 -m json.tool

# 4. Open the app to register extension
echo ""
echo "4. Opening Claude Blocker Safari app..."
open '/Users/jackswitzer/Library/Developer/Xcode/DerivedData/Claude_Blocker_Safari-cpytjsgwftidbjabhxeprybryfcz/Build/Products/Debug/Claude Blocker Safari.app'
sleep 2

# 5. Open Safari with debug console
echo ""
echo "5. Opening Safari with x.com..."
open -a Safari "https://x.com"

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "1. Safari → Settings → Extensions → Enable Claude Blocker"
echo "2. Safari → Develop → Web Extension Background Content → Claude Blocker Safari Extension"
echo "   (This opens the service-worker console for debugging)"
echo "3. Click the extension icon to open popup"
echo ""
