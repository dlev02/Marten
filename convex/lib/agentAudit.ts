/**
 * The audit record for one assistant write: a plain one-line summary for
 * Settings → AI connections, counts, and a bounded list of before/after
 * values. Only ids, names, dates, flags and amounts are recorded; long text is
 * truncated, and storage ids, URLs and credentials are never read from the
 * result. Conversation text never reaches this module.
 */
import type { AgentToolName } from "./agentTools";
import { describeTransactionChange } from "./transactions";

export type AuditChange = {
  target: string;
  field: string;
  before: string | null;
  after: string | null;
};
export type AgentAudit = {
  summary: string;
  counts?: Record<string, number>;
  changes?: AuditChange[];
  changesTruncated?: boolean;
};
type Row = Record<string, unknown>;

/** Changes kept per call; the summary and counts still describe the whole call. */
export const AUDIT_CHANGE_LIMIT = 25;
const VALUE_LIMIT = 80;
const NAME_LIMIT = 60;

function clip(value: string, limit = VALUE_LIMIT) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
/** A stored value as short text. Objects are summarized, never stored whole. */
export function auditValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return clip(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value))
    return clip(
      value.every((item) => typeof item !== "object" || item === null)
        ? value.map(String).join(", ")
        : `${value.length} item${value.length === 1 ? "" : "s"}`,
    );
  return "(changed)";
}
const quote = (value: unknown) =>
  typeof value === "string" && value ? `“${clip(value, NAME_LIMIT)}”` : "";
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;
const obj = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};

function diff(
  target: string,
  before: Row,
  after: Row,
  fields: string[],
): AuditChange[] {
  return fields
    .filter(
      (field) =>
        JSON.stringify(before[field] ?? null) !==
        JSON.stringify(after[field] ?? null),
    )
    .map((field) => ({
      target,
      field,
      before: auditValue(before[field]),
      after: auditValue(after[field]),
    }));
}
function bounded(audit: AgentAudit): AgentAudit {
  const changes = audit.changes ?? [];
  return {
    ...audit,
    summary: clip(audit.summary, 200),
    ...(changes.length
      ? { changes: changes.slice(0, AUDIT_CHANGE_LIMIT) }
      : { changes: undefined }),
    ...(changes.length > AUDIT_CHANGE_LIMIT ? { changesTruncated: true } : {}),
  };
}

/** Transaction edits read best as one verb when a single field changed. */
function transactionSummary(fields: string[], count: number, patch: Row) {
  const rows = plural(count, "transaction");
  if (fields.length === 1)
    switch (fields[0]) {
      case "categoryId":
        return `Recategorized ${rows}`;
      case "merchantId":
        return `Changed the merchant on ${rows}`;
      case "tagIds":
        return `Changed tags on ${rows}`;
      case "notes":
        return `Edited notes on ${rows}`;
      case "reviewed":
        return `Marked ${rows} ${patch.reviewed === false ? "unreviewed" : "reviewed"}`;
      case "hidden":
        return `${patch.hidden === false ? "Unhid" : "Hid"} ${rows}`;
      case "splits":
        return `Changed splits on ${rows}`;
    }
  return `${describeTransactionChange(fields)} on ${rows}`;
}
/** Resolved names read better than ids in the audit when a row has them. */
const NAMED: Record<string, string> = {
  categoryId: "categoryName",
  merchantId: "merchantName",
  tagIds: "tagNames",
};

