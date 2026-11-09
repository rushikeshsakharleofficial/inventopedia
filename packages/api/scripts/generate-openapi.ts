import { readFileSync, writeFileSync } from 'node:fs';
import { createOpenApiDocument } from '../src/contracts.js';

const file = new URL('../../../docs/openapi.json', import.meta.url);
const content = JSON.stringify(createOpenApiDocument(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (actual !== content) {
    let offset = 0;
    while (offset < Math.min(actual.length, content.length) && actual[offset] === content[offset]) offset++;
    console.error('First OpenAPI mismatch at character', offset);
    console.error('Checked in:', JSON.stringify(actual.slice(offset - 80, offset + 320)));
    console.error('Generated:', JSON.stringify(content.slice(offset - 80, offset + 320)));
    throw new Error('docs/openapi.json is stale; run npm run openapi --workspace packages/api');
  }
} else writeFileSync(file, content);
