> Integration update: see ADELE_DEPLOYMENT_INTEGRATION.md for the current combined branch, startup, exact variables and verification. The following source-patch report retains its original scope and historical limitations.

﻿# ADELE protected online frontend preview preparation

Date: 2026-10-21 (Africa/Kigali). Status: CONDITIONAL GO for a protected, read-only frontend preview after Access setup; NOT yet approved or deployed. Hosted platform verification remains pending. No Ubuntu/Docker/browser-infrastructure work is required for this narrowed objective. Historical runtime/login failures remain unresolved and are not being marked passed.

## Scope and current evidence

Application: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\security_proxy_patch_20261019\adele-financing
Branch: preparation/cloudflare-pages-security-20261019. Existing changes/untracked files preserved. Original master source unchanged. No account lookup, production connection, commit, push, merge, deploy or credential rotation.

Checks performed in this continuation:

- Read isolated configuration, middleware/API implementation, preview routes/build policy and existing reports.
- Offline suite: final PASS 29/29. Existing suite initially expected only two invocation patterns; after adding all-route middleware coverage, that stale exact configuration assertion failed. Updated the expected configuration to include all routes, retained the security checks, and reran successfully.
- Targeted ESLint: PASS (functions/_middleware.js, tests/cloudflare.test.mjs, cloudflare).
- Frontend production build: PASS, Vite 8.2.2 / 73 modules.
- Wrangler 4.151.2 local Pages Functions compilation: PASS. This was build-only, not a deployed/runtime test. Bundler ancestor reads required the tool's elevated filesystem permission; no account or service access was used.
- Current source/historical known-password audit: zero current copies; one historical blob remains in master/origin-master reachable history. No history changed. Historical credential rotation remains a separate task before account reuse; this artifact does not contain it.
- Reviewed 15 dist files plus one separately compiled worker: no historical password, private-key blocks, JWT-like credentials, or database connection URI patterns found. Static file listing contains only frontend assets, index, favicon and Pages metadata. No .env, backup, PDF/DOCX, private key, source map, customer-upload directory or Git metadata is in dist. This is a bounded scan, not a proof against every unknown secret or image metadata.
- SHA-256 manifest saved locally at server/data/online-preview-preparation/artifact-manifest.json. The compiled worker is a verification artifact, not a directory to upload wholesale.

## Local routing fix made during review

Confirmed before fixing: middleware sent /api%2Floans, /%61pi/auth/login and /API/loans to context.next(), permitting SPA HTML; /api//loans already returned 400. This was demonstrated with synthetic offline requests, not asserted from a deployed Cloudflare response.