export function auditWrite(
  name: AgentToolName,
  input: unknown,
  result: unknown,
): AgentAudit {
  const args = obj(input),
    out = obj(result);
  switch (name) {
    case "update_transaction": {
      const fields = Object.keys(obj(args.patch));
      const before = obj(out.before),
        after = obj(out.after);
      const target = `transaction ${String(args.id)}`;
      return bounded({
        summary: transactionSummary(fields, 1, obj(args.patch)),
        counts: { transactions: 1 },
        changes: fields.flatMap((field) =>
          diff(target, before, after, [NAMED[field] ?? field]).map((c) => ({
            ...c,
            field,
          })),
        ),
      });
    }
    case "update_transactions": {
      const fields = (out.changed as string[] | undefined) ?? [];
      const rows = (out.rows as Row[] | undefined) ?? [];
      const requested = args.tagChange
        ? [...new Set([...Object.keys(obj(args.patch)), "tagIds"])]
        : Object.keys(obj(args.patch));
      // Name only fields that changed on some row, so "mark reviewed" on rows
      // that already were does not read as a change.
      const summaryFields = rows.length
        ? requested.filter((field) =>
            rows.some(
              (row) =>
                JSON.stringify(obj(row.before)[field]) !==
                JSON.stringify(obj(row.after)[field]),
            ),
          )
        : requested;
      const count = Number(out.updated ?? rows.length);
      return bounded({
        summary:
          rows.length && !summaryFields.length
            ? `Left ${plural(count, "transaction")} unchanged`
            : transactionSummary(summaryFields, count, obj(args.patch)),
        counts: { transactions: Number(out.updated ?? rows.length) },
        changes: rows.flatMap((row) =>
          diff(
            `transaction ${String(row.id)}`,
            obj(row.before),
            obj(row.after),
            fields,
          ),
        ),
      });
    }
    case "update_account":
    case "update_merchant":
    case "update_category":
    case "update_tag": {
      const kind = name.slice("update_".length);
      const before = obj(out.before),
        after = obj(out.after);
      const fields = Object.keys(obj(args.patch));
      const renamed = fields.includes("name") && before.name !== after.name;
      return bounded({
        summary: renamed
          ? `Renamed ${kind} ${quote(before.name)} to ${quote(after.name)}`
          : `Changed ${kind} ${quote(after.name ?? before.name)}`.trim(),
        counts: { [`${kind}s`]: 1 },
        changes: diff(`${kind} ${String(args.id)}`, before, after, fields),
      });
    }
    case "create_merchant":
    case "create_category":
    case "create_tag": {
      const kind = name.slice("create_".length);
      const created = obj(out.created),
        existing = obj(out.existing);
      return out.created
        ? {
            summary: `Added ${kind} ${quote(created.name)}`,
            counts: { [`${kind}s`]: 1 },
          }
        : {
            summary: `Found existing ${kind} ${quote(existing.name)}`,
            counts: { [`${kind}s`]: 0 },
          };
    }
    case "merge_merchants":
    case "merge_categories": {
      const kind = name === "merge_merchants" ? "merchant" : "category";
      const moved = Number(
        out.movedTransactions ?? out.updatedTransactions ?? 0,
      );
      return {
        summary: `Merged ${kind} ${quote(obj(out.merged).name)} into ${quote(obj(out.into).name)}${out.done ? "" : " (continuing)"} · ${plural(moved, "transaction")} moved`,
        counts: { transactions: moved, [`${kind}sMerged`]: out.done ? 1 : 0 },
      };
    }
    case "set_merchant_logo":
      return {
        summary: `Set the logo for merchant ${quote(obj(out.merchant).name)} from ${clip(String(args.domain ?? ""), NAME_LIMIT)}`,
        counts: { merchants: 1 },
      };
    case "save_rule": {
      const after = obj(out.after);
      return out.before
        ? bounded({
            summary: `Updated rule ${quote(after.name)}`,
            counts: { rules: 1 },
            changes: diff(`rule ${String(after._id)}`, obj(out.before), after, [
              "name",
              "enabled",
              "match",
              "conditions",
              "actions",
            ]),
          })
        : { summary: `Added rule ${quote(after.name)}`, counts: { rules: 1 } };
    }
    case "reorder_rules": {
      const count = ((out.rules as unknown[]) ?? []).length;
      return {
        summary: `Reordered ${plural(count, "rule")}`,
        counts: { rules: count },
      };
    }
    case "update_preferences": {
      const fields = Object.keys(obj(args.patch));
      return bounded({
        summary: `Changed preferences (${fields.join(", ")})`,
        changes: diff("preferences", obj(out.before), obj(out.after), fields),
      });
    }
    case "create_recurring":
      return {
        summary: `Added a recurring schedule${obj(out.created).name ? ` ${quote(obj(out.created).name)}` : ""}`,
        counts: { recurring: 1 },
      };
    case "update_recurring": {
      const before = obj(out.before),
        after = obj(out.after);
      return bounded({
        summary: `Changed recurring schedule${after.name ? ` ${quote(after.name)}` : ""}`,
        counts: { recurring: 1 },
        changes: diff(
          `recurring ${String(args.id)}`,
          before,
          after,
          Object.keys(obj(args.patch)),
        ),
      });
    }
    case "set_recurring_paid":
      return bounded({
        summary: `Marked the ${String(args.date)} occurrence ${args.paid ? "paid" : "unpaid"}`,
        changes: [
          {
            target: `recurring ${String(args.recurringId)}`,
            field: `paid on ${String(args.date)}`,
            before: auditValue(out.before),
            after: auditValue(out.after),
          },
        ],
      });
    case "save_forecast":
      return {
        summary: `${out.before ? "Updated" : "Saved"} forecast ${quote(obj(out.after).name)}`,
        counts: { forecasts: 1 },
      };
    case "create_account": {
      const created = obj(out.created),
        existing = obj(out.existing);
      return out.created
        ? {
            summary: `Added account ${quote(created.name)}`,
            counts: { accounts: 1 },
            changes: [
              {
                target: `account ${String(created._id)}`,
                field: "balanceCents",
                before: null,
                after: auditValue(created.balanceCents),
              },
            ],
          }
        : {
            summary: `Found existing account ${quote(existing.name)}`,
            counts: { accounts: 0 },
          };
    }
    case "record_account_snapshot": {
      const results = (out.results as Row[] | undefined) ?? [];
      const updated = Number(out.updated ?? 0),
        unchanged = Number(out.unchanged ?? 0),
        refused = Number(out.refused ?? 0);
      const extras = [
        unchanged ? `${unchanged} unchanged` : "",
        refused ? `${refused} refused` : "",
      ].filter(Boolean);
      return bounded({
        summary: `Updated ${plural(updated, "account")}${extras.length ? ` (${extras.join(", ")})` : ""}`,
        counts: { accountsUpdated: updated, unchanged, refused },
        changes: results.flatMap((row) =>
          ((row.changes as Row[] | undefined) ?? []).map((change) => ({
            target: `account ${String(row.accountId)}`,
            field: String(change.field),
            before: auditValue(change.before),
            after: auditValue(change.after),
          })),
        ),
      });
    }
    case "record_balance_history": {
      const inserted = Number(out.inserted ?? 0),
        updated = Number(out.updated ?? 0),
        unchanged = Number(out.unchanged ?? 0);
      return bounded({
        summary: `Recorded ${plural(inserted + updated, "balance")} for ${quote(out.name)}${unchanged ? ` (${unchanged} unchanged)` : ""}`,
        counts: {
          balancesAdded: inserted,
          balancesUpdated: updated,
          unchanged,
        },
        changes: ((out.changes as Row[] | undefined) ?? []).map((change) => ({
          target: `account ${String(out.accountId)}`,
          field: String(change.field),
          before: auditValue(change.before),
          after: auditValue(change.after),
        })),
      });
    }
    case "save_credit_score": {
      const saved = obj(out.observation),
        before = obj(out.before);
      const label = `${String(saved.bureau)} ${String(saved.model)} score`;
      const article = /^[AEIOU]/.test(label) ? "an" : "a";
      const status = String(out.status);
      const summary =
        status === "created"
          ? `Added ${article} ${label}`
          : status === "updated"
            ? `Updated ${article} ${label}`
            : status === "refused"
              ? `Kept your ${label} (a different one was relayed)`
              : `Confirmed ${article} ${label} (unchanged)`;
      return bounded({
        summary,
        counts: {
          scores: status === "created" || status === "updated" ? 1 : 0,
        },
        changes:
          status === "created" || status === "updated"
            ? [
                {
                  target: `credit score ${String(saved.date)}`,
                  field: "score",
                  before: auditValue(before.score),
                  after: auditValue(saved.score),
                },
              ]
            : [],
      });
    }
    default:
      return { summary: `Ran ${name.replace(/_/g, " ")}` };
  }
}

/** apply_rule runs outside the write mutation, so its line is built here. */
export function auditApplyRule(updated: number, complete: boolean): AgentAudit {
  return {
    summary: `Applied a rule to ${plural(updated, "transaction")}${complete ? "" : " (continuing)"}`,
    counts: { transactions: updated },
  };
}
