import { useState } from "react";
import { getContext } from "@microsoft/power-apps/app";
import { AccountsService } from "@/generated/services/AccountsService";
import { ContactsService } from "@/generated/services/ContactsService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Accounts } from "@/generated/models/AccountsModel";
import type { Contacts } from "@/generated/models/ContactsModel";

type LogEntry = {
  step: string;
  status: "ok" | "err" | "info";
  detail: string;
};

// Narrowed helper types for the two patterns we want to prove out.
type AccountRow = Accounts & Record<string, unknown>;
type ContactRow = Contacts & Record<string, unknown>;

// Cast helper for @odata.bind — generated type doesn't include the key.
type AccountCreatePayload = Record<string, unknown>;

export default function WriteTestPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const append = (entry: LogEntry) => setLog((prev) => [...prev, entry]);

  async function runScenarios() {
    setLog([]);
    setRunning(true);
    try {
      // ------------------------------------------------------------------
      // 1) READ: pull one account + its lookup GUID to use below.
      // ------------------------------------------------------------------
      const listRes = await AccountsService.getAll({
        select: ["accountid", "name", "_primarycontactid_value"] as string[],
        filter: "statecode eq 0 and _primarycontactid_value ne null",
        top: 1,
      });
      if (!listRes.success || !listRes.data?.length) {
        append({
          step: "load seed account",
          status: "err",
          detail: listRes.error?.message ?? "no account with primarycontactid found",
        });
        return;
      }
      const seed = listRes.data[0] as AccountRow;
      const seedAccountId = seed.accountid as string;
      const contactId = seed._primarycontactid_value as string;
      const contactName =
        (seed["_primarycontactid_value@OData.Community.Display.V1.FormattedValue"] as
          | string
          | undefined) ?? "(unknown)";
      append({
        step: "load seed account",
        status: "ok",
        detail: `account="${seed.name}" (id=${seedAccountId}), primary contact="${contactName}" (id=${contactId})`,
      });

      // ------------------------------------------------------------------
      // 2) $expand emulation via N+1 — SDK has NO `expand` option on
      //    IGetOptions / IGetAllOptions; we fetch the related row by id
      //    from its own typed service.
      // ------------------------------------------------------------------
      const contactRes = await ContactsService.get(contactId, {
        select: [
          "contactid",
          "fullname",
          "emailaddress1",
          "jobtitle",
          "_parentcustomerid_value",
        ] as string[],
      });
      if (!contactRes.success || !contactRes.data) {
        append({
          step: "expand (N+1) primarycontactid → contact",
          status: "err",
          detail: contactRes.error?.message ?? "failed",
        });
      } else {
        const c = contactRes.data as ContactRow;
        append({
          step: "expand (N+1) primarycontactid → contact",
          status: "ok",
          detail: `fullname="${c.fullname ?? ""}" email="${
            c.emailaddress1 ?? ""
          }" title="${c.jobtitle ?? ""}"`,
        });
        // oxlint-disable-next-line no-console
        console.log("[write-test] contact annotations:", c);
      }

      // ------------------------------------------------------------------
      // 3) WRITE with @odata.bind — create a throwaway account and
      //    attach the primary contact via the nav property.
      //
      //    The binding key is the *navigation property* name (from the
      //    '@Microsoft.Dynamics.CRM.associatednavigationproperty'
      //    annotation we captured earlier: "primarycontactid").
      //    Target collection is the entity *set* name ("contacts", plural).
      // ------------------------------------------------------------------
      const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
      const payload: AccountCreatePayload = {
        name: `codeapps-mcp-test-${stamp}`,
        "primarycontactid@odata.bind": `/contacts(${contactId})`,
      };
      // oxlint-disable-next-line no-console
      console.log("[write-test] create payload:", payload);

      const createRes = await AccountsService.create(
        payload as unknown as Parameters<typeof AccountsService.create>[0],
      );
      if (!createRes.success || !createRes.data) {
        append({
          step: "create account with @odata.bind",
          status: "err",
          detail: createRes.error?.message ?? "create failed",
        });
        return;
      }
      const created = createRes.data as AccountRow;
      const newId = created.accountid as string;
      const boundContact =
        (created["_primarycontactid_value@OData.Community.Display.V1.FormattedValue"] as
          | string
          | undefined) ?? "(missing annotation)";
      append({
        step: "create account with @odata.bind",
        status: "ok",
        detail: `created id=${newId}; response reports primarycontactid="${boundContact}" (value=${String(
          created._primarycontactid_value,
        )})`,
      });
      // oxlint-disable-next-line no-console
      console.log("[write-test] created account full payload:", created);

      // ------------------------------------------------------------------
      // 4) Read back to confirm the bind actually persisted server-side.
      // ------------------------------------------------------------------
      const readBackRes = await AccountsService.get(newId, {
        select: ["accountid", "name", "_primarycontactid_value"] as string[],
      });
      if (!readBackRes.success || !readBackRes.data) {
        append({
          step: "read-back created account",
          status: "err",
          detail: readBackRes.error?.message ?? "read-back failed",
        });
      } else {
        const rb = readBackRes.data as AccountRow;
        const rbContactName =
          (rb["_primarycontactid_value@OData.Community.Display.V1.FormattedValue"] as
            | string
            | undefined) ?? "(missing)";
        const ok = rb._primarycontactid_value === contactId;
        append({
          step: "read-back created account",
          status: ok ? "ok" : "err",
          detail: `persisted _primarycontactid_value=${String(
            rb._primarycontactid_value,
          )} (expected ${contactId}); formatted="${rbContactName}"`,
        });
      }

      // ------------------------------------------------------------------
      // 5) UPDATE with @odata.bind — clear and re-set via navigation prop.
      //    (Here we just re-bind to the same contact; the point is syntax.)
      // ------------------------------------------------------------------
      const updRes = await AccountsService.update(newId, {
        "primarycontactid@odata.bind": `/contacts(${contactId})`,
      } as unknown as Parameters<typeof AccountsService.update>[1]);
      append({
        step: "update account with @odata.bind",
        status: updRes.success ? "ok" : "err",
        detail: updRes.success
          ? `re-bound primarycontactid OK`
          : (updRes.error?.message ?? "update failed"),
      });

      // ------------------------------------------------------------------
      // 6) DELETE the throwaway — keep the env clean.
      // ------------------------------------------------------------------
      try {
        await AccountsService.delete(newId);
        append({
          step: "delete throwaway account",
          status: "ok",
          detail: `deleted id=${newId}`,
        });
      } catch (e) {
        append({
          step: "delete throwaway account",
          status: "err",
          detail: (e as Error).message,
        });
      }

      // ------------------------------------------------------------------
      // 7) app.getContext() — current user, app, host info.
      //    IMPORTANT: getContext() returns a Promise<IContext> — must await.
      // ------------------------------------------------------------------
      try {
        const ctx = await getContext();
        // oxlint-disable-next-line no-console
        console.log("[write-test] app.getContext():", ctx);
        append({
          step: "app.getContext()",
          status: "ok",
          detail: `user=${ctx.user?.fullName ?? "?"} (${
            ctx.user?.userPrincipalName ?? "?"
          }); envId=${ctx.app?.environmentId ?? "?"}; appId=${
            ctx.app?.appId ?? "?"
          }; sessionId=${ctx.host?.sessionId ?? "?"}`,
        });
      } catch (e) {
        append({
          step: "app.getContext()",
          status: "err",
          detail: (e as Error).message,
        });
      }

      // ------------------------------------------------------------------
      // 8) Filter syntax — does bare `in (guid,guid)` work or do we need
      //    `or` chaining? Also try quoted-guid form to confirm rejection.
      // ------------------------------------------------------------------
      const id1 = seedAccountId;
      // pick a 2nd id for the batch
      const twoRes = await AccountsService.getAll({
        select: ["accountid"] as string[],
        filter: `statecode eq 0 and accountid ne ${id1}`,
        top: 1,
      });
      const id2 = (twoRes.data?.[0] as AccountRow | undefined)?.accountid as string | undefined;
      if (!id2) {
        append({
          step: "filter: find 2nd account for batch test",
          status: "err",
          detail: "only one active account in the org",
        });
      } else {
        // 8a) bare `in` with unquoted GUIDs (our claim)
        const bareIn = await AccountsService.getAll({
          select: ["accountid", "name"] as string[],
          filter: `accountid in (${id1},${id2})`,
        });
        append({
          step: "filter: accountid in (bareGuid,bareGuid)",
          status: bareIn.success ? "ok" : "err",
          detail: bareIn.success
            ? `returned ${bareIn.data?.length ?? 0} rows`
            : (bareIn.error?.message ?? "failed"),
        });

        // 8b) quoted GUIDs — expected to fail per our claim
        const quotedIn = await AccountsService.getAll({
          select: ["accountid", "name"] as string[],
          filter: `accountid in ('${id1}','${id2}')`,
        });
        append({
          step: "filter: accountid in ('g1','g2') [expected to fail]",
          status: quotedIn.success ? "ok" : "err",
          detail: quotedIn.success
            ? `returned ${quotedIn.data?.length ?? 0} rows`
            : (quotedIn.error?.message ?? "failed"),
        });

        // 8c) `or` chain — the safe fallback
        const orChain = await AccountsService.getAll({
          select: ["accountid", "name"] as string[],
          filter: `accountid eq ${id1} or accountid eq ${id2}`,
        });
        append({
          step: "filter: eq OR eq (fallback)",
          status: orChain.success ? "ok" : "err",
          detail: orChain.success
            ? `returned ${orChain.data?.length ?? 0} rows`
            : (orChain.error?.message ?? "failed"),
        });
      }

      // ------------------------------------------------------------------
      // 9) Pagination — maxPageSize + skipToken round-trip, plus count.
      // ------------------------------------------------------------------
      const p1 = await AccountsService.getAll({
        select: ["accountid", "name"] as string[],
        filter: "statecode eq 0",
        orderBy: ["name asc"],
        maxPageSize: 3,
      });
      // oxlint-disable-next-line no-console
      console.log("[write-test] page1 result:", p1);
      append({
        step: "pagination: page 1 (maxPageSize=3)",
        status: p1.success ? "ok" : "err",
        detail: p1.success
          ? `rows=${p1.data?.length ?? 0}; skipToken=${
              p1.skipToken ? "present" : "none"
            }; count=${p1.count ?? "n/a"}`
          : (p1.error?.message ?? "failed"),
      });

      if (p1.success && p1.skipToken) {
        const p2 = await AccountsService.getAll({
          select: ["accountid", "name"] as string[],
          filter: "statecode eq 0",
          orderBy: ["name asc"],
          maxPageSize: 3,
          skipToken: p1.skipToken,
        });
        // oxlint-disable-next-line no-console
        console.log("[write-test] page2 result:", p2);
        const p1Ids = new Set((p1.data ?? []).map((r) => (r as AccountRow).accountid as string));
        const overlap = (p2.data ?? []).filter((r) =>
          p1Ids.has((r as AccountRow).accountid as string),
        ).length;
        append({
          step: "pagination: page 2 via skipToken",
          status: p2.success ? "ok" : "err",
          detail: p2.success
            ? `rows=${p2.data?.length ?? 0}; overlap with page1=${overlap}`
            : (p2.error?.message ?? "failed"),
        });
      }
    } catch (e) {
      append({
        step: "unhandled",
        status: "err",
        detail: (e as Error).message,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Write &amp; expand test</h1>
          <p className="text-muted-foreground text-[13px] mt-0.5">
            Exercises <code>@odata.bind</code> on <code>create</code>/<code>update</code> and the
            N+1 workaround for <code>$expand</code>.
          </p>
        </div>
        <Button onClick={runScenarios} disabled={running} size="sm">
          {running ? "Running…" : "Run scenarios"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Result log</CardTitle>
          <CardDescription>
            Steps execute sequentially. Any error stops only the current branch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-muted-foreground text-sm">No run yet. Press "Run scenarios".</p>
          ) : (
            <ol className="space-y-3">
              {log.map((entry, i) => (
                <li key={i} className="flex items-start gap-3 rounded-md border p-3">
                  <Badge
                    variant={
                      entry.status === "ok"
                        ? "default"
                        : entry.status === "err"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {entry.status.toUpperCase()}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{entry.step}</div>
                    <div className="text-muted-foreground break-all text-xs">{entry.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
