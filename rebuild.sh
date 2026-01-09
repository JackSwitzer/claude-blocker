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

if [ "$SIGNED" = "signed" ]; then
  echo "(Using automatic signing)"
  xcodebuild -scheme "Claude Blocker Safari" -configuration Debug build \
    CODE_SIGN_STYLE=Automatic \
    2>&1 | grep -E "(BUILD|Error|Signing)" | tail -5
else
  echo "(Using ad-hoc signing - use './rebuild.sh signed' for persistent install)"
  xcodebuild -scheme "Claude Blocker Safari" -configuration Debug build \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    2>&1 | grep -E "(BUILD|Error)" | tail -3
fi

echo ""
echo "✓ Extension rebuilt successfully!"
echo ""

if [ "$SIGNED" = "signed" ]; then
  echo "Extension is properly signed. To install:"
  echo "1. Run from Xcode (Cmd+R) to install"
  echo "2. Enable in Safari → Settings → Extensions"
  echo "3. No need to re-enable 'Allow Unsigned Extensions'"
else
  echo "Next steps (unsigned build):"
  echo "1. Quit Safari completely"
  echo "2. Run: open '/Users/jackswitzer/Library/Developer/Xcode/DerivedData/Claude_Blocker_Safari-cpytjsgwftidbjabhxeprybryfcz/Build/Products/Debug/Claude Blocker Safari.app'"
  echo "3. Safari → Settings → Developer → Allow Unsigned Extensions"
  echo "4. Enable extension in Safari → Settings → Extensions"
fi
echo ""
echo "Blocker server: run 'herd' to auto-start"
