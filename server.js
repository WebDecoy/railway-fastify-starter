import Fastify from 'fastify';
import webdecoyPlugin from '@webdecoy/fastify';
import { readFile } from 'node:fs/promises';

const app = Fastify({ logger: true });
const onRender = Boolean(process.env.RENDER);
const port = Number(process.env.PORT) || 3000;

const apiKey = process.env.WEBDECOY_API_KEY;
if (!apiKey) {
  app.log.warn('WEBDECOY_API_KEY is not set: running local rules only, nothing reports to WebDecoy.');
}

// The platform healthcheck, never analyzed.
app.get('/health', async () => ({ status: 'ok' }));

// Monitor mode (the default) records detections and still serves every request.
// Switch to mode: 'enforce' once you have seen what it would block.
await app.register(webdecoyPlugin, {
  apiKey,
  // Railway rewrites X-Forwarded-For to exactly "<client>, <edge>" (anything
  // the client sent is dropped). Render appends to whatever the client sent
  // and sits behind Cloudflare, which sets CF-Connecting-IP and refuses a
  // request that tries to supply its own.
  trustProxy: onRender ? 'cloudflare' : 'railway',
  skipPaths: ['/health'],
});

// Sent as a string rather than streamed from disk: the honeytoken link can
// only be injected into an HTML response the plugin can see whole.
const indexHtml = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
app.get('/', async (request, reply) => reply.type('text/html').send(indexHtml));

app.get('/api/hello', async (request) => ({
  message: `Hello from ${onRender ? 'Render' : 'Railway'}`,
  webdecoy: request.webdecoy
    ? {
        decision: request.webdecoy.decision,
        threat_level: request.webdecoy.threat_level,
        detection_id: request.webdecoy.detection_id,
      }
    : null,
}));

await app.listen({ port, host: '0.0.0.0' });
