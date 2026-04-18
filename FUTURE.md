# Future exploration — Power Apps code apps

Open questions and unvalidated behaviors worth probing against a live environment. Each item lists what to test, how to test it with the existing [src/pages/write-test.tsx](src/pages/write-test.tsx) harness + Chrome DevTools MCP, and what to fold back into [SKILL.md](SKILL.md) once confirmed.

## 1. Publish / push flow

- **`npx power-apps push` on an app that already exists**: does it create a new version or overwrite? Validate by pushing twice and inspecting `list-codeapps` versions and the Power Apps maker portal "Versions" panel.
- **`--solution-id` behavior**: push once outside a solution, then again with `--solution-id <guid>` — does it move the component, or does it fail? Document the correct "solution-first" workflow.
- **Sharing / RBAC**: after `push`, end-users can't open the app without explicit share. Capture the exact portal steps (Apps → … → Share) and whether there's a CLI equivalent.
- **Rollback**: is there an "unpublish" or revert to prior version? Test via portal + any undocumented `power-apps` sub-command (`power-apps --help` doesn't list one).

## 2. Environment variables at runtime

- `list-environment-variables` shows them from CLI. How do you **read** them inside the running code app?
  - Test: add a string env var in Power Platform admin, re-push, and look for it on `getContext()`, on `getClient(dataSourcesInfo)`, or via a generated service.
  - Compare with Dataverse `environmentvariabledefinition` / `environmentvariablevalue` tables — may need to `add-data-source` them.

## 3. Connection references for non-Dataverse connectors

- Add a **SQL** data source (`add-data-source --sql-stored-procedure <name>`) against a real Azure SQL instance and capture:
  - What appears in `power.config.json` vs `src/generated/services/`.
  - How to call a stored proc that takes parameters.
  - How auth works in local-play (`@microsoft/power-apps-vite` plugin bridging vs. `power-apps run` proxy).
- Add a **SharePoint list** source via `add-data-source` + an existing SharePoint connection reference — does the generated service differ in shape from Dataverse?
- Add a **custom connector** — document the `list-connection-references`/`list-apis` discovery flow.

## 4. Cloud flows (Power Automate)

- `add-flow --flow-id <guid>`: capture the generated service signature for:
  - A flow with request body (JSON schema → typed input?).
  - A flow with multiple outputs (union of return types?).
  - A flow that returns a collection (paged? always in-memory?).
- Error shape when the flow fails mid-run — does it come back as `IOperationResult.error` or throw?
- Concurrent invocations — is there a rate limit / queue?

## 5. Dataverse actions & custom APIs

- `find-dataverse-api --search <term>` discovery — generate a service for a built-in unbound action (e.g. `WhoAmI`) and for a bound action (e.g. `Merge`).
- Parameter binding syntax for entity-reference / entity-collection parameters — does `@odata.bind` still apply, or does the generated signature hide it?
- Custom API (solution-scoped) with complex request/response types — how well do generics flow through?

## 6. `$expand` escape hatch

- ~~We claim raw `executeAsync({ dataverseRequest: ... })` can bypass the typed SDK.~~ **Closed (2026-04-17):** Verified live — `action: "retrieveMultipleRecords"` returns `"Unsupported Dataverse action"`. The `executeAsync` path only whitelists specific actions (`getEntityMetadata` confirmed, others unknown). **There is no `$expand` escape hatch from a code app today.** Remaining open item: enumerate what `action` values ARE accepted — read the SDK source in `node_modules/@microsoft/power-apps/dist/` for the allowlist.

## 7. Write edge cases (`@odata.bind`)

- ~~**Clearing a lookup**: `"primarycontactid@odata.bind": null` — accepted? Or does the disassociate require `DELETE /accounts(<id>)/primarycontactid/$ref`?~~ **Closed (2026-04-17):** `"<nav>@odata.bind": null` is accepted and the read-back `_<lookup>_value` becomes `null`. The alt form `_<lookup>_value: null` fails with `0x80060888 "The reference property can only be deleted."` Folded into SKILL.md rule #9.
- **Polymorphic owner assignment**: `"ownerid@odata.bind": "/teams(<guid>)"` — does plain `update` work, or does Dataverse require the `Assign` action?
- **Many-to-many associate**: generated service exposes `createAsync` on the M:N target entity? Or is it raw API only?
- **Optimistic concurrency**: pass `@odata.etag` back on `update` — does the SDK forward it as `If-Match`?

## 8. File / image columns

- `upload(id, columnName, file)` on a non-image **file** column (not just `entityimage`) with `fileDisplayName` that differs from `file.name` — confirm the display name shows in Dataverse.
- ~~`downloadImage(id, 'entityimage', true)` full-size path — payload format (Uint8Array vs base64)?~~ **Closed (2026-04-17):** Payload is a real `Uint8Array` (PNG magic `89 50 4e 47` in the first 4 bytes). Wrap as `new Blob([bytes.buffer as ArrayBuffer], { type })`.
- **Open (regressed):** `downloadImage(id, 'entityimage', true)` returned `204 No Content` even after a 10-attempt / ~10-second retry following a successful upload, despite `entityimageid` / `entityimage_url` / `entityimage_timestamp` all being populated. The earlier hypothesis ("just needs a small delay") is wrong. **Next test**: try `fullSize=false` (thumbnail path), and inspect whether the issue is specific to full-size or to both endpoints. Until resolved, **render images via `entityimage_url`**, not `downloadImage`.
- Size limits — at what byte count does upload fail, and how is the error surfaced?

## 9. Multi-select picklist on writes

- Verify `serializeMultiSelectPicklistFields` with:
  - All three: empty array → `null`, single value → `"100"`, multi → `"100,200,300"`.
  - Confirm Dataverse accepts these and read-back round-trips cleanly.
- What happens if you pass a raw array straight to `create` without serializing? (Probably validation error — document the message.)

## 10. Metadata API surface

- ~~`AccountsService.getMetadata({ /* options */ })` — what's in `GetEntityMetadataOptions`?~~ **Partially closed (2026-04-17):** Verified live that passing `{}` returns only a skinny envelope (`@odata.context`, `MetadataId`, `LogicalName`). **Next test:** pass real options (`{ attributes: { select: [...] }, oneToManyRelationships: { select: [...] }, ... }`) and capture the full response shape; enumerate which fields the SDK types allow under each nested options object.
- Cache strategy — is there a built-in cache, or should app code memoize with Tanstack Query?
- How to **list all tables** (not just one entity's metadata) from a code app.

## 11. Filter syntax — more empirical tests

- ~~`contains`, `startswith`, `endswith` — case-sensitivity, wildcard escaping.~~ **Partially closed (2026-04-17):** `contains` / `startswith` / `endswith` all parse via the typed SDK's `filter` string. `contains` is **case-insensitive** (same row count for `'a'` vs `'A'`). Folded into SKILL.md rule #10. Still to test: wildcard escaping (how to search for a literal `'` or `%`).
- Date functions (`Microsoft.Dynamics.CRM.On`, `LastXDays`, `ThisWeek`) — syntax variants that actually parse.
- Hierarchical filters (`under`, `eqbusinessid`) — supported by the typed SDK or only raw?
- Lookup to formatted-value filtering — e.g. can we filter on the contact's `fullname` via `_primarycontactid_value` without an `$expand`? (Probably not.)

## 12. Mock executor

- Stand up a Vitest suite against `createMockDataExecutor` with a 3-row store.
- Confirm `filter`, `orderBy`, `top`, `skip`, `maxPageSize`/`skipToken` are all honored by the mock (or document which ones aren't).
- Snapshot test a list component end-to-end with the mock swapped in — no Power Apps host required.

## 13. Telemetry

- Implement a minimal `ILogger`, wire it via `initializeLogger` + `setConfig`, and run a build. Where do logs surface?
  - `npx power-apps telemetry --show-settings` — does app-level log routing appear?
  - Power Apps admin center → App analytics panels.
- What metric names / event types does the SDK emit automatically (`AppLoadResult`, `NetworkRequestMetric`, `SessionLoadSummaryMetric`)? Capture sample payloads.

## 14. Build / bundling

- `npm run build` with code-splitting — does `@microsoft/power-apps-vite` produce any runtime chunks that must not be split? Document any required Vite/Rollup config.
- Tree-shaking: confirm unused generated services don't bloat the bundle.
- Source maps in published app — `power-apps push` upload them?

## 15. Non-React frameworks

- Clone the same test suite in **Vue 3 + Vite** and **Svelte + Vite**. Confirm `@microsoft/power-apps-vite` plugin works identically.
- **Next.js**: known unsupported? If so, what fails — the init, the runtime auth, or the build? Document the exact failure mode so the skill can say "Next.js: not supported, use Vite/Remix/Astro instead."

## 16. Router / deep linking

- Does a direct link `https://apps.powerapps.com/…/a/<appId>/write-test` deep-link into the route, or does Power Apps strip the path? Test both local-play and a published app.
- Query params: `getContext().app.queryParams` captured `_localAppUrl` / `_localConnectionUrl` in local mode. What shows up in published mode? Can user-supplied deep-link params ride through?

## 17. Offline / network

- Behavior when Dataverse is unreachable — does `AccountsService.getAll()` return `{success: false, error}` or throw? Capture the error `code` field (is it `0x80072ee7` network, or wrapped)?
- The iframe host's offline indicator — does `getContext()` expose connectivity state?

## 18. Security / tenant

- Does the SDK forward `X-Forwarded-For` or any sensitive header we should know about?
- Token refresh — confirm long-running apps don't fail after the ~1-hour token TTL; look for silent refresh in the request headers.
- MFA / conditional access — does a conditional-access challenge in the browser iframe work, or does it break the auth handshake?

## 19. Governance / DLP

- `evaluateDlpPoliciesForApp` call was seen in the network log. What triggers it? Can a DLP policy block a specific connector and how does the app surface the block?

## 20. Upgrades

- Bump `@microsoft/power-apps` from 1.1.1 to next minor — does the generated `src/generated/**` need regeneration (`add-data-source` overwrite), or does it remain compatible?
- `@microsoft/power-apps-vite` minor bump — any breaking change in the `__vite_powerapps_plugin__` URL contract?

---

### Validation harness reminder

The repo already has the pieces to run any of these experiments end-to-end:

- **Add a button** in `src/pages/write-test.tsx` that runs the new scenario, logs the payload, and appends an entry to the on-page result log.
- **Drive the UI** with `mcp_chrome-devtoo_click` + `wait_for` + `get_console_message` to capture the JSON payload without manual copy-paste.
- **Capture real requests** with `list_network_requests` + `get_network_request({reqid, requestFilePath, responseFilePath})` to document on-the-wire shapes.

When a finding is solid, fold it into [SKILL.md](SKILL.md) under the relevant section (don't let this file grow into a parallel skill — this is a backlog, not documentation).
