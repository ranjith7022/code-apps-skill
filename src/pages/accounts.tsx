import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { AccountsService } from "@/generated/services/AccountsService";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Fields requested from Dataverse via the typed SDK.
// IMPORTANT: only real column logical names. `_primarycontactid_value` is a
// real column; `<field>name` / `<lookup>name` are NOT — they live in the
// OData annotation keys below.
// NOTE ON `ownerid` / `owneridtype`: the generated model declares these as
// top-level fields, but Dataverse rejects them in `$select` ("Could not find
// a property named 'owneridtype'") because they are annotation-derived, not
// real columns. The real raw column is `_ownerid_value` (not in the TS type
// for polymorphic lookups) — we cast to bypass the type check.
const SELECT: string[] = [
  "accountid",
  "name",
  "accountnumber",
  "revenue",
  "telephone1",
  "emailaddress1",
  "industrycode",
  "statuscode",
  "_primarycontactid_value",
  "_ownerid_value",
];

const FV = "@OData.Community.Display.V1.FormattedValue";
function formatted<T extends object>(row: T, column: string): string | undefined {
  const key = `${column}${FV}` as keyof T;
  const v = row[key] as unknown;
  return typeof v === "string" ? v : undefined;
}

function rawProp<T extends object>(row: T, key: string): string | undefined {
  const v = (row as unknown as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

export default function AccountsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["accounts", "list"],
    queryFn: async () => {
      const result = await AccountsService.getAll({
        select: SELECT,
        filter: "statecode eq 0",
        orderBy: ["name asc"],
        top: 50,
      });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to load accounts");
      }
      return result.data ?? [];
    },
  });

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 border-b border-border/40 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Accounts</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {isLoading
                ? "Loading…"
                : `${data?.length ?? 0} active account${data?.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              refetch();
              toast.info("Refreshing accounts…");
            }}
            disabled={isFetching}
          >
            <RefreshCw className={cn("size-3.5 mr-1.5", isFetching && "animate-spin")} />
            {isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {isError ? (
          <div className="p-6 text-sm text-destructive">Error: {(error as Error).message}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Name
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Primary contact
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Owner
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Industry
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Status
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8 text-right">
                  Revenue
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Email
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                  Phone
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j} className="py-2.5">
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : (data ?? []).map((a) => {
                    const primaryContact = formatted(a, "_primarycontactid_value");
                    const ownerName = formatted(a, "_ownerid_value") ?? rawProp(a, "owneridname");
                    const ownerType =
                      rawProp(a, "_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname") ??
                      rawProp(a, "owneridtype");
                    const industry = formatted(a, "industrycode");
                    const status = formatted(a, "statuscode");
                    const revenueDisplay =
                      formatted(a, "revenue") ??
                      (typeof a.revenue === "number"
                        ? a.revenue.toLocaleString(undefined, {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 0,
                          })
                        : undefined);
                    return (
                      <TableRow key={a.accountid}>
                        <TableCell className="py-2.5 text-[13px] font-medium">
                          {a.name ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-[13px]">
                          {primaryContact ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-[13px]">
                          {ownerName ?? "—"}
                          {ownerType && (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              ({ownerType})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-[13px]">{industry ?? "—"}</TableCell>
                        <TableCell className="py-2.5">
                          {status ? (
                            <Badge
                              variant={status === "Active" ? "default" : "secondary"}
                              className="text-[11px] font-normal"
                            >
                              {status}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right tabular-nums text-[13px]">
                          {revenueDisplay ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5 truncate max-w-[180px] text-[13px]">
                          {a.emailaddress1 ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-[13px]">{a.telephone1 ?? "—"}</TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Button asChild size="sm" variant="ghost" className="text-[12px] h-7">
                            <Link to={`/accounts/${a.accountid}/edit`}>Edit</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-8 text-[13px]"
                  >
                    No accounts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
