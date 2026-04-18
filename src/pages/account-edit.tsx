import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  Field,
  FluentProvider,
  Input,
  Spinner,
  Tag,
  Textarea,
  makeStyles,
  shorthands,
  tokens,
  webDarkTheme,
} from "@fluentui/react-components";
import { ArrowClockwise20Regular, ArrowLeft20Regular, Save20Regular } from "@fluentui/react-icons";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import type { Accounts, AccountsBase } from "@/generated/models/AccountsModel";
import { Accountsindustrycode } from "@/generated/models/AccountsModel";
import { AccountsService } from "@/generated/services/AccountsService";

const EDIT_SELECT: string[] = [
  "accountid",
  "name",
  "accountnumber",
  "emailaddress1",
  "telephone1",
  "industrycode",
  "revenue",
  "description",
];

type EditFormState = {
  name: string;
  accountnumber: string;
  emailaddress1: string;
  telephone1: string;
  industrycode: string;
  revenue: string;
  description: string;
};

type VerificationResult = {
  status: "ok" | "mismatch";
  summary: string;
};

const EMPTY_FORM: EditFormState = {
  name: "",
  accountnumber: "",
  emailaddress1: "",
  telephone1: "",
  industrycode: "",
  revenue: "",
  description: "",
};

const INDUSTRY_OPTIONS = Object.entries(Accountsindustrycode).map(([value, label]) => ({
  value,
  label: label.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"),
}));

function mapAccountToForm(account: Partial<AccountsBase>): EditFormState {
  return {
    name: typeof account.name === "string" ? account.name : "",
    accountnumber: typeof account.accountnumber === "string" ? account.accountnumber : "",
    emailaddress1: typeof account.emailaddress1 === "string" ? account.emailaddress1 : "",
    telephone1: typeof account.telephone1 === "string" ? account.telephone1 : "",
    industrycode:
      typeof account.industrycode === "number" && Number.isFinite(account.industrycode)
        ? String(account.industrycode)
        : "",
    revenue:
      typeof account.revenue === "number" && Number.isFinite(account.revenue)
        ? String(account.revenue)
        : "",
    description: typeof account.description === "string" ? account.description : "",
  };
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildPayload(form: EditFormState): Record<string, unknown> {
  const industryValue = form.industrycode.trim().length === 0 ? null : Number(form.industrycode);
  const revenueText = form.revenue.trim();
  const revenueValue = revenueText.length === 0 ? null : Number(revenueText);

  return {
    name: form.name.trim(),
    accountnumber: normalizeText(form.accountnumber),
    emailaddress1: normalizeText(form.emailaddress1),
    telephone1: normalizeText(form.telephone1),
    industrycode: industryValue,
    description: normalizeText(form.description),
    revenue: revenueValue,
  };
}

function compareAgainstReadBack(
  form: EditFormState,
  readBack: Partial<Accounts>,
): VerificationResult {
  const checks: Array<[string, string | number | null, string | number | null]> = [
    ["name", form.name.trim(), typeof readBack.name === "string" ? readBack.name : null],
    [
      "accountnumber",
      normalizeText(form.accountnumber),
      typeof readBack.accountnumber === "string" ? readBack.accountnumber : null,
    ],
    [
      "emailaddress1",
      normalizeText(form.emailaddress1),
      typeof readBack.emailaddress1 === "string" ? readBack.emailaddress1 : null,
    ],
    [
      "telephone1",
      normalizeText(form.telephone1),
      typeof readBack.telephone1 === "string" ? readBack.telephone1 : null,
    ],
    [
      "industrycode",
      form.industrycode.trim().length === 0 ? null : Number(form.industrycode.trim()),
      typeof readBack.industrycode === "number" ? readBack.industrycode : null,
    ],
    [
      "description",
      normalizeText(form.description),
      typeof readBack.description === "string" ? readBack.description : null,
    ],
    [
      "revenue",
      form.revenue.trim().length === 0 ? null : Number(form.revenue.trim()),
      typeof readBack.revenue === "number" ? readBack.revenue : null,
    ],
  ];

  const mismatches = checks.filter(([, expected, actual]) => expected !== actual);

  if (mismatches.length === 0) {
    return {
      status: "ok",
      summary: "Dataverse read-back matches the values that were just saved.",
    };
  }

  return {
    status: "mismatch",
    summary: `Update succeeded, but read-back differs for ${mismatches.map(([field]) => field).join(", ")}.`,
  };
}

const useStyles = makeStyles({
  surface: {
    minHeight: "100dvh",
    backgroundColor: "transparent",
  },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    maxWidth: "880px",
    margin: "0 auto",
    ...shorthands.padding("24px"),
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "16px",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 700,
    color: tokens.colorNeutralForeground1,
  },
  subtitle: {
    margin: "8px 0 0",
    color: tokens.colorNeutralForeground3,
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    ...shorthands.padding("20px"),
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "16px",
    "@media (max-width: 760px)": {
      gridTemplateColumns: "1fr",
    },
  },
  fullWidth: {
    gridColumn: "1 / -1",
  },
  verification: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRadius(tokens.borderRadiusLarge),
    ...shorthands.padding("14px", "16px"),
  },
  verificationText: {
    color: tokens.colorNeutralForeground2,
  },
  helperText: {
    color: tokens.colorNeutralForeground3,
    fontSize: "13px",
  },
  select: {
    height: "32px",
    width: "100%",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding("0", "12px"),
  },
});

