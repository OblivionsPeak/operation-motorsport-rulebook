/**
 * Operation Motorsport Rulebook — backend API (Cloudflare Worker).
 *
 * Provides persistence + a server-side shared-password check for the rulebook
 * editor. The page (on GitHub Pages) reads/writes via this Worker.
 *
 *   GET  /data   -> returns the stored rulebook JSON (public read)
 *   POST /login  -> { password } ; 200 if it matches the shared password, else 401
 *   POST /data   -> save; requires header  Authorization: Bearer <password>
 *
 * Secrets / bindings (set during deploy — see README.md):
 *   env.ADMIN_PASSWORD  : the single shared admin password (Worker secret)
 *   env.RULEBOOK        : KV namespace binding that stores the data blob
 *   env.ALLOW_ORIGIN    : (optional) exact origin allowed for CORS; defaults to '*'
 */

const KEY = 'rulebook';
const EMPTY = '{"edits":{},"isActive":false}';
const MAX_BYTES = 200000; // ~200 KB cap on saved data

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || request.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const { pathname } = new URL(request.url);

    // --- public read ---
    if (request.method === 'GET' && pathname === '/data') {
      const data = (await env.RULEBOOK.get(KEY)) || EMPTY;
      return new Response(data, {
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // --- verify shared password ---
    if (request.method === 'POST' && pathname === '/login') {
      const body = await request.json().catch(() => ({}));
      if (!safeEqual(body.password, env.ADMIN_PASSWORD)) return json({ ok: false }, 401);
      return json({ ok: true });
    }

    // --- authenticated save ---
    if (request.method === 'POST' && pathname === '/data') {
      const pw = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!safeEqual(pw, env.ADMIN_PASSWORD)) return json({ ok: false }, 401);

      const raw = await request.text();
      if (raw.length > MAX_BYTES) return json({ ok: false, error: 'payload too large' }, 413);
      try { JSON.parse(raw); } catch { return json({ ok: false, error: 'invalid json' }, 400); }

      await env.RULEBOOK.put(KEY, raw);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'not found' }, 404);
  },
};

// Length-aware, constant-time-ish string compare.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
