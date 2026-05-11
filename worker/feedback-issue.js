// Cloudflare Worker: accepts feedback/error payloads from the static app
// and files them as GitHub issues using a server-side token.
//
// Configure via environment variables (wrangler secrets):
//   GITHUB_TOKEN  – fine-grained PAT scoped to the target repo, "Issues: write"
//   GH_OWNER      – repo owner (default: Satuno86)
//   GH_REPO       – repo name (default: conjugate-study-hub)
//   ALLOWED_ORIGINS – comma-separated list of allowed Origin headers
//                     (default: the GitHub Pages origin)

const DEFAULT_ALLOWED = [
  'https://satuno86.github.io',
  'http://localhost:3000',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];

function allowedSet(env) {
  const raw = (env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return new Set(DEFAULT_ALLOWED);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = allowedSet(env);
  const allow = allowed.has(origin) ? origin : [...allowed][0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (req.method !== 'POST') {
      return json(405, { error: 'POST only' }, cors);
    }

    // Enforce the origin allowlist. CORS headers alone only prevent the
    // browser from reading the response — a third party can still issue a
    // blind cross-origin POST and abuse the token. Reject here explicitly.
    const origin = req.headers.get('Origin') || '';
    if (!allowedSet(env).has(origin)) {
      return json(403, { error: 'origin not allowed' }, cors);
    }

    let payload;
    try {
      payload = await req.json();
    } catch (e) {
      return json(400, { error: 'invalid JSON' }, cors);
    }

    // Honeypot: silently drop anything filling the fake `website` field.
    if (payload && payload.website) {
      return json(200, { ok: true, suppressed: true }, cors);
    }

    const title = String(payload.title || '').trim();
    const body = String(payload.body || '').trim();
    const labelsInput = payload.labels;
    let labels = [];
    if (Array.isArray(labelsInput)) {
      labels = labelsInput.map(String);
    } else if (typeof labelsInput === 'string' && labelsInput) {
      labels = labelsInput.split(',');
    }
    labels = labels.map((s) => s.trim()).filter(Boolean).slice(0, 8);

    if (!title || title.length > 200) {
      return json(400, { error: 'title required (1-200 chars)' }, cors);
    }
    if (!body || body.length > 30000) {
      return json(400, { error: 'body required (1-30000 chars)' }, cors);
    }

    const owner = env.GH_OWNER || 'Satuno86';
    const repo = env.GH_REPO || 'conjugate-study-hub';
    if (!env.GITHUB_TOKEN) {
      return json(500, { error: 'GITHUB_TOKEN not configured on worker' }, cors);
    }

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'conjugate-study-hub-feedback-worker',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels }),
    });

    if (!ghRes.ok) {
      const txt = await ghRes.text();
      return json(ghRes.status, {
        error: 'GitHub API error',
        status: ghRes.status,
        detail: txt.slice(0, 500),
      }, cors);
    }
    const issue = await ghRes.json();
    return json(200, { url: issue.html_url, number: issue.number }, cors);
  },
};