export default function AccountEditPage() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { accountId } = useParams();
  const [form, setForm] = useState<EditFormState>(EMPTY_FORM);
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const accountQuery = useQuery({
    enabled: Boolean(accountId),
    queryKey: ["accounts", "edit", accountId],
    queryFn: async () => {
      const result = await AccountsService.get(accountId!, { select: EDIT_SELECT });

      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Failed to load account");
      }

      return result.data;
    },
  });

  useEffect(() => {
    if (!accountQuery.data) {
      return;
    }

    setForm(mapAccountToForm(accountQuery.data));
    setVerification(null);
  }, [accountQuery.data]);

  const isDirty = useMemo(() => {
    if (!accountQuery.data) {
      return false;
    }

    const initial = mapAccountToForm(accountQuery.data);
    return JSON.stringify(initial) !== JSON.stringify(form);
  }, [accountQuery.data, form]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) {
        throw new Error("Missing account id");
      }

      const payload = buildPayload(form);
      const updateResult = await AccountsService.update(
        accountId,
        payload as unknown as Parameters<typeof AccountsService.update>[1],
      );

      if (!updateResult.success) {
        throw new Error(updateResult.error?.message ?? "Failed to update account");
      }

      const readBackResult = await AccountsService.get(accountId, { select: EDIT_SELECT });

      if (!readBackResult.success || !readBackResult.data) {
        throw new Error(readBackResult.error?.message ?? "Update succeeded but read-back failed");
      }

      return readBackResult.data;
    },
    onSuccess: async (readBack) => {
      const nextForm = mapAccountToForm(readBack);
      setForm(nextForm);
      const nextVerification = compareAgainstReadBack(nextForm, readBack);
      setVerification(nextVerification);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts", "list"] }),
        queryClient.invalidateQueries({ queryKey: ["fluent-sample", "accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts", "edit", accountId] }),
      ]);

      if (nextVerification.status === "ok") {
        toast.success("Account saved and verified");
        return;
      }

      toast.warning("Account saved, but read-back differs");
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  if (!accountId) {
    return (
      <FluentProvider theme={webDarkTheme} className={styles.surface}>
        <div className={styles.page}>
          <Card className={styles.card}>Missing account id.</Card>
        </div>
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={webDarkTheme} className={styles.surface}>
      <div className={styles.page}>
        <section className={styles.header}>
          <div>
            <h1 className={styles.title}>Edit account</h1>
            <p className={styles.subtitle}>
              Update the Dataverse record, then verify the saved values with an immediate read-back.
            </p>
          </div>

          <div className={styles.actions}>
            <Button
              appearance="secondary"
              icon={<ArrowLeft20Regular />}
              onClick={() => navigate("/accounts")}
            >
              Back to accounts
            </Button>
            <Button
              appearance="subtle"
              icon={<ArrowClockwise20Regular />}
              onClick={() => void accountQuery.refetch()}
            >
              Reload
            </Button>
          </div>
        </section>

        <Card className={styles.card}>
          {accountQuery.isLoading ? (
            <Spinner label="Loading account" />
          ) : accountQuery.isError ? (
            <div>{(accountQuery.error as Error).message}</div>
          ) : (
            <>
              <div className={styles.grid}>
                <Field
                  label="Account name"
                  required
                  validationMessage={form.name.trim() ? undefined : "Name is required"}
                >
                  <Input
                    value={form.name}
                    onChange={(_, data) => setForm((prev) => ({ ...prev, name: data.value }))}
                  />
                </Field>

                <Field label="Account number">
                  <Input
                    value={form.accountnumber}
                    onChange={(_, data) =>
                      setForm((prev) => ({ ...prev, accountnumber: data.value }))
                    }
                  />
                </Field>

                <Field label="Email">
                  <Input
                    type="email"
                    value={form.emailaddress1}
                    onChange={(_, data) =>
                      setForm((prev) => ({ ...prev, emailaddress1: data.value }))
                    }
                  />
                </Field>

                <Field label="Phone">
                  <Input
                    value={form.telephone1}
                    onChange={(_, data) => setForm((prev) => ({ ...prev, telephone1: data.value }))}
                  />
                </Field>

                <Field label="Industry">
                  <select
                    className={styles.select}
                    value={form.industrycode}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, industrycode: event.target.value }))
                    }
                  >
                    <option value="">Unspecified</option>
                    {INDUSTRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Revenue">
                  <Input
                    type="number"
                    value={form.revenue}
                    onChange={(_, data) => setForm((prev) => ({ ...prev, revenue: data.value }))}
                  />
                </Field>

                <Field label="Account id">
                  <Input value={accountId} readOnly />
                </Field>

                <Field className={styles.fullWidth} label="Description">
                  <Textarea
                    resize="vertical"
                    value={form.description}
                    onChange={(_, data) =>
                      setForm((prev) => ({ ...prev, description: data.value }))
                    }
                  />
                </Field>
              </div>

              <div className={styles.actions}>
                <Button
                  appearance="primary"
                  icon={<Save20Regular />}
                  disabled={!form.name.trim() || !isDirty || updateMutation.isPending}
                  onClick={() => void updateMutation.mutateAsync()}
                >
                  {updateMutation.isPending ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  appearance="secondary"
                  disabled={updateMutation.isPending || !accountQuery.data}
                  onClick={() => {
                    if (!accountQuery.data) {
                      return;
                    }

                    setForm(mapAccountToForm(accountQuery.data));
                    setVerification(null);
                  }}
                >
                  Reset form
                </Button>
                <Button appearance="subtle" onClick={() => navigate("/sample-feature")}>
                  Back to sample feature
                </Button>
              </div>

              <div className={styles.helperText}>
                The save action uses AccountsService.update and immediately fetches the record again
                to verify the persisted values.
              </div>
            </>
          )}
        </Card>

        {verification ? (
          <div className={styles.verification}>
            <div className={styles.verificationText}>{verification.summary}</div>
            <Tag appearance="outline" color={verification.status === "ok" ? "success" : "warning"}>
              {verification.status === "ok" ? "Verified" : "Needs review"}
            </Tag>
          </div>
        ) : null}
      </div>
    </FluentProvider>
  );
}
