import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Search, Pencil, ArrowRight } from "lucide-react";

import type { Accounts } from "@/generated/models/AccountsModel";
import type { Contacts } from "@/generated/models/ContactsModel";
import { AccountsService } from "@/generated/services/AccountsService";
import { ContactsService } from "@/generated/services/ContactsService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ACCOUNT_LIMIT = 50;
const REVENUE_TARGET = 1_000_000;

const ACCOUNT_SELECT: string[] = [
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

const CONTACT_SELECT: string[] = [
  "contactid",
  "fullname",
  "emailaddress1",
  "jobtitle",
  "mobilephone",
];

const FV = "@OData.Community.Display.V1.FormattedValue";

type AccountRow = Accounts & Record<string, unknown>;
type ContactRow = Contacts & Record<string, unknown>;

function formatted<T extends object>(row: T, column: string): string | undefined {
  const value = row[`${column}${FV}` as keyof T] as unknown;
  return typeof value === "string" ? value : undefined;
}

function rawText<T extends object>(row: T, key: string): string | undefined {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function FluentSamplePage() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>();

  const accountsQuery = useQuery({
    queryKey: ["fluent-sample", "accounts"],
    queryFn: async () => {
      const result = await AccountsService.getAll({
        select: ACCOUNT_SELECT,
        filter: "statecode eq 0",
        orderBy: ["name asc"],
        top: ACCOUNT_LIMIT,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to load accounts");
      }

      return (result.data ?? []) as AccountRow[];
    },
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const filteredAccounts = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return accounts;
    }

    return accounts.filter((account) => {
      const haystack = [
        account.name,
        formatted(account, "industrycode"),
        formatted(account, "_primarycontactid_value"),
        formatted(account, "_ownerid_value"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [accounts, searchText]);

  useEffect(() => {
    if (!selectedAccountId && filteredAccounts[0]?.accountid) {
      setSelectedAccountId(filteredAccounts[0].accountid);
      return;
    }

    if (
      selectedAccountId &&
      filteredAccounts.length > 0 &&
      !filteredAccounts.some((account) => account.accountid === selectedAccountId)
    ) {
      setSelectedAccountId(filteredAccounts[0]?.accountid);
    }
  }, [filteredAccounts, selectedAccountId]);

  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) {
      return filteredAccounts[0];
    }

    return (
      filteredAccounts.find((account) => account.accountid === selectedAccountId) ??
      accounts.find((account) => account.accountid === selectedAccountId)
    );
  }, [accounts, filteredAccounts, selectedAccountId]);

  const primaryContactId = selectedAccount
    ? rawText(selectedAccount, "_primarycontactid_value")
    : undefined;

  const contactQuery = useQuery({
    enabled: Boolean(primaryContactId),
    queryKey: ["fluent-sample", "contact", primaryContactId],
    queryFn: async () => {
      const result = await ContactsService.get(primaryContactId!, {
        select: CONTACT_SELECT,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? "Failed to load contact");
      }

      return result.data as ContactRow | undefined;
    },
  });

  const totalRevenue = accounts.reduce(
    (sum, account) => sum + (typeof account.revenue === "number" ? account.revenue : 0),
    0,
  );

  const withPrimaryContact = accounts.filter((account) =>
    rawText(account, "_primarycontactid_value"),
  ).length;

  const detailFacts = selectedAccount
    ? [
        {
          label: "Owner",
          value: formatted(selectedAccount, "_ownerid_value") ?? "Unassigned",
        },
        {
          label: "Industry",
          value: formatted(selectedAccount, "industrycode") ?? "Unspecified",
        },
        {
          label: "Revenue",
          value:
            formatted(selectedAccount, "revenue") ??
            (typeof selectedAccount.revenue === "number"
              ? formatCurrency(selectedAccount.revenue)
              : "—"),
        },
        {
          label: "Email",
          value: selectedAccount.emailaddress1 ?? "—",
        },
        {
          label: "Phone",
          value: selectedAccount.telephone1 ?? "—",
        },
      ]
    : [];

  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 border-b border-border/40 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Account workspace</h1>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void accountsQuery.refetch()}
            disabled={accountsQuery.isFetching}
          >
            <RefreshCw
              className={cn("size-3.5 mr-1.5", accountsQuery.isFetching && "animate-spin")}
            />
            {accountsQuery.isFetching ? "Refreshing" : "Refresh"}
          </Button>
        </div>

        <div className="flex items-center gap-6 mt-3 text-sm">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums leading-none">{accounts.length}</span>
            <span className="text-muted-foreground">accounts</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums leading-none">
              {withPrimaryContact}
            </span>
            <span className="text-muted-foreground">with contact</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums leading-none">
              {formatCurrency(totalRevenue)}
            </span>
            <span className="text-muted-foreground">
              of {formatCurrency(REVENUE_TARGET)} target
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 border-r border-border/40">
          <div className="px-4 py-2.5 border-b border-border/40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, industry, or owner..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 h-8 text-[13px] bg-transparent border-none shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {accountsQuery.isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : accountsQuery.isError ? (
              <div className="p-6 text-sm text-destructive">
                {(accountsQuery.error as Error).message}
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No accounts match the current filter.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                      Account
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                      Industry
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                      Status
                    </TableHead>
                    <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 h-8">
                      Primary contact
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow
                      key={account.accountid}
                      className={cn(
                        "cursor-pointer transition-colors",
                        account.accountid === selectedAccount?.accountid
                          ? "bg-accent"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => setSelectedAccountId(account.accountid)}
                    >
                      <TableCell className="py-2.5">
                        <div className="text-[13px] font-medium leading-tight">{account.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {account.accountnumber ?? "No account number"}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px]">
                        {formatted(account, "industrycode") ?? "—"}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0">
                          {formatted(account, "statuscode") ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px]">
                        {formatted(account, "_primarycontactid_value") ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <aside className="w-[340px] shrink-0 overflow-y-auto">
          {!selectedAccount ? (
            <div className="p-6 text-sm text-muted-foreground">
              Select an account to view details.
            </div>
          ) : (
            <div className="p-5 space-y-5">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-1">
                  Selected account
                </div>
                <h2 className="text-xl font-bold tracking-tight leading-tight">
                  {selectedAccount.name}
                </h2>
              </div>

              <div className="space-y-3">
                {detailFacts.map((item) => (
                  <div key={item.label}>
                    <div className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                      {item.label}
                    </div>
                    <div className="text-[13px] mt-0.5 break-words">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="text-[13px]"
                  onClick={() => navigate(`/accounts/${selectedAccount.accountid}/edit`)}
                >
                  <Pencil className="size-3.5 mr-1.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[13px] text-muted-foreground"
                  onClick={() => navigate("/accounts")}
                >
                  All accounts
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Button>
              </div>

              <div className="border-t border-border/40 pt-4">
                <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-3">
                  Primary contact
                </div>
                {!primaryContactId ? (
                  <div className="text-[13px] text-muted-foreground">
                    No primary contact assigned.
                  </div>
                ) : contactQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : contactQuery.isError ? (
                  <div className="text-[13px] text-destructive">
                    {(contactQuery.error as Error).message}
                  </div>
                ) : contactQuery.data ? (
                  <div className="space-y-2.5">
                    {[
                      { label: "Name", value: contactQuery.data.fullname },
                      { label: "Title", value: contactQuery.data.jobtitle },
                      { label: "Email", value: contactQuery.data.emailaddress1 },
                      { label: "Mobile", value: contactQuery.data.mobilephone },
                    ].map((item) => (
                      <div key={item.label}>
                        <div className="text-[11px] text-muted-foreground/70">{item.label}</div>
                        <div className="text-[13px] break-words">{item.value ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-muted-foreground">
                    No contact details available.
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
