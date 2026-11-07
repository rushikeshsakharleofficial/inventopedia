import { readFileSync, writeFileSync } from 'node:fs';
import { createOpenApiDocument } from '../src/contracts.js';

const file = new URL('../../../docs/openapi.json', import.meta.url);
const content = JSON.stringify(createOpenApiDocument(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content) {
    throw new Error('docs/openapi.json is stale; run npm run openapi --workspace packages/api');
  }
} else writeFileSync(file, content);
