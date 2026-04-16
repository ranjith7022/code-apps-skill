---
name: codeapps
description: Build, run, and deploy Power Apps code apps — custom web apps (React/Vue/Vite/TypeScript) that run inside Power Apps with Microsoft Entra auth and access to 1,500+ Power Platform connectors. Use when the user asks to scaffold, develop, add data sources/flows to, or publish a Power Apps code app, or mentions `@microsoft/power-apps`, `@microsoft/power-apps-cli`, `npx power-apps`, or `pac code`.
---

## Core Concepts

**What is a code app**: A web app built with standard web tech (React, Vite, TypeScript) that runs *inside* Power Apps. It authenticates via Microsoft Entra, uses Power Platform connectors/Dataverse/flows as data sources, and is published to a Power Platform environment. Apps run in the browser only (not Power Apps mobile/Windows) and require a Power Apps Premium license for end users.

**CLI**: Prefer `npx power-apps <command>` from `@microsoft/power-apps-cli` (bundled with `@microsoft/power-apps` v1.0.4+). It replaces the deprecated `pac code` commands. Runs interactively by default; pass flags or add `--non-interactive` for scripting.

**Config file**: `power.config.json` in the project root stores `environmentId`, `region`, connection references, data sources, and flows. Most CLI commands read and/or mutate this file.

**Prerequisites**:
- Node.js LTS and npm
- Code apps enabled on the target environment (Power Platform admin center → Environments → Settings → Product → Features → "Enable code apps")
- Power Apps Premium license for end users
- User signed in (the CLI triggers interactive login on first command; `npx power-apps logout` to sign out)

## Workflow Patterns

### Scaffold a new app

Use the official starter (recommended; React + Vite + Tailwind + Tanstack Query + React Router):

```sh
npx degit microsoft/PowerAppsCodeApps/templates/starter my-app
cd my-app
npm install
```

Minimal alternative: `templates/vite` (plain Vite + React). For an existing web app, add the SDK: `npm install @microsoft/power-apps` then run `npx power-apps init`.

### Initialize Power Apps integration

```sh
npx power-apps init \
  --display-name "My App" \
  --environment-id <env-guid> \
  --build-path ./dist \
  --file-entry-point index.html \
  --app-url http://localhost:3000
```

Omit flags to be prompted. This creates/updates `power.config.json`.

### Add data sources

- **Connector table/resource**: `npx power-apps add-data-source` (prompts for API, connection, table). Discover values with `list-connection-references`, `list-datasets`, `list-tables`.
- **Dataverse table (shortcut)**: `npx power-apps add-data-source --api-id dataverse --resource-name <table> --org-url <orgUrl>`. No pre-existing connection reference is required; the CLI fetches entity metadata (attributes, option sets, relationships) directly from Dataverse and scaffolds a typed service. Get `<orgUrl>` from `pac env who` ("Org URL"). Example: `--api-id dataverse --resource-name account --org-url https://contoso.crm.dynamics.com/`.
- **SQL stored procedure**: `add-data-source --sql-stored-procedure <name>` (use `list-sqlStoredProcedures`).
- **Cloud flow**: `npx power-apps add-flow --flow-id <guid>` (discover with `list-flows --search <name>`). Generates typed model services and wires connection references.
- **Dataverse action/function**: discover with `find-dataverse-api --search <term>`.
- **Remove**: `delete-data-source` or `remove-flow --flow-name <name>`.

After adding sources, generated TypeScript models/services appear under `src/generated/` (`src/generated/models/` and `src/generated/services/`, e.g. `AccountsService.ts`). The raw entity schema is cached at `.power/schemas/<api>/<dataSourceName>.Schema.json`. The data source name is pluralized from the table (e.g. `account` → `accounts`). Import and call generated services from app code — do **not** hand-edit generated files; re-run `add-data-source` / `add-flow` to regenerate.

### Run locally

