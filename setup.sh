#!/bin/bash
set -euo pipefail

echo "Amex Analysis MCP setup"
echo "======================="

if ! command -v node >/dev/null; then
  echo "Node.js 18.18+ is required. Install from https://nodejs.org/"
  exit 1
fi

echo "Node $(node -v)"

if [ ! -f "amex-mcp-server.ts" ] || [ ! -f "src/unmasker.ts" ]; then
  echo "Run this from the repository root."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

mkdir -p data output

echo "Building..."
npm run build

echo "Testing..."
npm test

echo
echo "Done. Next:"
echo "  npx tsx src/cli.ts analyze data/your-amex.csv"
echo "  npm run dev"
echo
echo "Claude Desktop config:"
echo "  command: node"
echo "  args: [\"$(pwd)/dist/amex-mcp-server.js\"]"
