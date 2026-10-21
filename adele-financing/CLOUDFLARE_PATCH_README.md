> Integration update: see ADELE_DEPLOYMENT_INTEGRATION.md for the current combined branch, startup, exact variables and verification. The following source-patch report retains its original scope and historical limitations.

# ADELE isolated security / Pages preview patch

Local branch: preparation/cloudflare-pages-security-20261019. Base: a104c041e15c2a43691429a6e657c70e59e0fc88. This is an uncommitted review worktree; the original ADELE worktree remains on master with its pre-existing UI changes.

Safe commands from this directory:

- npm run test:cloudflare: 26 offline tests, mock upstreams, no database/service connections.
- npm run build: preview-first frontend; output is this worktree's dist.
- node scripts/audit-legacy-credential.mjs: read-only exact-value source/history audit; no secret values in output.
- npm run dev or npm run dev:preview: Vite ONLY, using synthetic local API middleware. The old automatic concurrent API startup and localhost:4000 forwarding are absent from these defaults.
- npm run preview: local static preview with the same synthetic API middleware.

Do NOT run npm start, dev:api or the old verify/integrity scripts against real data. Their existing MariaDB bootstrap/test side effects are outside this patch's executed tests. No application/backend server was started during this work.

## Preview behavior

The UI defaults to VITE_ADELE_PREVIEW_ONLY=true unless explicitly set to false. It renders public layout pages plus a visible preview notice; admin, contact and application routes show an unavailable screen. AuthProvider is not mounted. A preview build with nonempty VITE_API_URL fails, preventing accidental browser bypass of /api.

wrangler.toml uses API_MODE=disabled by default and synthetic for the preview environment. .dev.vars.example and cloudflare/preview.env.example contain only non-secret examples. Nothing was copied into real runtime environment configuration.

- disabled: no upstream fetches; guest /api/auth/me returns 401, other API routes unavailable.
- synthetic: no upstream fetches; health/product examples only. Customer/staff reads and all writes are denied.
- railway: a separately approved SYNTHETIC SANDBOX ONLY, never current production. Requires API_STAGE=synthetic-sandbox, API_ALLOWED_ORIGIN (exact HTTPS frontend origin), API_UPSTREAM (fixed HTTPS dedicated *.up.railway.app origin), and a new random runtime API_PROXY_SECRET. The known production origin is explicitly blocked. No origin or secret is supplied in this patch.

Before forwarding any Railway operation, the proxy performs an authenticated, nonce-bound /api/preview/identity probe. The backend must return the dedicated synthetic marker and echo that nonce; ordinary/live backends fail before any actual API operation is forwarded. Each API response must also carry the synthetic-only marker. Proxy cookies preserve adele_session only, with host-only Secure/HttpOnly/SameSite=Strict/Path=/ attributes; clearing cookies remain valid. Multiple Set-Cookie headers are separate. Unsafe Origin/routing/redirect/cookie/header cases fail closed; all API results are no-store.

The opt-in backend guard requires ADELE_PROXY_SANDBOX_ONLY=true and a DB_NAME matching adele_synthetic_*; it rejects adele_lms and the retained restore-test name. It validates the runtime proxy secret, exact frontend Origin, stage and IP before setting trusted request metadata. The secret is removed from request headers after validation. clientIp no longer trusts arbitrary first X-Forwarded-For. These modules were tested without importing the database/bootstrap. A configured database prefix is a guardrail, not proof that a database contains synthetic data: its data provenance must be independently verified before any future connection.

## Credential/history remediation still needed

scripts/temp-admin.mjs is now an inert inactive descriptor with canAuthenticate=false, no password/hash/token, no environment/database imports and no create/delete capability. Direct invocation exits with a refusal. The exact former credential has zero current-source occurrences in this worktree and one historical blob occurrence in master/origin-master, at the old helper. The untouched original master worktree still contains the old helper until a separately reviewed local integration.

A prior read-only review found that literal matched an inactive local account, not active accounts. It must remain inactive and be rotated with session revocation before reuse, under separate approval. No credential/account/session was changed here. History was not rewritten. The historical legacy JWT fallback remains relevant only if an older deployed JWT build used it; current opaque sessions are different. Other distinct old test fixtures were not declared safe for production and must not be run against it.

## Validation limits / next step

26 offline tests and targeted ESLint pass; preview frontend build passes using installed dependencies. dist/_routes.json and dist/_headers are present. No dependency installation or lockfile changes. Wrangler/Miniflare and real-browser tests have not run; Cloudflare routing/streaming/platform limits and browser Secure/SameSite behavior still require local runtime/browser verification. The tests verify cookie/header semantics against a synthetic mock, not real staff login or financial correctness.

Review this patch and its detailed report before any integration. Next safe work is local Pages-runtime/browser validation after separately approving any needed tooling installation. Credential remediation, a truly isolated backend/data setup and all publication/deployment steps remain separately gated. Do not push, deploy, connect Supabase, merge into the running worktree or change its environment from this README.
