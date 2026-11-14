import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { z } from 'zod';

export const FIXTURE_TOKEN = 'fixture-only-token';
export const DEMO_RECORD = {
  recordId: 'record-1',
  title: 'Fixture record',
  status: 'ready',
} as const;

export const KNOWN_CODE =
  'return await weavz.demo.lookup_record({recordId: "record-1"});';

export type FixtureMode = 'tools' | 'code';
export type FixtureState = {
  url: string;
  methods: string[];
  authenticatedMethods: string[];
  close(): Promise<void>;
};

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

function buildServer(mode: FixtureMode): McpServer {
  const server = new McpServer({ name: 'weavz-example-fixture', version: '1.0.0' });
  if (mode === 'tools') {
    server.registerTool(
      'demo__lookup_record',
      {
        description: 'Read the fixed synthetic record record-1.',
        inputSchema: z.object({ recordId: z.string() }),
      },
      async ({ recordId }) => ({
        content: [{ type: 'text', text: JSON.stringify(DEMO_RECORD) }],
      }),
    );
    return server;
  }

  server.registerTool(
    'weavz_search',
    {
      description: 'Search the fixture catalog. This fixture contains one synthetic record.',
      inputSchema: z.object({ query: z.string() }),
    },
    async () => ({
      content: [{ type: 'text', text: JSON.stringify(DEMO_RECORD) }],
    }),
  );
  server.registerTool(
    'weavz_read_api',
    {
      description: 'Inspect the fixture lookup API using alias demo or aliases [demo].',
      inputSchema: z.object({
        alias: z.string().optional(),
        aliases: z.array(z.string()).optional(),
        action: z.string().optional(),
      }),
    },
    async ({ alias, aliases }) => {
      if (alias !== 'demo' && !aliases?.includes('demo')) return { isError: true, content: [{ type: 'text', text: 'Use the fixture alias demo.' }] };
      return { content: [{ type: 'text', text: JSON.stringify(DEMO_RECORD) }] };
    },
  );
  server.registerTool(
    'weavz_execute',
    {
      description: `Run the fixture's one approved lookup snippet only: ${KNOWN_CODE}`,
      inputSchema: z.object({ code: z.string() }),
    },
    async ({ code }) => {
      if (code.trim().replace(/\s+/g, ' ') !== KNOWN_CODE) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Fixture only accepts the documented lookup snippet.' }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(DEMO_RECORD) }],
        };
    },
  );
  return server;
}

export async function startFixture(
  mode: FixtureMode,
  token = FIXTURE_TOKEN,
): Promise<FixtureState> {
  const methods: string[] = [];
  const authenticatedMethods: string[] = [];
  const httpServer = createServer(async (req, res) => {
    if (req.url !== '/mcp') {
      sendError(res, 404, 'Not found');
      return;
    }
    if (req.headers.authorization !== `Bearer ${token}`) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    let body: unknown;
    if (req.method === 'POST') {
      try {
        body = await readJson(req);
      } catch {
        sendError(res, 400, 'Expected a JSON-RPC request');
        return;
      }
    }
    const method = (body as { method?: unknown } | null)?.method;
    if (typeof method === 'string') { methods.push(method); authenticatedMethods.push(method); }

    const server = buildServer(mode);
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      if (!res.headersSent) sendError(res, 500, String(error));
    } finally {
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Fixture did not bind a TCP port');
    return {
      url: `http://127.0.0.1:${address.port}/mcp`,
      methods,
      authenticatedMethods,
      close: () => new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve())),
    };
  } catch (error) {
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
    throw error;
  }
}
