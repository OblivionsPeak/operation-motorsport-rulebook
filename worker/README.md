# Rulebook backend — Cloudflare Worker

Tiny free backend for the rulebook editor. It stores the rulebook data in
Cloudflare KV and checks the **shared admin password server-side**, so multiple
people can log in with one password and their edits persist for everyone.

The page itself stays on GitHub Pages — this just provides the storage + auth it
was missing.

## One-time setup

You need a (free) Cloudflare account. Run these from this `worker/` folder.

```bash
# 1. Install the CLI (or use `npx wrangler ...` for each command)
npm install -g wrangler

# 2. Log in to your Cloudflare account (opens a browser)
wrangler login

# 3. Create the KV namespace, then paste the printed id into wrangler.toml
wrangler kv namespace create RULEBOOK
#   -> copy the id = "..." it prints into the [[kv_namespaces]] block

# 4. Set the shared admin password (stored encrypted, never in the repo)
wrangler secret put ADMIN_PASSWORD
#   -> type the password your editors will use

# 5. Deploy
wrangler deploy
#   -> prints your Worker URL, e.g. https://opmo-rulebook-api.<you>.workers.dev
```

## Connect the page

Open `../index.html`, find this line near the top of the `<script>`:

```js
const API_BASE='https://REPLACE-WITH-YOUR-WORKER.workers.dev';
```

Replace the URL with the Worker URL from step 5 (no trailing slash). Commit and
push — GitHub Pages updates in about a minute.

## Changing the password later

```bash
wrangler secret put ADMIN_PASSWORD   # type the new one
```

Anyone currently logged in stays logged in only until their next save; new logins
need the new password. Nothing in the repo changes.

## How it works

| Route        | Auth                         | Purpose                          |
|--------------|------------------------------|----------------------------------|
| `GET /data`  | none (public read)           | Page loads the current rulebook  |
| `POST /login`| `{ password }` in body       | Validates the shared password    |
| `POST /data` | `Authorization: Bearer <pw>` | Saves edits (password re-checked)|

The password lives only as an encrypted Worker secret and is compared on the
server. It is never shipped to the browser or committed to git — which is the key
difference from the old client-side login.

## Notes

- **Free tier** easily covers a rulebook: 100k Worker requests/day and generous KV
  limits. This will not cost anything in normal use.
- CORS defaults to `*` (safe here, since writes require the password). To lock it
  to your site, uncomment the `ALLOW_ORIGIN` var in `wrangler.toml` and redeploy.
- The whole rulebook data blob is capped at ~200 KB server-side.
