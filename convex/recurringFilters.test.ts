import { describe, expect, test } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import {
  emptyRecurringFilters,
  filterRecurring,
} from "../src/lib/recurringFilters";

const checking = "checking" as Id<"accounts">;
const card = "card" as Id<"accounts">;
const loan = "loan" as Id<"accounts">;
const grocery = "grocery" as Id<"merchants">;
const employer = "employer" as Id<"merchants">;
const accounts: Pick<Doc<"accounts">, "_id" | "kind">[] = [
  { _id: checking, kind: "cash" },
  { _id: card, kind: "credit" },
  { _id: loan, kind: "loan" },
];
const merchants = [
  { _id: grocery, name: "Sample Market" },
  { _id: employer, name: "Sample Employer" },
];
const rows = [
  {
    name: "card payment",
    merchantId: grocery,
    accountId: card,
    amountCents: 2500,
    paid: true,
  },
  {
    name: "cash payment",
    merchantId: grocery,
    accountId: checking,
    amountCents: 5000,
    paid: false,
  },
  {
    name: "loan payment",
    merchantId: grocery,
    accountId: loan,
    amountCents: 10000,
    paid: false,
  },
  {
    name: "paycheck",
    merchantId: employer,
    accountId: checking,
    amountCents: -20000,
    paid: true,
  },
];

describe("recurring schedule filters", () => {
  test("combines case-insensitive merchant search, account, type, and payment status", () => {
    const shown = filterRecurring(
      rows,
      { search: "  MARKET  ", accountId: card, kind: "credit", status: "paid" },
      accounts,
      merchants,
    );
    expect(shown).toEqual([rows[0]]);
    expect(shown.reduce((sum, row) => sum + row.amountCents, 0)).toBe(2500);
    expect(
      filterRecurring(
        rows,
        { ...emptyRecurringFilters, accountId: checking, kind: "credit" },
        accounts,
        merchants,
      ),
    ).toEqual([]);
  });
  test("distinguishes income from payments and credit cards from loans", () => {
    expect(
      filterRecurring(
        rows,
        { ...emptyRecurringFilters, kind: "income" },
        accounts,
        merchants,
      ),
    ).toEqual([rows[3]]);
    expect(
      filterRecurring(
        rows,
        { ...emptyRecurringFilters, kind: "expense", status: "unpaid" },
        accounts,
        merchants,
      ),
    ).toEqual([rows[1], rows[2]]);
    expect(
      filterRecurring(
        rows,
        { ...emptyRecurringFilters, kind: "credit" },
        accounts,
        merchants,
      ),
    ).toEqual([rows[0]]);
    expect(
      filterRecurring(rows, emptyRecurringFilters, accounts, merchants),
    ).toEqual(rows);
  });
  test("does not label paused schedules with no occurrence state as unpaid", () => {
    const paused = [
      { accountId: checking, merchantId: grocery, amountCents: 5000 },
    ];
    expect(
      filterRecurring(
        paused,
        { ...emptyRecurringFilters, status: "unpaid" },
        accounts,
        merchants,
      ),
    ).toEqual([]);
    expect(
      filterRecurring(paused, emptyRecurringFilters, accounts, merchants),
    ).toEqual(paused);
  });
});
