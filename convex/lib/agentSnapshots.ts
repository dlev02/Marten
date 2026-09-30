/**
 * Snapshot tools: an assistant relays single, checkable numbers from the
 * user's own finance data (balances, statement dates, credit scores) instead
 * of copying transaction feeds. Every write is an upsert keyed by account and
 * date (or bureau, model and date), so a scheduled task can run twice without
 * duplicating anything, and bank-connected data is never overwritten.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { owned, date as validDate, type UserMutationCtx } from "./access";
import { ACCOUNT_SUBTYPES, type AgentToolInput } from "./agentTools";
import { importBalancesForUser, saveAccountForUser } from "../workspace";
import { saveAgentCreditScore } from "../creditScores";
import { writerStamp, type AgentActor } from "./agentActor";
import { normalize } from "./finance";

export type AgentWriteCtx = UserMutationCtx & { agent: AgentActor };
export type SnapshotChange = {
  field: string;
  before: string | number | null;
  after: string | number | null;
};
type Refusal = { field: string; reason: string };

const DAY_MS = 86_400_000;
function shiftDay(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
/** UTC calendar date; one day of slack covers every US time zone. */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
function isDate(value: string) {
  try {
    validDate(value);
    return value >= "1900-01-01";
  } catch {
    return false;
  }
}
const isDebt = (account: Doc<"accounts">) =>
  account.kind === "credit" || account.kind === "loan";
const DEBT_SIGN_WARNING =
  "balanceCents is negative, which Marten reads as a credit balance (the lender owes the user). Amounts owed on credit and loan accounts are positive; check the sign.";

/** The account fields an assistant sees after a snapshot tool. */
function accountView(account: Doc<"accounts">) {
  return {
    _id: account._id,
    name: account.name,
    institution: account.institution,
    mask: account.mask,
    kind: account.kind,
    subtype: account.subtype,
    balanceCents: account.balanceCents,
    manual: account.manual,
    closed: account.closed,
    ...(account.limitCents !== undefined
      ? { limitCents: account.limitCents }
      : {}),
  };
}

export async function createAgentAccount(
  ctx: AgentWriteCtx,
  input: AgentToolInput<"create_account">,
) {
  const subtypes: readonly string[] = ACCOUNT_SUBTYPES[input.kind];
  const subtype = input.subtype ?? subtypes[0];
  if (!subtypes.includes(subtype))
    throw new ConvexError(
      `subtype for ${input.kind} accounts is one of: ${subtypes.join(", ")}.`,
    );
  if (input.balanceDate) {
    if (!isDate(input.balanceDate))
      throw new ConvexError("balanceDate is not a valid date.");
    if (input.balanceDate > shiftDay(todayUtc(), 1))
      throw new ConvexError("balanceDate cannot be in the future.");
  }
  const accounts = await ctx.db
    .query("accounts")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .take(201);
  const institution = normalize(input.institution);
  const existing = accounts.find(
    (account) =>
      account.kind === input.kind &&
      normalize(account.institution) === institution &&
      (input.mask
        ? account.mask === input.mask
        : normalize(account.name) === normalize(input.name)),
  );
  if (existing)
    return {
      created: null,
      existing: accountView(existing),
      hint: existing.manual
        ? "This account already exists. Use record_account_snapshot with its _id to update its balance."
        : "This account is connected to a bank in Marten; its balances come from that connection.",
    };
  if (accounts.length >= 200)
    throw new ConvexError("A workspace can have up to 200 accounts.");
  const id = await saveAccountForUser(ctx, {
    name: input.name,
    institution: input.institution,
    mask: input.mask ?? "",
    kind: input.kind,
    subtype,
    balanceCents: input.balanceCents,
    currency: "USD",
    hidden: false,
    excludeNetWorth: false,
    closed: false,
    ...(input.limitCents !== undefined ? { limitCents: input.limitCents } : {}),
  });
  const stamp = writerStamp(ctx.agent);
  // The opening balance is dated when the assistant says it was observed.
  const opening = await ctx.db
    .query("balances")
    .withIndex("by_accountId_and_date", (q) => q.eq("accountId", id))
    .first();
  if (opening)
    await ctx.db.patch(opening._id, {
      writtenBy: stamp,
      ...(input.balanceDate ? { date: input.balanceDate } : {}),
    });
  await ctx.db.patch(id, { writtenBy: stamp });
  const created = await owned(ctx, id);
  return {
    created: accountView(created),
    ...(isDebt(created) && input.balanceCents < 0
      ? { warnings: [DEBT_SIGN_WARNING] }
      : {}),
  };
}