The **recommended path** is the `@microsoft/power-apps-vite` plugin (already wired into the official `starter` template's `vite.config.ts` as `powerApps()`). The plugin serves `/__vite_powerapps_plugin__/power.config.json` from the Vite dev server itself and handles SDK auth / connector bridging — **you do NOT need `npx power-apps run`**:

```sh
npm run dev     # Vite on :5173 (default) — this is all you need
```

Then open the Power Apps local-play URL (templated with your env id) in a browser already signed in to the tenant:

```
https://apps.powerapps.com/play/e/<envId>/a/local
  ?_localAppUrl=http://localhost:5173/
  &_localConnectionUrl=http://localhost:5173/__vite_powerapps_plugin__/power.config.json
```

If your stack has no Vite plugin (plain Vue, Svelte, Next.js, bare webpack, etc.) **then** fall back to the standalone proxy:

```sh
npm run dev                    # framework dev server
npx power-apps run --port 8080 # proxy that injects auth + connector bridging
```

In that fallback case, browse the URL printed by `power-apps run`, not the raw framework URL.

### Build and publish

```sh
npm run build                  # produce build-path output (default ./dist)
npx power-apps push            # uploads and registers the app in the environment
# optional: --solution-id <name-or-id> to add it to a specific solution
```

Verify with `npx power-apps list-codeapps`. The app then appears in Power Apps → Apps.

## Common Commands Reference

| Task | Command |
|------|---------|
| Global help | `npx power-apps --help` |
| Command help | `npx power-apps <command> --help` |
| Switch environment | re-run `init` or edit `power.config.json` `environmentId`; use `-e <guid>` per-command |
| List apps | `npx power-apps list-codeapps` |
| List connection refs | `npx power-apps list-connection-references [-s <solution-id>]` |
| List flows | `npx power-apps list-flows [--search <term>]` |
| Env variables | `npx power-apps list-environment-variables` |
| Logout | `npx power-apps logout` |
| Telemetry | `npx power-apps telemetry --show-settings` / `--disable` |

Global flags available on every command: `--cloud <prod|test|...>`, `-e/--environment-id`, `--non-interactive`, `--json`, `--no-color`.

## Decision Guidance

- **New project**: use the `starter` template unless the user needs a minimal stack — then use `vite`.
- **Existing React/Vite app**: add `@microsoft/power-apps`, run `init`, set `--app-url` and `--build-path` to match the existing dev server and output dir.
- **Non-React (Vue/Svelte/etc.)**: supported; ensure `file-entry-point` and `build-path` match the framework's output.
- **CI / scripted push**: pass `--non-interactive` with all required flags; fail fast if `power.config.json` is missing.
- **Data access from app code**: always go through generated services, not raw `fetch` — they handle auth and connector routing via the SDK.

## Dataverse Web API — `$select` by field type

When calling Dataverse via a connector or direct Web API from a code app, use the logical column names with `$select`. Behavior differs by type:

### Simple fields (string, number, bool, datetime, money, decimal)

```http
GET /api/data/v9.2/accounts?$select=name,revenue,creditonhold,createdon
```

For currency/localized display, request formatted-value annotations:

```
Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"
```

Use `odata.include-annotations="*"` during development to include all annotations.

### Lookup fields

Lookup columns are exposed as `_<logicalname>_value`. You must use the underscore form in `$select`:

```http
GET /api/data/v9.2/accounts?$select=name,_primarycontactid_value
Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.associatednavigationproperty,Microsoft.Dynamics.CRM.lookuplogicalname"
```

Returned annotations:
- `...@OData.Community.Display.V1.FormattedValue` — primary name of the related record
- `...@Microsoft.Dynamics.CRM.lookuplogicalname` — target table (required for polymorphic lookups: Customer, Owner, Regarding)
- `...@Microsoft.Dynamics.CRM.associatednavigationproperty` — nav property to use with `$expand`

To retrieve related fields, use the single-valued navigation property with `$expand` (not the `_..._value` form):

```http
GET /api/data/v9.2/accounts?$select=name
  &$expand=primarycontactid($select=fullname,emailaddress1)
```

For polymorphic lookups, cast each target:

```
$expand=customerid_account($select=name),customerid_contact($select=fullname)
```

### Option sets (choice / picklist)

`$select` returns the **integer** value; the formatted-value annotation gives the label:

```http
GET /api/data/v9.2/accounts?$select=name,statuscode,industrycode
Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue"
```

→ `"statuscode@OData.Community.Display.V1.FormattedValue": "Active"`.

### Multi-select option set

Value is a comma-separated string of ints; formatted value is comma-separated labels:

```json
"my_categories": "1,3,7",
"my_categories@OData.Community.Display.V1.FormattedValue": "Red, Blue, Green"
```

### Status / State

`statecode` and `statuscode` are option sets — same treatment as above.

### Yes/No (boolean)

Raw `true`/`false`; formatted-value annotation returns the localized Yes/No label from metadata.

### Rollup / calculated

Same `$select`. Rollup fields additionally expose `<field>_date` (last calc) and `<field>_state`. Trigger recompute via the `CalculateRollupField` function.

### Image / file columns

- Image (e.g. `entityimage`): `$select=entityimage` returns base64 thumbnail; also `entityimage_url`, `entityimage_timestamp`, `_entityimageid_value`. Full image via `GET /entityimages(<id>)/$value`.
- File: `$select` the column for metadata; download via `GET .../<filefield>/$value`.

### Collections (1:N / N:N)

Use `$expand` with nested `$select` / `$filter` / `$top`:

```http
GET /api/data/v9.2/accounts(<guid>)?$select=name
  &$expand=contact_customer_accounts($select=fullname,emailaddress1;$filter=statecode eq 0;$top=5)
```

### Combined example

```http
GET /api/data/v9.2/accounts?
  $select=name,revenue,statuscode,_primarycontactid_value,_ownerid_value
  &$expand=primarycontactid($select=fullname)
  &$top=10
Accept: application/json
OData-MaxVersion: 4.0
OData-Version: 4.0
Prefer: odata.include-annotations="*"
```

### Quick rules

1. Lookups → `_<name>_value` in `$select`, or the navigation property in `$expand`.
2. Option sets & booleans → integer by default; add `FormattedValue` annotation for labels.
3. Polymorphic lookups always need `lookuplogicalname` (or an `$expand` cast).
4. Cannot `$select` navigation properties — use `$expand` on the raw Web API. **Inside a code app the typed SDK does NOT expose `$expand`** — fall back to a second service call by id.
5. `Prefer: odata.include-annotations="*"` during dev; narrow it in production.

Docs: [Query data](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query-data-web-api) · [Retrieve related](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/query/select-related-entities-query) · [Annotations](https://learn.microsoft.com/power-apps/developer/data-platform/webapi/compose-http-requests-handle-errors#include-annotations-with-data).

### In a code app — how the typed SDK maps these concepts

The generated service (e.g. `src/generated/services/AccountsService.ts`) wraps `@microsoft/power-apps/data`'s client. You do **not** build raw `$select=...&Prefer:...` URLs; use `IGetOptions` / `IGetAllOptions` with a `select: string[]`:

```ts
import { AccountsService } from '@/generated/services/AccountsService';

const { data } = await AccountsService.getAll({
  select: [
    'name',
    'revenue',
    'statuscode',              // option set — integer value
    'industrycode',
    '_primarycontactid_value', // lookup GUID
  ],
  filter: 'statecode eq 0',
  top: 50,
});
// Display labels come back as OData annotation keys on each row, NOT as
// `<field>name` properties. Read them like this:
const row = data![0];
const statusLabel        = row['statuscode@OData.Community.Display.V1.FormattedValue'];            // "Active"
const industryLabel      = row['industrycode@OData.Community.Display.V1.FormattedValue'];          // "Consulting"
const primaryContactName = row['_primarycontactid_value@OData.Community.Display.V1.FormattedValue']; // "Rene Valdes"
const contactTable       = row['_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname'];  // "contact"
const revenueFormatted   = row['revenue@OData.Community.Display.V1.FormattedValue'];               // "$10,000.00"
```

A small helper keeps the UI code clean:

```ts
const FV = '@OData.Community.Display.V1.FormattedValue';
const formatted = <T extends object>(row: T, col: string) =>
  (row as Record<string, unknown>)[col + FV] as string | undefined;
```

What the generated model (`AccountsModel.ts`) gives you **in the TypeScript type**:

- **Simple fields** — plain typed properties (`name?: string`, `revenue?: number`).
- **Option sets** — typed as generated string-enum unions (`Accountsstatuscode`, `Accountsindustrycode`) holding the integer value (keyed numerically). The model also declares optional `<field>name` properties (`statuscodename`, `industrycodename`, `primarycontactidname`, …) — these are **convenience declarations for write scenarios / future compatibility; the runtime does NOT populate them** on reads. Do not read from them.
- **Lookups (read)** — `_<lookup>_value` (GUID) is a real column. Display name, target table, and nav property arrive as OData annotation keys on the result object (see above). The `<lookup>name` TS property is not populated at runtime — ignore it.
- **Lookups (write / `@odata.bind`)** — the generated `create` / `update` signatures type the payload as `Omit<AccountsBase,'accountid'>` which does **not** include `@odata.bind` keys. Cast the payload and use the **navigation property name** (from the `@Microsoft.Dynamics.CRM.associatednavigationproperty` annotation — lowercase, e.g. `primarycontactid`, `ownerid`) bound to `/<entitySetName>(<guid>)` (plural, lowercase, e.g. `/contacts(...)`, `/systemusers(...)`):
  ```ts
  await AccountsService.create(
    {
      name: "Fabrikam",
      "primarycontactid@odata.bind": `/contacts(${contactId})`,
      // polymorphic — pick the right collection based on the target:
      "ownerid@odata.bind": `/systemusers(${userId})`, // or /teams(${teamId})
    } as unknown as Parameters<typeof AccountsService.create>[0],
  );
  ```
  Verified on-the-wire request the SDK emits (batched to `/api/data/v9.0/$batch`):
  ```http
  POST accounts HTTP/1.1
  Accept: application/json
  Prefer: return=representation,odata.include-annotations=*
  Content-Type: application/json

  {"name":"...","primarycontactid@odata.bind":"/contacts(fa387ae6-ef2b-...)"}
  ```
  Response is `201 Created` and — because the SDK always sends `return=representation,odata.include-annotations=*` — `IOperationResult.data` already contains every annotation (`_primarycontactid_value@OData.Community.Display.V1.FormattedValue`, etc.) with no extra round-trip. `update` uses the same `@odata.bind` form inside the `changedFields` argument.
- **`$expand` / related rows** — **not supported by the generated SDK.** `IGetOptions` and `IGetAllOptions` expose only `select / filter / orderBy / top / skip / count / skipToken / maxPageSize` (verified in `@microsoft/power-apps/dist/internal/data/core/types/index.d.ts`). There is no `expand` field. To pull fields from a related row, use the **N+1 pattern**: `select` the `_<lookup>_value`, then call the related table's service by id:
  ```ts
  const acc = (await AccountsService.getAll({
    select: ["accountid", "name", "_primarycontactid_value"] as string[],
    top: 1,
  })).data![0] as Accounts & Record<string, unknown>;

  const contactId = acc._primarycontactid_value as string;
  const contact = (await ContactsService.get(contactId, {
    select: ["fullname", "emailaddress1", "jobtitle"],
  })).data!;
  ```
  For list pages that need related fields on many rows, fetch the parent list first, collect the `_<lookup>_value` GUIDs, then chain them into a single `ContactsService.getAll({ filter: "contactid eq <g1> or contactid eq <g2> or …" })` call and join client-side. **Do NOT use `contactid in (…)` syntax** — verified live: Dataverse rejects it with `0x8006088a "The query node In is not supported"` in both quoted and unquoted forms (this is a Dataverse limitation, not SDK). If `$expand` is strictly required, you can bypass the typed service and call the raw connector via `getClient(dataSourcesInfo).executeAsync({ dataverseRequest: { ... } })`, but this is undocumented and not recommended.
- **Image / file columns** — use the service methods, not `$select`: `AccountsService.downloadImage(id, 'entityimage', fullSize)`, `upload(id, columnName, file)`, `deleteFileOrImage(id, columnName)`.
- **Metadata** — `AccountsService.getMetadata({ ... })` for entity/attribute metadata, no raw `EntityDefinitions(...)` calls.

Practical rules for code apps:

1. Always `select` explicitly — omitting it returns the full record and is slow.
2. **Only select real column logical names.** Never put `<field>name` / `<lookup>name` into `select` — Dataverse rejects with `0x80060888 Could not find a property named '<x>name'`. **Important: the generated TS model declares many annotation-derived siblings as top-level properties (e.g. `statuscodename`, `primarycontactidname`, `owneridname`, and even `ownerid` / `owneridtype` for polymorphic lookups). `keyof Accounts` being valid TypeScript does NOT mean the column is selectable.** Verified rejects include: `industrycodename`, `owneridtype`, `ownerid` (on account).
3. **Read display labels from the OData annotation keys**, not from the `<field>name` TS properties. Use a `formatted(row, col)` helper.
4. **Single-target lookups**: select `_<lookup>_value` (e.g. `_primarycontactid_value`). Read:
   - name: `row['_<lookup>_value@OData.Community.Display.V1.FormattedValue']`
   - target table: `row['_<lookup>_value@Microsoft.Dynamics.CRM.lookuplogicalname']`
   - nav property: `row['_<lookup>_value@Microsoft.Dynamics.CRM.associatednavigationproperty']`
5. **Polymorphic lookups** (`ownerid`, `customerid`, `regardingobjectid`): also select `_<lookup>_value` (e.g. `_ownerid_value`). The generated TS does NOT include `_ownerid_value` in `Accounts` even though it's the real OData column — you need to pass `select` as `string[]` or cast. The `@lookuplogicalname` annotation discriminates the target (e.g. `"systemuser"` vs `"team"` for owner). Verified: selecting `ownerid` or `owneridtype` fails; selecting `_ownerid_value` succeeds and returns all three annotation siblings.
6. Money/date columns also get `@OData.Community.Display.V1.FormattedValue` keys (pre-formatted currency/date strings) — handy to skip `Intl.NumberFormat`.
7. **No `$expand` in the typed SDK.** `IGetOptions` / `IGetAllOptions` are `select`-only — there is no `expand` field. For related fields, fetch by id via the related table's service (N+1), or **chain `eq` with `or`** (e.g. `filter: "contactid eq <g1> or contactid eq <g2>"`). **Dataverse does not support `in (…)`** — verified live: both `in (g1,g2)` and `in ('g1','g2')` return `0x8006088a "The query node In is not supported"`.
8. **Write lookups use `<navproperty>@odata.bind: "/<entitySet>(<guid>)"`** inside `create` / `update` payloads (cast the payload — the generated type doesn't include the bind key). Nav property name and entity-set name both come from the **read-side annotations** (`@associatednavigationproperty` + entity-set pluralization you already see in `_<lookup>_value` patterns).
9. Don't edit `src/generated/**`. Re-run `npx power-apps add-data-source` when the schema changes.

## SDK surface beyond `$select`

### Package exports / subpath imports

`@microsoft/power-apps` (v1.1.x) has **no root entry** — the package.json `exports` map only exposes subpaths. Always import from a subpath:

| Import from | Surface |
|---|---|
| `@microsoft/power-apps/app` | `getContext`, `setConfig`, `IContext`, `IConfig` |
| `@microsoft/power-apps/data` | `getClient`, `IOperationOptions`, `IOperationResult`, `DataClient`, `serializeMultiSelectPicklistFields`, `deserializeMultiSelectPicklistFields` |
| `@microsoft/power-apps/data/executors` | `createMockDataExecutor`, `MockDataStore`, `IDataOperationExecutor` |
| `@microsoft/power-apps/data/metadata/dataverse` | `EntityMetadata`, `GetEntityMetadataOptions`, label helpers (`getAttributeTypeCodeName`, `getCascadeTypeName`, …) |
| `@microsoft/power-apps/telemetry` | `initializeLogger`, `ILogger`, metric types |

`import { app } from '@microsoft/power-apps'` **fails** with `Failed to resolve entry for package … Missing "." specifier` — verified live against Vite.

### Current user / app context — `getContext()`

Returns a **`Promise<IContext>`** — you MUST `await` it:

```ts
import { getContext } from '@microsoft/power-apps/app';

const ctx = await getContext();
// Verified shape (live):
// {
//   app:  { appId: "local" | "<guid>",  environmentId: "<guid>",
//           appSettings: {}, queryParams: { _localAppUrl: "...", ... } },
//   user: { fullName, objectId, tenantId, userPrincipalName },
//   host: { sessionId }
// }
console.log(ctx.user.userPrincipalName); // → "ranjithm@ranjithmb260.onmicrosoft.com"
```

Gotcha: calling without `await` returns a Promise; `ctx.user?.fullName` then reads `undefined` (the Promise itself has no `user` key) — a silent runtime bug, no compile error. When `appId` reads `"local"` you're in local-play mode; in published apps it's the real app GUID.

### Pagination — `maxPageSize` + `skipToken` round-trip

`IGetAllOptions` supports server-driven paging. Verified live:

```ts
const page1 = await AccountsService.getAll({
  select: ["accountid", "name"] as string[],
  orderBy: ["name asc"],
  maxPageSize: 3,
  // count: true,   // opt-in — populates IOperationResult.count
});
// page1.success === true
// page1.data.length === 3
// page1.skipToken === "<cookie pagenumber=\"2\" pagingcookie=\"...\" />"  (FetchXML cookie)
// page1.count === undefined (only populated when options.count === true)

if (page1.skipToken) {
  const page2 = await AccountsService.getAll({
    select: ["accountid", "name"] as string[],
    orderBy: ["name asc"],
    maxPageSize: 3,
    skipToken: page1.skipToken,     // ← round-trip the raw cookie
  });
  // page2.data has the next 3 rows, zero overlap with page1 — verified.
}
```

Key points:
- The `skipToken` field lives on `IOperationResult` (sibling to `data`), **not inside `data`**.
- Pass it back verbatim as the next call's `skipToken`. Do not URL-encode/decode.
- `count` (total) is only returned when you pass `count: true` in the request options.
- `top` and `skip` work too, but `maxPageSize` + `skipToken` is the supported server-side paging path; `skip` is capped at 5000 by Dataverse.

### Multi-select option sets — serialize/deserialize

Wire format is a comma-separated string (`"1,3,7"`); the typed TS model uses `number[]`. The SDK ships helpers that convert both directions:

```ts
import {
  serializeMultiSelectPicklistFields,
  deserializeMultiSelectPicklistFields,
} from '@microsoft/power-apps/data';

const MS_FIELDS = ['my_categories'] as const;

// READ: mutate the returned row in place, arrays become real arrays.
const { data } = await MyTableService.getAll({ select: ['my_categories'] });
for (const row of data!) {
  deserializeMultiSelectPicklistFields(row as Record<string, unknown>, MS_FIELDS);
}
// row.my_categories is now number[] (or [] if the column was empty string).

// WRITE: convert the array back to the wire format before create/update.
const payload = serializeMultiSelectPicklistFields(
  { my_categories: [1, 3, 7] },
  MS_FIELDS,
);
await MyTableService.create(payload as unknown as ...);
// Empty arrays become null (Dataverse rejects empty strings for this type).
```

Skip these helpers and your reads see `"1,3,7"` as a string and your writes either fail or store a literal string value.

### Filter syntax quick reference (for `IGetAllOptions.filter`)

The SDK passes the string straight into OData `$filter`. Core operators:

| Pattern | Example |
|---|---|
| Equality | `name eq 'Fabrikam'` |
| Inequality | `statecode ne 1` |
| Comparison | `revenue gt 1000 and revenue le 100000` |
| Null | `_primarycontactid_value ne null` |
| Logical | `... and ...`, `... or ...`, `not(...)` |
| Parentheses | `(a eq 1 or b eq 2) and c eq 3` |
| Lookup GUID | `_primarycontactid_value eq <guid>` — **no quotes on GUIDs** |
| String GUID column fields (`accountid`, etc.) | `accountid eq <guid>` — also no quotes |
| Multi-id lookup | `accountid eq <g1> or accountid eq <g2>` — **`in (…)` is NOT supported** (`0x8006088a`) |
| String fns | `contains(name,'oil')`, `startswith(name,'Con')`, `endswith(name,'Ltd')` |
| Date fns | `Microsoft.Dynamics.CRM.On(PropertyName='createdon',PropertyValue='2024-01-01')`, `Microsoft.Dynamics.CRM.LastXDays(PropertyName='createdon',PropertyValue=30)` |

Strings need single quotes and apostrophes are escaped by doubling: `name eq 'O''Brien'`. Dates and GUIDs go unquoted. Do **not** URL-encode the string yourself — the SDK handles it.

### Mock executor for unit tests / Storybook

Replace the live connector with an in-memory store — no Power Apps host, no Vite plugin, no network:

```ts
import { createMockDataExecutor } from '@microsoft/power-apps/data/executors';
import { setDataOperationExecutor } from '@microsoft/power-apps/internal/data';

const mock = createMockDataExecutor({
  accounts: [
    { accountid: 'g1', name: 'Fabrikam', statecode: 0, statuscode: 1 },
    { accountid: 'g2', name: 'Contoso',  statecode: 0, statuscode: 1 },
  ],
});
setDataOperationExecutor(mock);
// AccountsService.* now hits the in-memory store.
```

Useful for Jest/Vitest tests and Storybook stories of data-bound components.

### Telemetry — `initializeLogger` + `setConfig`

Route app `console.log`-level output into Power Apps telemetry so it flows through `npx power-apps telemetry`:

```ts
import { setConfig } from '@microsoft/power-apps/app';
import { initializeLogger } from '@microsoft/power-apps/telemetry';

const logger = { /* implements ILogger */ };
await initializeLogger(logger);
setConfig({ logger });
```

Both calls take the same `ILogger` shape; `setConfig` wires it for SDK-internal logs, `initializeLogger` wires it for the app surface.

### Router basename (React Router)

When hosted in Power Apps the app runs under a path like `/play/e/<envId>/a/<appId>/<hash>/` — relative-path routing **will 404** unless you compute a basename. The starter template does this in `src/router.tsx`:

```ts
const BASENAME = new URL(".", location.href).pathname;
if (location.pathname.endsWith("/index.html")) {
  history.replaceState(null, "", BASENAME + location.search + location.hash);
}
createBrowserRouter([...], { basename: BASENAME });
```

Preserve both the `BASENAME` and the `/index.html` rewrite when customizing. Same principle applies for Vue Router (`createRouter({ history: createWebHistory(BASENAME) })`) and Next.js (`basePath` in `next.config.js`, then compute at build time).

## Debugging a running code app with Chrome DevTools MCP

Use this when you need to **verify Dataverse payload shape, check runtime annotations, inspect errors, or automate the UI** while the app runs in the Power Apps host. This was how the lookup / option-set / annotation rules above were validated against a live environment.

### 1. Start Chrome with remote debugging

The app must run in a Chrome instance that exposes the DevTools protocol on a TCP port. Start **Chrome Beta** (or stable) with:

```powershell
& 'C:\Program Files\Google\Chrome Beta\Application\chrome.exe' `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\chrome-mcp-profile"
```

Use a dedicated `--user-data-dir` so the MCP session does not fight your everyday profile. Sign in to the Power Apps tenant in that window.

### 2. Wire the MCP server to the running browser

Create `.vscode/mcp.json` in the workspace so the agent auto-connects instead of launching its own browser:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest", "--autoConnect", "--channel=beta"]
    }
  }
}
```

- `--autoConnect` attaches to the first Chrome instance it finds listening on `127.0.0.1:9222`.
- `--channel=beta` / `stable` / `canary` selects which Chrome build to launch if no debuggable instance is running.
- Drop the file into `.vscode/mcp.json` (workspace) or `%APPDATA%\Code\User\mcp.json` (user). Restart the MCP host after editing.

### 3. Navigate to the running app

With the `@microsoft/power-apps-vite` plugin (starter template default), `npm run dev` alone is enough — Vite serves on **`http://localhost:5173`** and also exposes `/__vite_powerapps_plugin__/power.config.json`. The **URL to load** is the Power Apps host with the local override:

```
https://apps.powerapps.com/play/e/<envId>/a/local
  ?_localAppUrl=http://localhost:5173/
  &_localConnectionUrl=http://localhost:5173/__vite_powerapps_plugin__/power.config.json
```

(For non-Vite stacks using `npx power-apps run`, use the URL that command prints instead.) Note the port is Vite's default `5173`, **not** `3000` as shown in `init --app-url` docs.

Open the URL via `new_page` / `navigate_page`. The app loads inside an **iframe** — snapshots from the MCP automatically flatten the a11y tree so elements are addressable by `uid` without any frame selection.

### 4. Inspect Dataverse payloads at runtime

`$select` behavior is documented but the **SDK runtime shape is not** — log a row and read it back through the MCP:

```ts
// Temporarily, inside the query function:
if (result.data?.[0]) {
  const r = result.data[0] as unknown as Record<string, unknown>;
  const annotations = Object.fromEntries(
    Object.entries(r).filter(([k]) => k.includes("@")),
  );
  console.log("[accounts] annotations on first row:", annotations);
  console.log("[accounts] all keys:", Object.keys(r));
}
```

Then retrieve them via the MCP:

1. `list_console_messages({ types: ["log"] })` → find the `msgid` of the log entries.
2. `get_console_message({ msgid })` → returns the serialized `Arg #1` payload as JSON (objects/arrays are expanded, not truncated to `[object Object]` like the summary view).

This is how the polymorphic owner annotations were confirmed:

```json
"_ownerid_value": "045b7f70-9b2b-f111-88b4-000d3a31a086",
"_ownerid_value@OData.Community.Display.V1.FormattedValue":          "ranjith m",
"_ownerid_value@Microsoft.Dynamics.CRM.associatednavigationproperty": "ownerid",
"_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname":            "systemuser"
```

`evaluate_script` is an alternative for ad-hoc probes without code edits:

```ts
() => Object.keys(window.performance.getEntriesByType("resource")
  .find(r => r.name.includes("/api/data/")) ?? {})
```

### 5. Drive the UI to trigger code paths

- `take_snapshot` — gets a fresh a11y tree with `uid`s; always re-snapshot after navigation/click.
- `click({ uid })`, `fill({ uid, value })`, `fill_form([...])` — exercise routes (e.g. click "View accounts" to run `useQuery`).
- `wait_for({ text: ["Rene Valdes", "Error:"] })` — wait for data OR a known error string; avoids `setTimeout`-style polling.
- `list_network_requests({ resourceTypes: ["xhr", "fetch"] })` + `get_network_request({ reqid })` — inspect the actual OData URL the SDK built (useful to confirm `$select` encoding, annotation prefer headers, pagination tokens).

### Gotchas observed

- **Port**: the starter uses Vite's default `5173` via the `@microsoft/power-apps-vite` plugin — `npx power-apps run` is not needed and `init --app-url http://localhost:3000` is stale. Use `http://localhost:5173/` in the `_localAppUrl` / `_localConnectionUrl` query params.
- **Multiple Chrome channels**: MCP picks the *first* `127.0.0.1:9222`. If both stable and beta expose 9222, results are non-deterministic — close one or change `--channel`.
- **Console truncation**: `list_console_messages` summarises objects as `[object Object]`. Always follow up with `get_console_message({ msgid })` to get the full `Arg #N` dump.
- **Re-snapshot after re-render**: Tanstack Query re-fetches / route changes invalidate `uid`s. Call `take_snapshot` again before the next `click` / `fill`.
- **Secrets in console**: if the app logs tokens or connection strings, `get_console_message` will faithfully return them — strip or scope the diagnostic logs before running against shared profiles.

## Limitations to Flag to Users

- No Power Apps mobile / Windows host (browser only).
- No SharePoint form integration, no Power BI `PowerBIIntegration` (embedding in Power BI via the Power Apps Visual still works).
- No Power Platform Git integration.
- No Storage SAS IP restriction support yet.

## Troubleshooting / Gotchas

- **Get the current environment id and org URL** by running `pac env who` — the "Environment ID" line feeds `-e` / `--environment-id`, and "Org URL" feeds `--org-url` for `add-data-source --api-id dataverse`.
- **`add-data-source --api-id dataverse` works without a pre-created connection reference** — the CLI reads metadata straight from the org; `--connection-id`/`--connection-ref` are only needed for other connectors (SQL, SharePoint, custom APIs).
- **`init` sometimes prints `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exits with code 1** after `Created power.config.json`. This is a benign libuv shutdown issue in Node on Windows; the config file is written correctly. Verify with `Test-Path power.config.json` and move on.
- **`power.config.json` must exist before `add-data-source`** — run `init` first or the command fails.
- **Non-interactive mode is strict**: `--non-interactive` requires every needed flag (or `ENVIRONMENT_ID` env var); missing one fails immediately.
- **Regenerating services**: re-running `add-data-source` for the same table overwrites the generated service/model. Do not edit files under `src/generated/` — wrap them in your own hooks/components instead.

## References

- Overview: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview
- npm CLI quickstart: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/npm-quickstart
- CLI package: https://www.npmjs.com/package/@microsoft/power-apps-cli
- SDK package: https://www.npmjs.com/package/@microsoft/power-apps
- Samples & templates: https://github.com/microsoft/PowerAppsCodeApps
- Official plugin (Claude/Copilot): https://github.com/microsoft/power-platform-skills (`plugins/code-apps`)
