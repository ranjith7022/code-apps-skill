import { useEffect, useRef, useState } from "react";
import { getClient } from "@microsoft/power-apps/data";
import { AccountsService } from "@/generated/services/AccountsService";
import { dataSourcesInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Accounts } from "@/generated/models/AccountsModel";

type LogEntry = {
  step: string;
  status: "ok" | "err" | "info";
  detail: string;
};

type AccountRow = Accounts & Record<string, unknown>;

// 1x1 red PNG
const AUTORUN_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACRXR/mAAAAKklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAOA1DwABQAABPo4pAAAAAElFTkSuQmCC";

function makePng(): File {
  const bin = atob(AUTORUN_PNG_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], "experiment.png", { type: "image/png" });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ExperimentsPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const autoRan = useRef(false);

  const append = (entry: LogEntry) =>
    setLog((prev) => {
      // oxlint-disable-next-line no-console
      console.log(`[experiments] ${entry.status.toUpperCase()} ${entry.step} — ${entry.detail}`);
      return [...prev, entry];
    });

  async function runAll() {
    setLog([]);
    setRunning(true);
    const toCleanup: string[] = [];
    try {
      // ------------------------------------------------------------------
      // Seed: find an active account with a primary contact for lookup tests
      // ------------------------------------------------------------------
      const seedRes = await AccountsService.getAll({
        select: ["accountid", "name", "_primarycontactid_value"] as string[],
        filter: "statecode eq 0 and _primarycontactid_value ne null",
        top: 1,
      });
      if (!seedRes.success || !seedRes.data?.length) {
        append({
          step: "seed lookup account",
          status: "err",
          detail: seedRes.error?.message ?? "no seed available",
        });
        return;
      }
      const seed = seedRes.data[0] as AccountRow;
      const contactId = seed._primarycontactid_value as string;
      append({
        step: "seed lookup account",
        status: "ok",
        detail: `seed acc=${seed.name}, contactId=${contactId}`,
      });

      // ------------------------------------------------------------------
      // EXPERIMENT A (FUTURE #8): upload + delayed downloadImage retry
      // ------------------------------------------------------------------
      const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
      const createRes = await AccountsService.create({
        name: `exp-img-${stamp}`,
      } as Omit<Accounts, "accountid">);
      if (!createRes.success || !createRes.data) {
        append({ step: "A/create", status: "err", detail: createRes.error?.message ?? "fail" });
        return;
      }
      const imgId = (createRes.data as AccountRow).accountid as string;
      toCleanup.push(imgId);

      const upRes = await AccountsService.upload(imgId, "entityimage", makePng(), "experiment.png");
      append({
        step: "A/upload entityimage",
        status: upRes.success ? "ok" : "err",
        detail: upRes.success ? "PATCH 204" : (upRes.error?.message ?? "fail"),
      });

      // Retry downloadImage up to ~5 seconds to see when bytes become available
      let got: Uint8Array | undefined;
      let attempts = 0;
      const started = Date.now();
      while (attempts < 10) {
        attempts++;
        const r = await AccountsService.downloadImage(imgId, "entityimage", true);
        if (r.success && r.data && r.data.byteLength > 0) {
          got = r.data;
          break;
        }
        await sleep(500);
      }
      append({
        step: "A/downloadImage retry",
        status: got ? "ok" : "err",
        detail: got
          ? `got ${got.byteLength}B after ${attempts} attempt(s), ~${Date.now() - started}ms; type=${got.constructor?.name}`
          : `still empty after ${attempts} attempts / ~${Date.now() - started}ms`,
      });

      // Payload shape check — confirm Uint8Array (not base64 string)
      if (got) {
        const firstBytes = Array.from(got.slice(0, 8))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        append({
          step: "A/downloadImage shape",
          status: "ok",
          detail: `instanceof Uint8Array=${got instanceof Uint8Array}; first 8 bytes=${firstBytes} (PNG magic 89 50 4e 47 …)`,
        });
      }

      // ------------------------------------------------------------------
      // EXPERIMENT B (FUTURE #7): clear a lookup via
      //   "primarycontactid@odata.bind": null   vs.   removing the bind
      // ------------------------------------------------------------------
      // create a throwaway account with primarycontactid bound, then try to null it.
      const bRes = await AccountsService.create({
        name: `exp-bind-${stamp}`,
        "primarycontactid@odata.bind": `/contacts(${contactId})`,
      } as unknown as Omit<Accounts, "accountid">);
      if (!bRes.success || !bRes.data) {
        append({ step: "B/create bound", status: "err", detail: bRes.error?.message ?? "fail" });
      } else {
        const bId = (bRes.data as AccountRow).accountid as string;
        toCleanup.push(bId);
        append({
          step: "B/create bound",
          status: "ok",
          detail: `id=${bId} bound primarycontactid=${String((bRes.data as AccountRow)._primarycontactid_value)}`,
        });

        // Try to clear via null @odata.bind
        const clearNull = await AccountsService.update(bId, {
          "primarycontactid@odata.bind": null,
        } as unknown as Partial<Omit<Accounts, "accountid">>);
        append({
          step: "B/update @odata.bind=null",
          status: clearNull.success ? "ok" : "err",
          detail: clearNull.success ? "accepted" : (clearNull.error?.message ?? "fail"),
        });

        // Read-back and see if it actually cleared
        const rb1 = await AccountsService.get(bId, {
          select: ["accountid", "_primarycontactid_value"] as string[],
        });
        append({
          step: "B/read-back after null bind",
          status: rb1.success ? "ok" : "err",
          detail: rb1.success
            ? `_primarycontactid_value=${String((rb1.data as AccountRow)._primarycontactid_value ?? "null")}`
            : (rb1.error?.message ?? "fail"),
        });

        // Try alt form: property name without @odata.bind
        const clearAlt = await AccountsService.update(bId, {
          _primarycontactid_value: null,
        } as unknown as Partial<Omit<Accounts, "accountid">>);
        append({
          step: "B/update _primarycontactid_value=null",
          status: clearAlt.success ? "ok" : "err",
          detail: clearAlt.success ? "accepted" : (clearAlt.error?.message ?? "fail"),
        });
      }

      // ------------------------------------------------------------------
      // EXPERIMENT C (FUTURE #11): filter operator syntax
      // ------------------------------------------------------------------
      const opTests: { label: string; filter: string }[] = [
        { label: "contains(name,'a')", filter: "contains(name,'a')" },
        { label: "startswith(name,'a')", filter: "startswith(name,'a')" },
        { label: "endswith(name,'s')", filter: "endswith(name,'s')" },
        // case-sensitivity probe
        { label: "contains(name,'A') [upper]", filter: "contains(name,'A')" },
      ];
      for (const t of opTests) {
        const r = await AccountsService.getAll({
          select: ["accountid", "name"] as string[],
          filter: `statecode eq 0 and ${t.filter}`,
          top: 3,
        });
        append({
          step: `C/filter ${t.label}`,
          status: r.success ? "ok" : "err",
          detail: r.success
            ? `rows=${r.data?.length ?? 0}; first=${(r.data?.[0] as AccountRow | undefined)?.name ?? "—"}`
            : (r.error?.message ?? "fail"),
        });
      }

      // ------------------------------------------------------------------
      // EXPERIMENT D (FUTURE #10): AccountsService.getMetadata shape
      // ------------------------------------------------------------------
      const meta = await AccountsService.getMetadata({});
      if (meta.success && meta.data) {
        const keys = Object.keys(meta.data as Record<string, unknown>);
        // oxlint-disable-next-line no-console
        console.log("[experiments] getMetadata() payload:", meta.data);
        append({
          step: "D/getMetadata({})",
          status: "ok",
          detail: `top-level keys (${keys.length}): ${keys.slice(0, 20).join(", ")}${keys.length > 20 ? ", …" : ""}`,
        });
      } else {
        append({
          step: "D/getMetadata({})",
          status: "err",
          detail: meta.error?.message ?? "fail",
        });
      }

      // ------------------------------------------------------------------
      // EXPERIMENT E (FUTURE #6): $expand via raw executeAsync escape hatch
      // ------------------------------------------------------------------
      try {
        const client = getClient(dataSourcesInfo) as unknown as {
          executeAsync: (req: unknown) => Promise<{
            success: boolean;
            data?: unknown;
            error?: { message?: string };
          }>;
        };
        const raw = await client.executeAsync({
          dataverseRequest: {
            action: "retrieveMultipleRecords",
            parameters: {
              tableName: "accounts",
              options: {
                select: ["accountid", "name"],
                filter: "statecode eq 0 and _primarycontactid_value ne null",
                top: 1,
                expand: [
                  {
                    property: "primarycontactid",
                    select: ["contactid", "fullname", "emailaddress1"],
                  },
                ],
              },
            },
          },
        });
        if (raw.success && raw.data) {
          const data = raw.data as { value?: unknown[] } | unknown[];
          const first = Array.isArray(data)
            ? (data[0] as Record<string, unknown>)
            : ((data as { value?: unknown[] }).value?.[0] as Record<string, unknown> | undefined);
          // oxlint-disable-next-line no-console
          console.log("[experiments] raw $expand response first row:", first);
          const exp = first?.primarycontactid as Record<string, unknown> | undefined;
          append({
            step: "E/raw executeAsync $expand",
            status: "ok",
            detail: exp
              ? `primarycontactid inlined: fullname=${String(exp.fullname ?? "—")}, email=${String(exp.emailaddress1 ?? "—")}`
              : `success but no primarycontactid inlined on row (keys=${first ? Object.keys(first).slice(0, 10).join(",") : "none"})`,
          });
        } else {
          append({
            step: "E/raw executeAsync $expand",
            status: "err",
            detail: raw.error?.message ?? "no data",
          });
        }
      } catch (e) {
        append({
          step: "E/raw executeAsync $expand",
          status: "err",
          detail: (e as Error).message,
        });
      }
    } catch (e) {
      append({ step: "unexpected", status: "err", detail: (e as Error).message });
    } finally {
      // Cleanup throwaways
      for (const id of toCleanup) {
        try {
          await AccountsService.delete(id);
          append({ step: "cleanup delete", status: "ok", detail: id });
        } catch (e) {
          append({
            step: "cleanup delete",
            status: "err",
            detail: `${id}: ${(e as Error).message}`,
          });
        }
      }
      setRunning(false);
    }
  }

  useEffect(() => {
    if (autoRan.current) return;
    const params = new URLSearchParams(window.location.search);
    const wantAutorun = params.get("autorun") === "1" || window.location.hash === "#autorun";
    if (!wantAutorun) return;
    autoRan.current = true;
    void runAll();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Experiments</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Batched SDK experiments against live Dataverse — FUTURE.md scenarios.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Batched SDK experiments</CardTitle>
          <CardDescription>
            Runs a batch of unvalidated behaviors against live Dataverse (downloadImage retry +
            shape, clearing lookups, filter operators, getMetadata output, $expand via raw
            executeAsync). Append <code>?autorun=1</code> to run on load.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runAll} disabled={running}>
            {running ? "Running…" : "Run experiments"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          ) : (
            <ol className="space-y-2">
              {log.map((entry, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge
                    variant={
                      entry.status === "ok"
                        ? "default"
                        : entry.status === "err"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {entry.status}
                  </Badge>
                  <div>
                    <div className="font-medium">{entry.step}</div>
                    <div className="text-muted-foreground break-all">{entry.detail}</div>
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