type SnapshotInput =
  AgentToolInput<"record_account_snapshot">["snapshots"][number];
export type SnapshotOutcome = {
  accountId: string;
  name?: string;
  status: "updated" | "unchanged" | "refused";
  reason?: string;
  changes?: SnapshotChange[];
  refusedFields?: Refusal[];
  warnings?: string[];
};

/** Checks every date in one snapshot; returns a reason when one is unusable. */
function snapshotDateProblem(input: SnapshotInput) {
  const today = todayUtc(),
    tomorrow = shiftDay(today, 1);
  if (!isDate(input.asOf)) return "asOf is not a valid date.";
  if (input.asOf > tomorrow) return "asOf cannot be in the future.";
  if (input.statementDate !== undefined) {
    if (!isDate(input.statementDate))
      return "statementDate is not a valid date.";
    if (input.statementDate > tomorrow)
      return "statementDate cannot be in the future.";
  }
  if (input.dueDate !== undefined) {
    if (!isDate(input.dueDate)) return "dueDate is not a valid date.";
    if (
      input.dueDate < shiftDay(today, -400) ||
      input.dueDate > shiftDay(today, 400)
    )
      return "dueDate must be within about a year of today.";
    if (input.statementDate && input.dueDate < input.statementDate)
      return "dueDate cannot be before statementDate.";
  }
  if (
    input.minimumCents !== undefined &&
    input.statementCents !== undefined &&
    input.statementCents >= 0 &&
    input.minimumCents > input.statementCents
  )
    return "minimumCents cannot exceed statementCents.";
  return null;
}

async function upsertBalanceRow(
  ctx: AgentWriteCtx,
  accountId: Id<"accounts">,
  day: string,
  balanceCents: number,
  changes: SnapshotChange[],
) {
  const row = await ctx.db
    .query("balances")
    .withIndex("by_accountId_and_date", (q) =>
      q.eq("accountId", accountId).eq("date", day),
    )
    .unique();
  if (row?.balanceCents === balanceCents) return false;
  const writtenBy = writerStamp(ctx.agent);
  if (row) await ctx.db.patch(row._id, { balanceCents, writtenBy });
  else
    await ctx.db.insert("balances", {
      userId: ctx.userId,
      accountId,
      date: day,
      balanceCents,
      writtenBy,
    });
  changes.push({
    field: `balance on ${day}`,
    before: row?.balanceCents ?? null,
    after: balanceCents,
  });
  return true;
}

const BALANCE_FIELDS = [
  "balanceCents",
  "availableCents",
  "limitCents",
] as const;
const STATEMENT_FIELDS = [
  "statementCents",
  "statementDate",
  "dueDate",
  "minimumCents",
] as const;
type StatementField = (typeof STATEMENT_FIELDS)[number];
type StatementValues = Partial<Pick<SnapshotInput, StatementField>>;

