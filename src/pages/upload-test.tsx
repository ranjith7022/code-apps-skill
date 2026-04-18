import { useEffect, useRef, useState } from "react";
import { AccountsService } from "@/generated/services/AccountsService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Accounts } from "@/generated/models/AccountsModel";

type LogEntry = {
  step: string;
  status: "ok" | "err" | "info";
  detail: string;
};

type AccountRow = Accounts & Record<string, unknown>;

// 1x1 red PNG — used when ?autorun=1 is set so we don't need a file picker.
const AUTORUN_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACRXR/mAAAAKklEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAAAAAAOA1DwABQAABPo4pAAAAAElFTkSuQmCC";

function makeAutorunFile(): File {
  const bin = atob(AUTORUN_PNG_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], "autorun-upload-test.png", { type: "image/png" });
}

export default function UploadTestPage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const autoRan = useRef(false);

  const append = (entry: LogEntry) => setLog((prev) => [...prev, entry]);

  async function runUpload(overrideFile?: File) {
    const useFile = overrideFile ?? file;
    if (!useFile) {
      append({ step: "pick file", status: "err", detail: "no file selected" });
      return;
    }
    setLog([]);
    setPreviewUrl(null);
    setRunning(true);

    let newId: string | undefined;
    try {
      // 1) Create a throwaway account to attach the image to.
      const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
      const createRes = await AccountsService.create({
        name: `codeapps-upload-test-${stamp}`,
      } as Omit<Accounts, "accountid">);
      if (!createRes.success || !createRes.data) {
        append({
          step: "create throwaway account",
          status: "err",
          detail: createRes.error?.message ?? "create failed",
        });
        return;
      }
      newId = (createRes.data as AccountRow).accountid as string;
      append({
        step: "create throwaway account",
        status: "ok",
        detail: `id=${newId}, name=${createRes.data.name}`,
      });

      // 2) Upload the selected file to the entityimage column.
      append({
        step: "upload file → entityimage",
        status: "info",
        detail: `name=${useFile.name}, type=${useFile.type || "unknown"}, size=${useFile.size}B`,
      });
      const upRes = await AccountsService.upload(newId, "entityimage", useFile, useFile.name);
      append({
        step: "upload file → entityimage",
        status: upRes.success ? "ok" : "err",
        detail: upRes.success ? "upload succeeded" : (upRes.error?.message ?? "upload failed"),
      });
      if (!upRes.success) return;

      // 3) Download the image back (full-size) and render as preview.
      const dlRes = await AccountsService.downloadImage(newId, "entityimage", true);
      if (!dlRes.success || !dlRes.data) {
        append({
          step: "downloadImage (full size)",
          status: "err",
          detail: dlRes.error?.message ?? "download failed",
        });
      } else {
        const bytes = dlRes.data;
        const blob = new Blob([bytes.buffer as ArrayBuffer], {
          type: useFile.type || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        append({
          step: "downloadImage (full size)",
          status: "ok",
          detail: `received ${bytes.byteLength}B (original ${useFile.size}B)`,
        });
      }

      // 4) Read back the record and inspect the image-related columns.
      const readBack = await AccountsService.get(newId, {
        select: [
          "accountid",
          "name",
          "entityimage_url",
          "entityimageid",
          "entityimage_timestamp",
        ] as string[],
      });
      if (readBack.success && readBack.data) {
        const rb = readBack.data as AccountRow;
        append({
          step: "read-back image metadata",
          status: "ok",
          detail: `entityimageid=${String(rb.entityimageid ?? "—")}; entityimage_url=${String(
            rb.entityimage_url ?? "—",
          )}; timestamp=${String(rb.entityimage_timestamp ?? "—")}`,
        });
      } else {
        append({
          step: "read-back image metadata",
          status: "err",
          detail: readBack.error?.message ?? "failed",
        });
      }

      // 5) Delete the file/image from the record (tests deleteFileOrImage).
      const delImg = await AccountsService.deleteFileOrImage(newId, "entityimage");
      append({
        step: "deleteFileOrImage",
        status: delImg.success ? "ok" : "err",
        detail: delImg.success ? "cleared entityimage" : (delImg.error?.message ?? "failed"),
      });
    } catch (e) {
      append({
        step: "unexpected error",
        status: "err",
        detail: (e as Error).message,
      });
    } finally {
      // 6) Cleanup the throwaway account.
      if (newId) {
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
      }
      setRunning(false);
    }
  }

  // Autorun hook — visit `/upload-test?autorun=1` (or set #autorun) to run
  // the full scenario on mount without any clicks. Useful when driving
  // the page from MCP where the outer Power Apps frame is cross-origin
  // and we can't programmatically click inside the iframe.
  useEffect(() => {
    if (autoRan.current) return;
    const params = new URLSearchParams(window.location.search);
    const wantAutorun = params.get("autorun") === "1" || window.location.hash === "#autorun";
    if (!wantAutorun) return;
    autoRan.current = true;
    const f = makeAutorunFile();
    setFile(f);
    void runUpload(f);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Upload / Image test</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Upload, download, and delete entity images via <code>AccountsService</code>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AccountsService.upload → entityimage</CardTitle>
          <CardDescription>
            Creates a throwaway account, uploads the selected file to its <code>entityimage</code>{" "}
            column, downloads it back, then cleans up. Append <code>?autorun=1</code> to run without
            clicking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="file">Image file</Label>
            <Input
              id="file"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                setPreviewUrl(null);
              }}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Selected: {file.name} ({file.size}B, {file.type || "unknown"})
              </p>
            )}
          </div>

          <Button onClick={() => runUpload()} disabled={running || !file}>
            {running ? "Running…" : "Run upload scenario"}
          </Button>
        </CardContent>
      </Card>

      {previewUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Downloaded preview</CardTitle>
            <CardDescription>
              Rendered from the bytes returned by <code>downloadImage</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <img
              src={previewUrl}
              alt="downloaded entityimage"
              className="max-h-96 rounded border"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pick an image and click Run.</p>
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
