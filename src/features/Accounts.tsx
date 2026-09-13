import {
  useAmountsHidden,
  displayMoney as money,
} from "../lib/amountVisibility";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  EyeOff,
  Landmark,
  Loader2,
  Merge,
  Pencil,
  Plus,
  Upload,
  WalletCards,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { accountNetWorth, useData } from "../lib/data";
import { matchAccount } from "../lib/transactionImport";
import {
  csv,
  dateLabel,
  download,
  localDate,
  parseCsv,
  parseMoney,
} from "../lib/format";
import {
  Avatar,
  Button,
  Empty,
  Field,
  Loading,
  Modal,
  Panel,
  Picker,
  Tabs,
  useTask,
} from "../components/folio/ui";
import { NetWorthChart } from "../components/folio/charts";
import { AccountForm } from "./accounts/AddAccount";
import { PageHeader } from "../components/folio/PageHeader";
import "./accounts/accounts.css";

const groups = [
  { kind: "cash", name: "Cash", icon: Banknote, color: "#00a3bd" },
  { kind: "credit", name: "Credit cards", icon: CreditCard, color: "#e89d7c" },
  {
    kind: "investment",
    name: "Retirement & brokerage",
    icon: Landmark,
    color: "#7b9cbd",
  },
  { kind: "loan", name: "Loans", icon: WalletCards, color: "#be9b80" },
  { kind: "asset", name: "Other assets", icon: Landmark, color: "#7ba792" },
] as const;
function rangeStart(period: string, today: string) {
  const end = new Date(today + "T12:00:00");
  if (period === "1M") end.setMonth(end.getMonth() - 1);
  else if (period === "3M") end.setMonth(end.getMonth() - 3);
  else if (period === "6M") end.setMonth(end.getMonth() - 6);
  else if (period === "1Y") end.setFullYear(end.getFullYear() - 1);
  else if (period === "YTD") return `${today.slice(0, 4)}-01-01`;
  else end.setFullYear(end.getFullYear() - 10);
  return localDate(end);
}
const periods = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];
function accountConnection(
  account: Doc<"accounts">,
  institutions: Pick<Doc<"plaidItems">, "_id" | "status">[],
) {
  if (account.manual) return { label: "Manual balance", color: "var(--muted)" };
  if (account.simplefinConnectionId)
    return { label: "SimpleFIN import", color: "var(--muted)" };
  const status = institutions.find(
    (item) => item._id === account.itemId,
  )?.status;
  switch (status) {
    case "connected":
      return { label: "Connected", color: "var(--positive)" };
    case "syncing":
      return { label: "Updating", color: "var(--blue)" };
    case "error":
      return { label: "Needs attention", color: "var(--negative)" };
    case "disconnected":
      return { label: "Disconnected", color: "var(--muted)" };
    default:
      return { label: "Connection unavailable", color: "var(--muted)" };
  }
}
export function Accounts({ onAddAccount }: { onAddAccount: () => void }) {
  useAmountsHidden();
  const data = useData(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams(),
    [period, setPeriod] = useState("6M"),
    [showHidden, setShowHidden] = useState(false),
    [collapsed, setCollapsed] = useState<string[]>([]);
  const today = data.profile?.demo ? "2026-09-10" : localDate(),
    from = rangeStart(period, today),
    history = useQuery(api.workspace.balanceHistory, { from, to: today });
  const selected = data.accounts.find((a) => a._id === params.get("account"));
  const assets = data.accounts
      .filter((a) => a.kind !== "credit" && a.kind !== "loan")
      .reduce((sum, a) => sum + accountNetWorth(a), 0),
    liabilities = -data.accounts
      .filter((a) => a.kind === "credit" || a.kind === "loan")
      .reduce((sum, a) => sum + accountNetWorth(a), 0),
    netWorth = assets - liabilities;
  const chart = useMemo(() => {
    const included = new Map(
      data.accounts
        .filter((a) => !a.closed && !a.excludeNetWorth)
        .map((a) => [a._id, a]),
    );
    const days = new Map<string, Doc<"balances">[]>();
    for (const row of history?.rows ?? []) {
      if (!included.has(row.accountId)) continue;
      const same = days.get(row.date) ?? [];
      same.push(row);
      days.set(row.date, same);
    }
    const latest = new Map<Id<"accounts">, number>();
    return [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, rows]) => {
        for (const row of rows) latest.set(row.accountId, row.balanceCents);
        return {
          label: dateLabel(day, { month: "short", day: "numeric" }),
          value: [...latest.entries()].reduce(
            (sum, [id, value]) =>
              sum +
              (included.get(id)?.kind === "credit" ||
              included.get(id)?.kind === "loan"
                ? -value
                : value),
            0,
          ),
        };
      });
  }, [data.accounts, history]);
  const change =
      chart.length > 1 ? chart[chart.length - 1].value - chart[0].value : null,
    changePercent =
      change !== null && chart[0].value
        ? (change / Math.abs(chart[0].value)) * 100
        : null;
  const hiddenCount = data.accounts.filter((a) => a.hidden || a.closed).length;
  const open = (account: Doc<"accounts">) =>
    setParams({ account: account._id });
  function exportHistory() {
    if (history?.complete)
      download(
        `marten-balances-${from}-to-${today}.csv`,
        csv([
          ["Date", "Account", "Institution", "Balance"],
          ...history.rows.map((row) => {
            const a = data.accounts.find((a) => a._id === row.accountId);
            return [
              row.date,
              a?.name ?? "Account",
              a?.institution ?? "",
              (row.balanceCents / 100).toFixed(2),
            ];
          }),
        ]),
      );
  }
  return (
    <>
      <PageHeader title="Accounts">
        <Button
          icon={<Download size={16} />}
          onClick={exportHistory}
          disabled={!history?.rows.length || !history.complete}
        >
          Export balances
        </Button>
        <Button tone="primary" icon={<Plus size={16} />} onClick={onAddAccount}>
          Add account
        </Button>
      </PageHeader>
      {!data.accounts.length ? (
        <Panel>
          <Empty
            icon={<WalletCards size={28} />}
            title="See everything you own and owe"
            description="Add your first account to begin tracking your net worth."
            action={<Button onClick={onAddAccount}>Add an account</Button>}
          />
        </Panel>
      ) : (
        <>
          <Panel className="accounts-networth">
            <div className="accounts-networth-top">
              <div>
                <span className="eyebrow">NET WORTH</span>
                <h2 className="account-primary-total">
                  {money(netWorth, false)}
                </h2>
                {change !== null && (
                  <div
                    className={`account-change ${change >= 0 ? "positive" : "negative"}`}
                  >
                    {change >= 0 ? (
                      <ArrowUpRight size={16} />
                    ) : (
                      <ArrowDownRight size={16} />
                    )}
                    <strong>
                      {money(Math.abs(change), false)}{" "}
                      {changePercent !== null &&
                        `(${Math.abs(changePercent).toFixed(1)}%)`}
                    </strong>
                    <span>over this period</span>
                  </div>
                )}
              </div>
              <div
                className="period-control"
                aria-label="Balance history period"
              >
                {periods.map((value) => (
                  <button
                    key={value}
                    className={period === value ? "active" : ""}
                    onClick={() => setPeriod(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            {history === undefined ? (
              <Loading text="Loading balance history…" />
            ) : chart.length ? (
              <NetWorthChart
                data={chart}
                id="accounts-overview"
                revealKey={period}
              />
            ) : (
              <Empty
                title="Your history starts here"
                description="New balance updates will build your net worth chart. A balance export from another app fills in the past."
                action={
                  <Button
                    icon={<Upload size={15} />}
                    onClick={() => void navigate("/transactions?import=true")}
                  >
                    Import balance history
                  </Button>
                }
              />
            )}
            {history && !history.complete && (
              <div className="account-notice">
                This range contains too many balance updates. Choose a shorter
                period to see complete history.
              </div>
            )}
            <div className="accounts-chart-footer">
              <span>
                {data.profile?.demo
                  ? "Fictional sample balances · through Sep 10, 2026"
                  : `Updated ${dateLabel(today)}`}
              </span>
              <span>
                <span className="chart-dot" />
                Net worth
              </span>
            </div>
          </Panel>
          <div className="accounts-layout">
            <div className="accounts-main">
              <div className="accounts-section-heading">
                <h2>
                  All accounts <span>{data.accounts.length}</span>
                </h2>
                {hiddenCount > 0 && (
                  <button
                    className="text-button"
                    onClick={() => setShowHidden((v) => !v)}
                  >
                    <EyeOff size={14} />
                    {showHidden
                      ? "Hide closed & hidden"
                      : `Show ${hiddenCount} hidden & closed`}
                  </button>
                )}
              </div>
              {groups.map((group) => {
                const accounts = data.accounts.filter(
                  (a) =>
                    a.kind === group.kind &&
                    (showHidden || (!a.hidden && !a.closed)),
                );
                if (!accounts.length) return null;
                const total = accounts.reduce(
                    (sum, a) => sum + (a.closed ? 0 : a.balanceCents),
                    0,
                  ),
                  isCollapsed = collapsed.includes(group.kind);
                return (
                  <Panel className="account-group" key={group.kind}>
                    <button
                      className="account-group-title"
                      onClick={() =>
                        setCollapsed((values) =>
                          isCollapsed
                            ? values.filter((v) => v !== group.kind)
                            : [...values, group.kind],
                        )
                      }
                      aria-expanded={!isCollapsed}
                    >
                      <group.icon size={18} />
                      <h3>{group.name}</h3>
                      <span className="account-group-count">
                        {accounts.length}
                      </span>
                      <strong>{money(total)}</strong>
                      {isCollapsed ? (
                        <ChevronRight size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    {!isCollapsed && (
                      <div>
                        {accounts.map((account) => {
                          const accountHistory = (history?.rows ?? [])
                            .filter((r) => r.accountId === account._id)
                            .sort((a, b) => a.date.localeCompare(b.date))
                            .map((r) => ({
                              label: r.date,
                              value: r.balanceCents,
                            }));
                          return (
                            <button
                              className={`account-row ${account.closed || account.hidden ? "account-row-muted" : ""}`}
                              key={account._id}
                              onClick={() => open(account)}
                            >
                              <Avatar
                                name={account.institution}
                                logo={account.logoUrl}
                                color={
                                  account.institution === "Chase"
                                    ? "#1f65a3"
                                    : account.institution === "American Express"
                                      ? "#bb9460"
                                      : undefined
                                }
                              />
                              <span className="account-row-name">
                                <strong>{account.name}</strong>
                                <span>
                                  {account.institution}
                                  {account.mask && ` · ••${account.mask}`}
                                  {account.closed
                                    ? " · Closed"
                                    : account.hidden
                                      ? " · Hidden"
                                      : account.excludeNetWorth
                                        ? " · Excluded"
                                        : ""}
                                </span>
                              </span>
                              <div className="account-row-spark">
                                {accountHistory.length > 1 && (
                                  <NetWorthChart
                                    data={accountHistory}
                                    compact
                                    id={account._id}
                                    color={group.color}
                                  />
                                )}
                              </div>
                              <span className="account-row-value">
                                <strong>{money(account.balanceCents)}</strong>
                                <small>
                                  {
                                    accountConnection(
                                      account,
                                      data.institutions,
                                    ).label
                                  }
                                </small>
                              </span>
                              <ChevronRight size={16} />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </Panel>
                );
              })}
              <button className="account-add-row" onClick={onAddAccount}>
                <Plus size={17} />
                <span>Add another account</span>
              </button>
            </div>
            <aside className="accounts-summary">
              <Panel title="Your balance sheet">
                <div className="balance-sheet-total">
                  <div>
                    <span className="balance-sheet-dot assets" />
                    Assets
                  </div>
                  <strong>{money(assets, false)}</strong>
                </div>
                <div className="balance-sheet-bar">
                  <span
                    style={{
                      width: `${assets + liabilities > 0 ? (assets / (assets + liabilities)) * 100 : 0}%`,
                    }}
                  />
                </div>
                {groups
                  .filter((g) => !["credit", "loan"].includes(g.kind))
                  .map((g) => {
                    const amount = data.accounts
                      .filter((a) => a.kind === g.kind)
                      .reduce((sum, a) => sum + accountNetWorth(a), 0);
                    return amount !== 0 ? (
                      <div className="balance-sheet-line" key={g.kind}>
                        <span>
                          {g.kind === "investment"
                            ? "Retirement & brokerage"
                            : g.name}
                        </span>
                        <strong>{money(amount, false)}</strong>
                      </div>
                    ) : null;
                  })}
                <div className="balance-sheet-total liabilities">
                  <div>
                    <span className="balance-sheet-dot debt" />
                    Liabilities
                  </div>
                  <strong>{money(liabilities, false)}</strong>
                </div>
                {groups
                  .filter((g) => ["credit", "loan"].includes(g.kind))
                  .map((g) => {
                    const amount = -data.accounts
                      .filter((a) => a.kind === g.kind)
                      .reduce((sum, a) => sum + accountNetWorth(a), 0);
                    return amount !== 0 ? (
                      <div className="balance-sheet-line" key={g.kind}>
                        <span>{g.name}</span>
                        <strong>{money(amount, false)}</strong>
                      </div>
                    ) : null;
                  })}
                <div className="balance-sheet-net">
                  <span>Net worth</span>
                  <strong>{money(netWorth, false)}</strong>
                </div>
              </Panel>
            </aside>
          </div>
        </>
      )}
      {selected && (
        <AccountDetail
          account={selected}
          today={today}
          onClose={() => setParams({})}
        />
      )}
    </>
  );
}

function AccountDetail({
  account,
  today,
  onClose,
}: {
  account: Doc<"accounts">;
  today: string;
  onClose: () => void;
}) {
  useAmountsHidden();
  const data = useData();
  const connection = accountConnection(account, data.institutions);
  const navigate = useNavigate(),
    [tab, setTab] = useState("overview"),
    [editing, setEditing] = useState(false),
    [importing, setImporting] = useState(false),
    [merging, setMerging] = useState(false);
  const history = useQuery(api.workspace.balanceHistory, {
    accountId: account._id,
    from: rangeStart("1Y", today),
    to: today,
  });
  const chart = (history?.rows ?? []).map((row) => ({
    label: dateLabel(row.date, { month: "short", day: "numeric" }),
    value: row.balanceCents,
  }));
  const debt = account.kind === "credit" || account.kind === "loan",
    utilization = account.limitCents
      ? Math.max(0, (account.balanceCents / account.limitCents) * 100)
      : null;
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={account.name}
        drawer
        description={`${account.institution}${account.mask ? ` · ••${account.mask}` : ""}`}
      >
        <div className="account-detail-heading">
          <Avatar
            name={account.institution}
            logo={account.logoUrl}
            size="large"
          />
          <div>
            <span className="eyebrow">
              {debt ? "CURRENT AMOUNT OWED" : "CURRENT BALANCE"}
            </span>
            <h2>{money(account.balanceCents)}</h2>
          </div>
          <Button icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <div className="account-detail-status">
          <span
            className="status-dot"
            style={{
              background: account.closed ? "var(--muted)" : connection.color,
            }}
          />
          {account.closed
            ? "Closed account"
            : account.manual
              ? "Manually updated"
              : connection.label}
          <span>
            {account.simplefinConnectionId ? "Imported" : "Updated"}{" "}
            {new Date(account.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        {account.simplefinConnectionId && (
          <div className="account-notice">
            SimpleFIN imports run daily and on request from{" "}
            <a href="/settings/institutions#simplefin">Bank connections</a>.
            History completeness is unverified; pending activity, holdings, and
            statement minimums are not included.
            {account.simplefinUpdatedAt
              ? ` The provider last updated this balance ${new Date(account.simplefinUpdatedAt).toLocaleString()}.`
              : " The provider did not supply a balance update time."}
          </div>
        )}
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "overview", label: "Overview" },
            { value: "history", label: "Balance history" },
          ]}
        />
        {tab === "overview" ? (
          <div className="account-detail-content">
            <div className="account-detail-chart">
              {history === undefined ? (
                <Loading />
              ) : chart.length ? (
                <NetWorthChart data={chart} id={`detail-${account._id}`} />
              ) : (
                <Empty title="No balance history yet" />
              )}
            </div>
            {utilization !== null && (
              <div className="utilization">
                <div>
                  <span>Credit utilization</span>
                  <strong>{utilization.toFixed(1)}%</strong>
                </div>
                <div className="utilization-track">
                  <span style={{ width: `${Math.min(utilization, 100)}%` }} />
                </div>
                <small>
                  {money(account.balanceCents)} of {money(account.limitCents!)}{" "}
                  limit
                </small>
              </div>
            )}
            <dl className="account-facts">
              <div>
                <dt>Account type</dt>
                <dd>{account.subtype}</dd>
              </div>
              {account.availableCents !== undefined && (
                <div>
                  <dt>Available balance</dt>
                  <dd>{money(account.availableCents)}</dd>
                </div>
              )}
              {account.apy !== undefined && (
                <div>
                  <dt>Annual percentage yield</dt>
                  <dd>{account.apy.toFixed(2)}%</dd>
                </div>
              )}
              {account.statementCents !== undefined && (
                <div>
                  <dt>Statement balance</dt>
                  <dd>{money(account.statementCents)}</dd>
                </div>
              )}
              {account.minimumCents !== undefined && (
                <div>
                  <dt>Minimum payment</dt>
                  <dd>{money(account.minimumCents)}</dd>
                </div>
              )}
              {account.dueDate && (
                <div>
                  <dt>Payment due</dt>
                  <dd>{dateLabel(account.dueDate)}</dd>
                </div>
              )}
              {account.statementDate && (
                <div>
                  <dt>Statement date</dt>
                  <dd>{dateLabel(account.statementDate)}</dd>
                </div>
              )}
              <div>
                <dt>Included in net worth</dt>
                <dd>
                  {account.excludeNetWorth || account.closed ? "No" : "Yes"}
                </dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{account.currency}</dd>
              </div>
            </dl>
            <Button
              className="account-transactions-link"
              icon={<ArrowRight size={16} />}
              onClick={() => {
                onClose();
                void navigate(`/transactions?account=${account._id}`);
              }}
            >
              View transactions
            </Button>
            {account.manual && !account.closed && (
              <Button
                className="account-transactions-link"
                icon={<Merge size={16} />}
                onClick={() => setMerging(true)}
              >
                Merge into another account
              </Button>
            )}
          </div>
        ) : (
          <div className="account-detail-content">
            <div className="account-history-actions">
              <Button
                icon={<Download size={15} />}
                disabled={!history?.rows.length || !history.complete}
                onClick={() =>
                  download(
                    `marten-${account.name}-balances.csv`,
                    csv([
                      ["Date", "Balance"],
                      ...(history?.rows ?? []).map((row) => [
                        row.date,
                        (row.balanceCents / 100).toFixed(2),
                      ]),
                    ]),
                  )
                }
              >
                Export CSV
              </Button>
              <Button
                icon={<Upload size={15} />}
                onClick={() => setImporting(true)}
              >
                Import CSV
              </Button>
            </div>
            <p className="muted">
              Past year · {history?.rows.length ?? 0} balance updates
            </p>
            {history === undefined ? (
              <Loading />
            ) : (
              <div className="account-history-list">
                {[...history.rows].reverse().map((row) => (
                  <div key={row._id}>
                    <span>{dateLabel(row.date)}</span>
                    <strong>{money(row.balanceCents)}</strong>
                  </div>
                ))}
                {!history.rows.length && (
                  <Empty title="No balance history yet" />
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      {editing && (
        <Modal open onClose={() => setEditing(false)} title="Edit account">
          <AccountForm
            key={account._id}
            account={account}
            onSaved={() => setEditing(false)}
          />
        </Modal>
      )}
      {importing && (
        <BalanceImport account={account} onClose={() => setImporting(false)} />
      )}
      {merging && (
        <MergeAccount
          account={account}
          onClose={() => setMerging(false)}
          onMerged={() => {
            setMerging(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
/**
 * Folds a manually tracked account into another one. Typical use: history was
 * imported from a spreadsheet into a manual account, then the same bank
 * connected and created its own account. Spreadsheet rows that duplicate a
 * synced purchase enrich it instead of surviving as a second copy.
 */
function MergeAccount({
  account,
  onClose,
  onMerged,
}: {
  account: Doc<"accounts">;
  onClose: () => void;
  onMerged: () => void;
}) {
  useAmountsHidden();
  const data = useData(),
    merge = useMutation(api.workspace.mergeAccounts),
    [targetId, setTargetId] = useState(""),
    [progress, setProgress] = useState(""),
    { busy, run } = useTask();
  const targets = data.accounts
    .filter((a) => a._id !== account._id && !a.closed)
    .map((a) => ({ value: a._id, label: a.name, group: a.institution }));
  const target = data.accounts.find((a) => a._id === targetId);
  async function submit() {
    if (!target) return;
    const done = await run(async () => {
      let moved = 0,
        matched = 0;
      for (;;) {
        const step = await merge({
          sourceId: account._id,
          targetId: target._id,
        });
        moved += step.moved;
        matched += step.matched;
        setProgress(`Moved ${moved} records, combined ${matched} duplicates…`);
        if (step.done) break;
      }
    }, `Merged into ${target.name}`);
    if (done) onMerged();
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Merge into another account"
      description={`Move everything from ${account.name} into one account, then remove ${account.name}.`}
    >
      <div className="balance-import">
        <p>
          Transactions, balance history, recurring schedules, and saved reports
          move to the account you choose. A transaction imported from a
          spreadsheet that matches one already synced there (same amount, within
          three days) adds its notes, tags, category, and receipts to the synced
          transaction instead of staying as a duplicate.
        </p>
        <div className="account-notice">
          The chosen account keeps its own current balance and any balance it
          already has for a given day. This cannot be undone.
        </div>
        <Field label="Merge into">
          <Picker
            label="Account to merge into"
            value={targetId}
            onChange={setTargetId}
            options={targets}
            placeholder="Choose an account…"
            disabled={busy}
          />
        </Field>
        {progress && (
          <p role="status" className="muted">
            {progress}
          </p>
        )}
        <div className="modal-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            tone="danger"
            disabled={!target || busy}
            onClick={() => void submit()}
            icon={busy ? <Loader2 size={16} className="spin" /> : undefined}
          >
            {busy ? "Merging…" : `Merge and remove ${account.name}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
function BalanceImport({
  account,
  onClose,
}: {
  account: Doc<"accounts">;
  onClose: () => void;
}) {
  useAmountsHidden();
  const input = useRef<HTMLInputElement>(null),
    [rows, setRows] = useState<{ date: string; balanceCents: number }[]>([]),
    [filename, setFilename] = useState(""),
    importRows = useMutation(api.workspace.importBalances),
    { busy, run } = useTask();
  async function read(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 1024 * 1024)
        throw new Error("Choose a CSV smaller than 1 MB.");
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2)
        throw new Error(
          "The CSV needs a Date and Balance header with at least one row.",
        );
      const header = parsed[0].map((h) => h.trim().toLowerCase()),
        di = header.indexOf("date"),
        bi = header.indexOf("balance"),
        ai = header.indexOf("account");
      if (di < 0 || bi < 0)
        throw new Error("Use columns named Date and Balance.");
      // A multi-account export (such as Monarch's) contributes only this
      // account's rows here; the Transactions import handles every account.
      const ownRows =
        ai < 0
          ? parsed.slice(1)
          : parsed
              .slice(1)
              .filter(
                (values) =>
                  matchAccount(values[ai] ?? "", [account]) === account._id,
              );
      if (ai >= 0 && !ownRows.length)
        throw new Error(
          "No rows in this file belong to this account. To import several accounts at once, use Import on the Transactions page.",
        );
      // Monarch lists debts as negative balances; Marten stores the amount owed.
      const invert =
        ai >= 0 && (account.kind === "credit" || account.kind === "loan");
      const next = ownRows.map((values, index) => {
        const date = values[di]?.trim();
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date
        )
          throw new Error(`Row ${index + 2}: use YYYY-MM-DD for the date.`);
        const balanceCents = parseMoney(values[bi] ?? "");
        return { date, balanceCents: invert ? -balanceCents : balanceCents };
      });
      if (next.length > 5000)
        throw new Error("Import at most 5,000 dates at once.");
      setRows(next);
      setFilename(file.name);
    });
  }
  async function submit() {
    const success = await run(async () => {
      for (let i = 0; i < rows.length; i += 100)
        await importRows({
          accountId: account._id,
          rows: rows.slice(i, i + 100),
        });
    }, "Balance history imported");
    if (success) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Import balance history"
      description={`Add historical balances to ${account.name}.`}
    >
      <div className="balance-import">
        <p>
          Use a CSV with <strong>Date</strong> and <strong>Balance</strong>{" "}
          columns. Dates should use YYYY-MM-DD and balances should be dollar
          amounts. A Monarch Money balance export works too; only rows for this
          account are used.
        </p>
        <div className="account-notice">
          An imported date replaces its existing historical balance. Your
          current account balance stays unchanged.
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          aria-label="Choose balance CSV"
          onChange={(e) => void read(e.target.files?.[0])}
          hidden
        />
        <Button
          onClick={() => input.current?.click()}
          icon={<Upload size={16} />}
          disabled={busy}
        >
          {filename || "Choose CSV"}
        </Button>
        {rows.length > 0 && (
          <>
            <Field label={`${rows.length} balances ready to import`}>
              <div className="balance-preview">
                {rows.slice(0, 5).map((row, index) => (
                  <div key={index}>
                    <span>{row.date}</span>
                    <strong>{money(row.balanceCents)}</strong>
                  </div>
                ))}
              </div>
            </Field>
            <Button
              tone="primary"
              onClick={() => void submit()}
              disabled={busy}
              icon={
                busy ? <Loader2 size={16} className="spin" /> : <CheckIcon />
              }
            >
              {busy ? "Importing…" : `Import ${rows.length} balances`}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
function CheckIcon() {
  useAmountsHidden();
  return <ArrowRight size={16} />;
}