async function applyManualBalances(
  ctx: AgentWriteCtx,
  account: Doc<"accounts">,
  input: SnapshotInput,
  changes: SnapshotChange[],
  warnings: string[],
) {
  if (input.balanceCents !== undefined)
    await upsertBalanceRow(
      ctx,
      account._id,
      input.asOf,
      input.balanceCents,
      changes,
    );
  if (!BALANCE_FIELDS.some((field) => input[field] !== undefined)) return {};
  // Only the newest dated balance is the account's current balance.
  const newest = await ctx.db
    .query("balances")
    .withIndex("by_accountId_and_date", (q) => q.eq("accountId", account._id))
    .order("desc")
    .first();
  if (newest && newest.date > input.asOf) {
    warnings.push(
      `A later balance (${newest.date}) is already saved, so the current balance was not changed; this one was kept as history.`,
    );
    return {};
  }
  const patch: Partial<Doc<"accounts">> = {};
  for (const field of BALANCE_FIELDS) {
    const value = input[field];
    if (value === undefined || value === account[field]) continue;
    patch[field] = value;
    changes.push({ field, before: account[field] ?? null, after: value });
  }
  return patch;
}

/**
 * Manual accounts keep statement details on the account itself. A new due
 * date is a new statement, so its unstated amounts are cleared rather than
 * carried over from the previous one.
 */
function manualStatementPatch(
  account: Doc<"accounts">,
  values: StatementValues,
  changes: SnapshotChange[],
) {
  const newStatement =
    values.dueDate !== undefined && values.dueDate !== account.dueDate;
  const patch: Partial<Doc<"accounts">> = {};
  for (const field of STATEMENT_FIELDS) {
    const next = values[field] ?? (newStatement ? undefined : account[field]);
    if (next === account[field]) continue;
    patch[field] = next as never;
    changes.push({
      field,
      before: account[field] ?? null,
      after: next ?? null,
    });
  }
  return patch;
}

/**
 * Bank-connected accounts (and manual accounts that already have one) take
 * statement details as a statement reminder, which bank syncs never clear
 * and which the Recurring page and reminders already prefer.
 */
function reminderPatch(
  ctx: AgentWriteCtx,
  account: Doc<"accounts">,
  values: StatementValues,
  changes: SnapshotChange[],
  refused: Refusal[],
) {
  const rest: StatementValues = { ...values };
  if (!account.manual) {
    if (account.dueDate !== undefined) {
      for (const field of STATEMENT_FIELDS)
        if (rest[field] !== undefined && rest[field] !== account[field])
          refused.push({
            field,
            reason:
              "The bank connection supplies this account's statement, so its details were kept.",
          });
      return null;
    }
    for (const field of STATEMENT_FIELDS) {
      if (rest[field] === undefined) continue;
      if (field === "statementDate")
        refused.push({
          field,
          reason:
            "Only the due date, statement balance and minimum can be added to a bank-connected account.",
        });
      else if (account[field] !== undefined && rest[field] !== account[field])
        refused.push({
          field,
          reason: "The bank connection supplies this value.",
        });
      else continue;
      delete rest[field];
    }
  }
  const current = account.statementReminder;
  const wanted = {
    dueDate: rest.dueDate,
    statementCents: rest.statementCents,
    minimumCents: rest.minimumCents,
  };
  const given = (Object.keys(wanted) as (keyof typeof wanted)[]).filter(
    (field) => wanted[field] !== undefined,
  );
  if (!given.length) return null;
  const refuseAll = (reason: string) => {
    for (const field of given) refused.push({ field, reason });
    return null;
  };
  if (!wanted.dueDate && !current)
    return refuseAll("Include dueDate to add statement details here.");
  if ((wanted.statementCents ?? 0) < 0 || (wanted.minimumCents ?? 0) < 0)
    return refuseAll(
      "Statement amounts added to this account cannot be negative.",
    );
  const dueDate = wanted.dueDate ?? current!.dueDate;
  const newStatement = dueDate !== current?.dueDate;
  const next = {
    dueDate,
    statementCents:
      wanted.statementCents ??
      (newStatement ? undefined : current?.statementCents),
    minimumCents:
      wanted.minimumCents ?? (newStatement ? undefined : current?.minimumCents),
  };
  let changed = false;
  for (const field of ["dueDate", "statementCents", "minimumCents"] as const) {
    if (next[field] === current?.[field]) continue;
    changed = true;
    changes.push({
      field: `reminder ${field}`,
      before: current?.[field] ?? null,
      after: next[field] ?? null,
    });
  }
  if (!changed) return null;
  return {
    statementReminder: {
      ...next,
      updatedAt: Date.now(),
      writtenBy: writerStamp(ctx.agent),
    },
  };
}

