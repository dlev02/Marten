import type { Doc } from "../_generated/dataModel";
const label = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s*\(\s*(?:\.{3}|…)?\s*[x*#•]*\d{2,}\s*\)$/, "")
    .replace(/\s+/g, " ");
type IncomingAccount = {
  name: string;
  mask: string;
  kind: string;
  currency: string;
};
/** Same label, last four digits, type and currency, unique in BOTH directions. Never pair by mask alone. */
export function importedAccountMatch(
  accounts: Doc<"accounts">[],
  incoming: IncomingAccount,
  incomingAccounts: IncomingAccount[],
) {
  const matches = (account: Doc<"accounts">, bank: IncomingAccount) =>
    !!account.importName &&
    account.manual &&
    !account.closed &&
    !account.itemId &&
    !account.simplefinConnectionId &&
    account.kind === bank.kind &&
    account.currency === bank.currency &&
    /^\d{4}$/.test(account.mask) &&
    account.mask === bank.mask &&
    label(account.importName) === label(bank.name);
  const candidates = accounts.filter((a) => matches(a, incoming));
  return candidates.length === 1 &&
    incomingAccounts.filter((i) => matches(candidates[0], i)).length === 1
    ? candidates[0]
    : null;
}
