# Feedback-to-GitHub Worker

Tiny Cloudflare Worker that takes a JSON feedback/error payload from the
static study app and files it as a GitHub issue using a server-side token.
The static page never sees the token.

## Why

GitHub Pages is static-only and the GitHub Issues API rejects unauthenticated
POSTs. To auto-post feedback (no click-through), we need a hosted endpoint
that holds a token. Cloudflare Workers' free tier (100k requests/day) is
plenty for this and doesn't require a credit card.

## One-time setup

1. **Create a fine-grained Personal Access Token**
   - https://github.com/settings/personal-access-tokens/new
   - "Only select repositories" → pick `Satuno86/conjugate-study-hub`
   - Repository permissions → **Issues: Read and write**
   - Everything else: No access
   - Copy the token (you'll only see it once)

2. **Install wrangler** (Cloudflare's CLI)
   ```sh
   npm install -g wrangler
   wrangler login
   ```

3. **Configure and deploy**
   ```sh
   cd worker
   wrangler secret put GITHUB_TOKEN
   # paste the PAT when prompted
   wrangler deploy
   ```

   wrangler will print the deploy URL, e.g.
   `https://conjugate-feedback.<your-subdomain>.workers.dev`.

4. **Wire it into the app**
   - Open `index.html`, find `BUG.FEEDBACK_ENDPOINT`, and paste the URL.
   - Commit + push.

## What it does

- Accepts `POST` with JSON `{ title, body, labels }`.
- Validates basic shape (size limits, required fields, honeypot).
- Calls `POST /repos/{owner}/{repo}/issues` with the stored token.
- Returns `{ url, number }` on success or `{ error }` on failure.
- Sends CORS headers so the static page can call it from
  `https://satuno86.github.io` (or `localhost` during dev).

## What it does NOT do

- No persistence. No rate limiting beyond Cloudflare's defaults.
- No spam/abuse detection beyond the honeypot field.
- No DMs / no comment posting. Issues only.

If abuse becomes a problem, add a Cloudflare WAF rule rate-limiting POSTs
to this worker by IP, or wire in Turnstile.

## Local testing

```sh
wrangler dev
# Worker runs at http://localhost:8787
```

Point the static page at it temporarily by setting
`BUG.FEEDBACK_ENDPOINT = 'http://localhost:8787'` in DevTools, or edit
`index.html` locally.