async function applySnapshot(
  ctx: AgentWriteCtx,
  input: SnapshotInput,
  seen: Set<string>,
): Promise<SnapshotOutcome> {
  const refuse = (reason: string, name?: string): SnapshotOutcome => ({
    accountId: input.accountId,
    ...(name ? { name } : {}),
    status: "refused",
    reason,
  });
  const accountId = ctx.db.normalizeId("accounts", input.accountId);
  const account = accountId ? await ctx.db.get(accountId) : null;
  if (!account || account.userId !== ctx.userId)
    return refuse("This account is unavailable.");
  if (seen.has(account._id))
    return refuse(
      "This account appears more than once in the call; send one snapshot per account.",
      account.name,
    );
  seen.add(account._id);
  if (account.closed)
    return refuse("This account is closed in Marten.", account.name);
  const problem = snapshotDateProblem(input);
  if (problem) return refuse(problem, account.name);

  const changes: SnapshotChange[] = [],
    refused: Refusal[] = [],
    warnings: string[] = [];
  const statement = Object.fromEntries(
    STATEMENT_FIELDS.filter((field) => input[field] !== undefined).map(
      (field) => [field, input[field]],
    ),
  ) as StatementValues;
  if (!isDebt(account))
    for (const field of STATEMENT_FIELDS)
      if (statement[field] !== undefined) {
        refused.push({
          field,
          reason: "Statement details apply to credit and loan accounts.",
        });
        delete statement[field];
      }
  if (isDebt(account) && (input.balanceCents ?? 0) < 0)
    warnings.push(DEBT_SIGN_WARNING);
  // A statement older than the one Marten has is stale, not an update.
  const currentDue = account.statementReminder?.dueDate ?? account.dueDate;
  if (
    currentDue &&
    ((statement.dueDate && statement.dueDate < currentDue) ||
      (statement.statementDate &&
        account.statementDate &&
        statement.statementDate < account.statementDate))
  ) {
    for (const field of STATEMENT_FIELDS)
      if (statement[field] !== undefined) {
        refused.push({
          field,
          reason: `Marten already has a later statement (due ${currentDue}).`,
        });
        delete statement[field];
      }
  }

  let patch: Partial<Doc<"accounts">> = {};
  if (account.manual) {
    patch = await applyManualBalances(ctx, account, input, changes, warnings);
    const { statementDate, ...reminderValues } = statement;
    if (account.statementReminder) {
      Object.assign(
        patch,
        manualStatementPatch(
          account,
          statementDate === undefined ? {} : { statementDate },
          changes,
        ),
        reminderPatch(ctx, account, reminderValues, changes, refused) ?? {},
      );
    } else
      Object.assign(patch, manualStatementPatch(account, statement, changes));
  } else {
    for (const field of BALANCE_FIELDS)
      if (input[field] !== undefined && input[field] !== account[field])
        refused.push({
          field,
          reason:
            "This account's balances come from its bank connection and are not replaced.",
        });
    Object.assign(
      patch,
      reminderPatch(ctx, account, statement, changes, refused) ?? {},
    );
  }
  const accountValuesChanged = Object.keys(patch).some(
    (key) => key !== "statementReminder",
  );
  if (Object.keys(patch).length)
    await ctx.db.patch(account._id, {
      ...patch,
      ...(accountValuesChanged
        ? { writtenBy: writerStamp(ctx.agent), updatedAt: Date.now() }
        : {}),
    });
  const status = changes.length
    ? "updated"
    : refused.length
      ? "refused"
      : "unchanged";
  return {
    accountId: account._id,
    name: account.name,
    status,
    ...(status === "refused" ? { reason: refused[0].reason } : {}),
    ...(changes.length ? { changes } : {}),
    ...(refused.length ? { refusedFields: refused } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

export async function recordAccountSnapshots(
  ctx: AgentWriteCtx,
  input: AgentToolInput<"record_account_snapshot">,
) {
  const seen = new Set<string>();
  const results: SnapshotOutcome[] = [];
  for (const snapshot of input.snapshots)
    results.push(await applySnapshot(ctx, snapshot, seen));
  const count = (status: SnapshotOutcome["status"]) =>
    results.filter((result) => result.status === status).length;
  return {
    results,
    updated: count("updated"),
    unchanged: count("unchanged"),
    refused: count("refused"),
  };
}

export async function recordBalanceHistory(
  ctx: AgentWriteCtx,
  accountId: Id<"accounts">,
  rows: AgentToolInput<"record_balance_history">["rows"],
) {
  const account = await owned(ctx, accountId);
  if (!account.manual)
    throw new ConvexError(
      "This account's balances come from its bank connection. record_balance_history only fills manually tracked accounts.",
    );
  const dates = new Set(rows.map((row) => row.date));
  if (dates.size !== rows.length) throw new ConvexError("Send each date once.");
  const today = todayUtc();
  for (const row of rows) {
    if (!isDate(row.date))
      throw new ConvexError(`${row.date} is not a valid date.`);
    if (row.date > today)
      throw new ConvexError("Balance history cannot be dated in the future.");
  }
  const changes: SnapshotChange[] = [];
  const changed: typeof rows = [];
  let inserted = 0;
  for (const row of rows) {
    const existing = await ctx.db
      .query("balances")
      .withIndex("by_accountId_and_date", (q) =>
        q.eq("accountId", accountId).eq("date", row.date),
      )
      .unique();
    if (existing?.balanceCents === row.balanceCents) continue;
    if (!existing) inserted++;
    changed.push(row);
    changes.push({
      field: `balance on ${row.date}`,
      before: existing?.balanceCents ?? null,
      after: row.balanceCents,
    });
  }
  if (changed.length) {
    // The same import path the Balance history dialog uses.
    await importBalancesForUser(ctx, { accountId, rows: changed });
    const writtenBy = writerStamp(ctx.agent);
    for (const row of changed) {
      const saved = await ctx.db
        .query("balances")
        .withIndex("by_accountId_and_date", (q) =>
          q.eq("accountId", accountId).eq("date", row.date),
        )
        .unique();
      if (saved) await ctx.db.patch(saved._id, { writtenBy });
    }
  }
  const after = await owned(ctx, accountId);
  const currentChanged = after.balanceCents !== account.balanceCents;
  if (currentChanged)
    await ctx.db.patch(accountId, { writtenBy: writerStamp(ctx.agent) });
  return {
    accountId,
    name: account.name,
    inserted,
    updated: changed.length - inserted,
    unchanged: rows.length - changed.length,
    currentBalanceCents: after.balanceCents,
    currentBalanceChanged: currentChanged,
    changes,
    ...(isDebt(account) && rows.some((row) => row.balanceCents < 0)
      ? { warnings: [DEBT_SIGN_WARNING] }
      : {}),
  };
}

export async function saveCreditScoreFromAgent(
  ctx: AgentWriteCtx,
  input: AgentToolInput<"save_credit_score">,
) {
  const outcome = await saveAgentCreditScore(ctx, ctx.agent, input);
  const saved = await owned(ctx, outcome.id);
  return {
    status: outcome.status,
    ...("reason" in outcome ? { reason: outcome.reason } : {}),
    observation: {
      _id: saved._id,
      bureau: saved.bureau,
      model: saved.model,
      date: saved.date,
      score: saved.score,
      source: saved.source,
      entryMethod: saved.entryMethod,
    },
    before: outcome.before
      ? { score: outcome.before.score, source: outcome.before.source }
      : null,
  };
}
