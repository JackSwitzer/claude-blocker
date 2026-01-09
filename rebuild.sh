#!/bin/bash
# Rebuild Safari Blocker extension

set -e

SIGNED=${1:-""}  # Pass "signed" as argument for proper signing

echo "Building extension..."
cd packages/extension
bun run build

echo "Copying to Xcode Resources..."
cp -r dist/* "../../Claude Blocker Safari/Claude Blocker Safari/Resources/"

echo "Building Xcode project..."
cd "../../Claude Blocker Safari"

# Always use proper signing with Apple Development certificate
echo "(Building with Apple Development signing)"
xcodebuild -scheme "Claude Blocker Safari" -configuration Debug build \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=43NND4GJ23 \
  CODE_SIGN_IDENTITY="Apple Development" \
  2>&1 | grep -E "(BUILD|Error|Signing)" | tail -5

echo ""
echo "✓ Extension rebuilt with Apple Development signing!"
echo ""
echo "To install:"
echo "1. Quit Safari completely"
echo "2. Run: open '/Users/jackswitzer/Library/Developer/Xcode/DerivedData/Claude_Blocker_Safari-cpytjsgwftidbjabhxeprybryfcz/Build/Products/Debug/Claude Blocker Safari.app'"
echo "3. Enable in Safari → Settings → Extensions"
echo ""
echo "Blocker server runs via LaunchAgent (auto-starts on login)"
