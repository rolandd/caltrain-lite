// SPDX-License-Identifier: MIT
// Copyright 2026 Roland Dreier <roland@rolandd.dev>

import assert from 'node:assert/strict';
import worker from '../src/index.ts';

async function testFetchHeaders() {
  const env = {
    TRANSIT_511_API_KEY: 'test-key',
    TRANSIT_DATA: {
      get: async () => null,
      getWithMetadata: async () => ({ value: null, metadata: null }),
      put: async () => {},
    },
  } as any;

  const request = new Request('https://example.com/api/realtime');
  const response = await worker.fetch(request, env, {} as any);

  assert.strictEqual(response.headers.get('Access-Control-Allow-Origin'), null, 'CORS header should be absent');
  assert.strictEqual(response.headers.get('Content-Security-Policy'), "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'", 'Security header should be present');

  console.log('Fetch header test passed!');
}

testFetchHeaders().catch(err => {
  console.error('Fetch header test failed:', err);
  process.exit(1);
});