Changed functions/_middleware.js to reject encoded first path segments, treat all API-prefixed/case variants as API requests for strict validation, and deny server/uploads/backups/.env/.git paths. Changed public/_routes.json to invoke middleware for /* with no excludes while retaining /api and /api/*. Encoded asset filenames under /assets continue to work. Added regression coverage, including repeat encoding, doubled slashes, uppercase API prefix and private paths. All-route invocation adds Functions requests; set platform fail-closed behavior to avoid quota exhaustion returning static fallback. Hosted URL normalization must still be checked after an authorized deployment.

## Safe preview contract — server enforcement versus UI

Set runtime API_MODE=synthetic for preview deployments. Base production configuration is currently API_MODE=disabled, which also makes no upstream calls. Do not set API_UPSTREAM, API_PROXY_SECRET, API_STAGE, API_LOCAL_RUNTIME or service/database/storage bindings. No Railway/Supabase/MariaDB backend is needed.

The Pages Function, independently of React visibility, handles only GET/HEAD /api/health and /api/loan-products with hard-coded synthetic JSON. Same-origin OPTIONS is answered locally. It rejects other API reads, login/write operations, customers, documents and financial APIs. /api/auth/me returns 401; denied operations return 403 (invalid routes/methods/configuration may return other non-success errors). The synthetic branch returns before any upstream fetch, identity probe, session parsing or backend configuration. Request-supplied headers cannot change API_MODE or create a service binding. API origin/CSRF restrictions and private/no-store/CDN no-store headers are server enforced.

The shared proxy source still contains guarded Railway/local testing capabilities. This review does not claim those capabilities were removed. Safety depends on the reviewed synthetic/disabled configuration and absence of upstream secrets/bindings; do not change mode to railway for this project. The compiled worker contains the known production hostname as a denylist constant, not as a configured target. It imports no Express entrypoint, database driver or customer storage.

React preview defaults on, omits AuthProvider and disables /admin/*, /apply and /contact. Those UI restrictions support usability; direct API requests remain blocked server-side. The browser CSP uses connect-src 'self' and form-action 'self' as additional controls. No external analytics or service integration should be enabled.

Public brochure content includes actual staff names/portraits and company branding. These are not synthetic people. No customer records/documents were found in the reviewed artifact. Confirm that existing brochure media is approved for the intended testers; do not describe every byte as synthetic. Literal image-content/EXIF auditing was not completed.

## Authentication and sessions

No ADELE staff authentication, session creation, password submission or financial-role testing is enabled online. Synthetic mode does not emit ADELE Set-Cookie headers or consume a session as authorization. All customer/staff API routes remain denied even if a tester brings an old adele_session cookie. The historical local session-rotation failure is outside this read-only preview scope and remains a blocker for functional staff/backend exposure.

Cloudflare Access supplies the tester login gate and manages its own session cookie. It is separate from adele_session. Use exact tester email/identity allowlists, a short session duration and an identity provider/one-time email login; use MFA where the selected provider supports it. Do not use Everyone/Bypass/public rules, a shared password in frontend code, or ADELE production credentials. Protect all paths, including /api and /assets, not just the login screen. Confirm unauthenticated users cannot fetch HTML, JS or API fixtures directly.

## Recommended publication method and exact settings

Use a NEW dedicated Cloudflare Pages Direct Upload project named adele-synthetic-preview if available; do not repurpose the existing Workers deployment or alter an existing Pages project's integration mode. Use Wrangler from this isolated application root so it compiles the sibling functions folder. Upload only dist as static content; never upload '.', server/data, the worktree parent or a ZIP of the repository. Dashboard drag-and-drop does not compile a functions directory, so it would omit the security handlers.

| Setting | Value |
| --- | --- |
| Hosting | Cloudflare Pages, separate Direct Upload project |
| Local build/command root | Existing isolated application directory printed above |
| Git build root, if separately approved later | adele-financing relative to repository root |
| Framework | React/Vite |
| Build | npm.cmd run build locally; npm run build for a future Linux Git build |
| Output/upload directory | dist relative to application root |
| Preview build variables | VITE_ADELE_PREVIEW_ONLY=true; VITE_API_URL empty/unset |
| Runtime preview variable | API_MODE=synthetic |
| Production/base runtime | API_MODE=disabled; do not upload an ADELE production deployment |
| Compatibility date | 2026-10-19 |
| Production branch | master, explicitly verified at project creation |
| Uploaded branch | preparation/cloudflare-pages-security-20261019 (must differ from production branch) |
| Backends/secrets/storage/database bindings | None |
| Functions quota behavior | Fail closed |

Direct Upload uses the locally built files, so no Git commit/push is necessary. Functions source is compiled separately; it is not public static content. Do not publish the compiled-test directory, reports or raw test artifacts. Preserve the local runtime harness guard; online preparation does not bypass or claim a pass for the old local runtime tests.

## Step-by-step plan — all Cloudflare mutations require approval

1. Approve creation of the empty dedicated Pages project and Access configuration only. Supply the tester identity allowlist privately. Verify project-name availability; do not overwrite a collision. Keep the project disconnected from Git auto-deploys and production domains.
2. Create the empty project with production branch master. Before uploading ADELE content, enable the Pages preview access policy and inspect its actual generated application. Protect both <project>.pages.dev and *.<project>.pages.dev with exact tester allowlists covering every path. Cloudflare documents separate protection for the base hostname. Verify hash URLs and branch aliases are included. Attach no custom domains. If policy setup cannot be completed before content exists, stop; do not upload ADELE as a temporary workaround. Any harmless placeholder deployment would require its own explicit approval.
3. Set/verify preview API_MODE=synthetic, base API_MODE=disabled, absence of upstream/database/storage bindings and secrets, Functions fail-closed quota behavior and no external analytics. Local wrangler.toml is configuration input; verify actual dashboard deployment settings too. Do not reveal authentication tokens.
4. Rebuild with explicitly pinned preview build variables, rescan dist and compiled function, and record SHA-256 manifest. Ensure the command is run in this exact isolated application directory. Do not bundle parent-directory data or test files.
5. Obtain separate approval for uploading the reviewed artifact. Only then run the installed Wrangler, conceptually:
   node tools/runtime/node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name adele-synthetic-preview --branch preparation/cloudflare-pages-security-20261019 --commit-dirty=true
   This is a proposed command, NOT executed. The dirty flag declares the local uncommitted snapshot; it does not commit. Inspect the deployment summary to ensure Preview, expected project, expected branch and Functions before sharing any URL. Authenticate through the normal Cloudflare flow only after approval; never put credentials in source or reports.
6. First verify logged-out requests to the hash URL, branch alias and base hostname are gated by Access, including direct asset/API URLs. Then test authorized desktop/mobile navigation, synthetic fixture JSON, blocked staff login/operations/documents, malformed paths, foreign Origin rejection and no-cache responses. Use synthetic inputs only. Stop/restrict access on any unexpected production endpoint, SPA API fallback, missing Functions or Access bypass.
7. Share the protected preview URL with the approved testers only after hosted checks pass. Record actual results; do not claim hosted session/browser tests passed before execution. Keep production domain, master branch and backend unchanged.

## Readiness and blockers

CONDITIONAL GO for this read-only protected frontend scope. Local source/build/security checks pass. Publication itself is NOT approved or performed. Remaining pre-upload blockers: project/account ownership and availability, actual Access policy coverage and tester allowlist, platform fail-closed setting, reviewed synthetic-only runtime variables/bindings, and approval of the exact upload. Hosted platform/Access/browser verification remains pending after the protected upload. Unknown-secret/image metadata completeness is a limitation, not a blanket confidentiality guarantee.

The prior disposable-runtime network/TLS blocker is not being solved or bypassed: no local runtime/browser test is run, and this online preview has no application login or backend. It remains relevant before any future functional authentication/backend exposure. Prior historical credential exposure still needs separate administrative remediation before reuse; Git history is not uploaded by the proposed artifact-only method.

Exact next action requiring approval: create the empty dedicated Pages project and configure/verify Cloudflare Access for the named tester allowlist, with NO ADELE content upload yet. The subsequent protected artifact upload remains a separate approval step. No GitHub push is required.

## Official references checked for this plan

- [Direct Upload and Functions limitations](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Preview deployment access and aliases](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Protect the base pages.dev hostname as well as previews](https://developers.cloudflare.com/pages/platform/known-issues/)
- [Functions routing and fail-closed quota setting](https://developers.cloudflare.com/pages/functions/routing/)
