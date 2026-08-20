#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { parseMode, startServer } from './src/server.js';

export { AmexSpendingAnalyzer } from './src/analyzer.js';
export { VendorUnmasker } from './src/unmasker.js';
export { createAmexServer, startServer } from './src/server.js';
export type { AmexTransaction, ServerMode, SpendingAnalysis, VendorProfile } from './src/types.js';

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  startServer(parseMode('standard')).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
