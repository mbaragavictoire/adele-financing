# Publish the reviewed branch and create a separate Railway test service

These are FUTURE manual steps. The current authorization covers a local commit only; nothing has been pushed or deployed. Full secret-free runtime settings and restrictions are documented in ADELE_DEPLOYMENT_INTEGRATION.md and railway.env.example.

## Publish only the integration branch

1. Review the local commit on preparation/railway-pages-postgres-20261021 in this isolated worktree. The excluded dotenv examples can remain uncommitted; no real .env is included. Before publishing, confirm that existing Railway/Cloudflare production integrations still track master and will not automatically deploy this preparation branch. Their live settings were not inspected here.
2. From this worktree, after approval to publish, run:

       git log -1 --oneline
       git push --set-upstream origin HEAD:refs/heads/preparation/railway-pages-postgres-20261021

   origin was checked locally: its push target is mbaragavictoire/adele-financing on GitHub without embedded HTTP credentials. Do not use --all, --mirror, --force, neworigin or push master. A separate neworigin remote has embedded authentication in local Git configuration; do not print/copy it. That configuration is not committed. Existing ancestor history still contains the previously identified legacy temporary-admin password; this commit removes the current source occurrence but does not sanitize history. Any credential reuse/rotation/history rewrite is a separate task.

## Create a separate Railway test project, not a production replacement

3. In Railway, create a NEW EMPTY project named adele-postgres-test. Add an EMPTY service named adele-financing-pg-test. Do not duplicate the MySQL service/project, import its environment, provision another database, attach its volumes, move a production domain, or alter its source branch/start command. If the UI requires an environment, keep this new service only in its new test project. Existing adele-financing remains unchanged.
4. In this NEW service, stage the private Variables listed in railway.env.example and the integration report. Use the existing adele_railway Session Pooler password and proper PEM CA in PG_CA_CERT. Choose the protected Pages hostname before setting identical API_ALLOWED_ORIGIN and CORS_ORIGINS. Create a new private API_PROXY_SECRET for this test pair; do not reuse an old service secret or put it in VITE variables. Keep DATABASE_URL, ADELE_PG_FINANCIAL_POLICY and ADELE_PG_SEARCH_REVIEWED unset. Do not add legacy DB_* variables or seed credentials. PGSSLROOTCERT is created by startup; PORT is Railway-provided.
5. Connect mbaragavictoire/adele-financing as the source and select ONLY preparation/railway-pages-postgres-20261021. Hold/cancel any automatically queued deployment until branch and settings are correct. Do not merge to master. Set:

   - Root directory: /adele-financing
   - Config file path: /adele-financing/railway.json (if explicit configuration selection is needed)
   - Node: 24.x, matching package.json; remove only this NEW service's conflicting version override
   - Build: npm ci --include=dev && npm run build
   - Start: npm run start:railway
   - Health path: /api/health; timeout 120 seconds
   - One replica; PG_POOL_MAX=5, coordinated with role connection limit 5
   - No pre-deploy SQL or migration command

6. STOP for deployment approval. Review the pending changes: only adele-financing-pg-test in adele-postgres-test must be targeted. Verify the selected source commit is the local integration commit after it is pushed. Creating/configuring the service is not authorization to deploy it.

## First approved test deployment and acceptance

7. Only after explicit approval, deploy this NEW test service. Use its own Railway-generated domain; do not reassign the existing MySQL domain. Startup must create the CA file, verify TLS and reach /api/health=200. Stop on certificate, login, startup-options or grant errors; never change to sslmode=require or an owner login to get past them. Do not expose variables or raw database diagnostics when sharing logs.
8. Check hosted effective financial grants with the prepared read-only verification procedure under separate approval. Confirm an ADELE application admin exists; the adele_railway database role is not an application user. The seed creates no usable staff account. No automatic first-admin/password bootstrap is included.
9. Prepare, then separately approve, a protected Pages test deployment using wrangler.restricted.toml and API_UPSTREAM pointing to the NEW service's Railway domain. Use the same exact frontend origin and private proxy secret on both services. Do not touch existing Cloudflare production deployments or domains. Build VITE_ADELE_PREVIEW_ONLY=false and VITE_API_URL empty; protect all paths with Access and fail-closed Functions routing. See cloudflare/restricted.env.example.
10. Verify login/logout, session cookie security, rejected direct Railway access, origin/path rejection, no-cache API responses and denied financial writes/documents in the protected test environment. Only then plan any separate production cutover. Keep the old MySQL service and its private configuration as rollback; do not delete, stop or repoint it during this test.

Official platform references: [Railway services](https://docs.railway.com/services), [isolated environments](https://docs.railway.com/environments). No remote platform state was inspected or changed during local commit preparation.
