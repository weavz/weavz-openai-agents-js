import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEMO_RECORD, FIXTURE_TOKEN, startFixture } from './fixture.js';
import { runFixtureSmoke, validateLiveConnection } from '../src/index.js';

const containsRecord = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return serialized.includes(DEMO_RECORD.title) && serialized.includes(DEMO_RECORD.recordId);
};

test('OpenAI Agents MCP server lists and calls Tool Mode directly without a model', async () => {
  const fixture = await startFixture('tools');
  try {
    const result = await runFixtureSmoke(fixture.url, FIXTURE_TOKEN, 'tools');
    assert.ok(result.names.includes('demo__lookup_record'));
    assert.ok(containsRecord(result.result));
    assert.ok(fixture.methods.includes('tools/list') && fixture.methods.includes('tools/call'));
  } finally { await fixture.close(); }
});

test('OpenAI Agents MCP server lists and calls Code Mode directly without a model', async () => {
  const fixture = await startFixture('code');
  try {
    const result = await runFixtureSmoke(fixture.url, FIXTURE_TOKEN, 'code');
    assert.ok(result.names.includes('weavz_search'));
    assert.ok(containsRecord(result.result));
    assert.equal(result.calls.length, 3);
    assert.ok(result.calls.every(call => JSON.stringify(call).includes('Fixture record')));
    assert.ok(fixture.authenticatedMethods.length >= 4);
    assert.ok(fixture.methods.filter(method => method === 'tools/call').length >= 3);
  } finally { await fixture.close(); }
});

test('fixture rejects an invalid bearer token before processing MCP requests', async () => {
  const fixture = await startFixture('tools');
  try {
    const response = await fetch(fixture.url, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(fixture.methods, []);
  } finally { await fixture.close(); }
});

test('live connection validation rejects unsafe or incompatible bearer setup', () => {
  assert.throws(() => validateLiveConnection('http://remote.example/mcp', 'mcp_example-token'), /HTTPS/);
  assert.throws(() => validateLiveConnection('https://remote.example/mcp', 'wvz_example-rest-key'), /MCP access token/);
  assert.throws(() => validateLiveConnection('https://platform.weavz.io/mcp/weavz', 'mcp_example-token'), /uses OAuth/);
  for (const url of ['https://user:secret@tenant.example/mcp', 'https://tenant.example/mcp?token=secret', 'https://tenant.example/mcp#secret']) {
    assert.throws(() => validateLiveConnection(url, 'mcp_example-token'), /without embedded/);
  }
  assert.throws(() => validateLiveConnection('https://selfhosted.example/mcp/weavz', 'mcp_example-token'), /uses OAuth/);
  assert.throws(() => validateLiveConnection('https://tenant.example/mcp', 'mcp_bad token'), /without whitespace/);
  assert.doesNotThrow(() => validateLiveConnection('https://tenant.example/mcp', 'mcp_example-token'));
});
