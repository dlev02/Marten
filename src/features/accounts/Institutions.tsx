import { useState } from "react";
import { useAction, useQuery } from "../../lib/convex";
import {
  AlertCircle,
  ArrowUpRight,
  Landmark,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import { startPlaidFlow } from "../../lib/plaidLinkState";
import {
  Avatar,
  Button,
  Empty,
  Loading,
  Modal,
  Panel,
  useTask,
} from "../../components/folio/ui";
import "./accounts.css";
import { SimpleFinConnection } from "./SimpleFin";

export function Institutions({ onAddAccount }: { onAddAccount: () => void }) {
  const data = useData(),
    status = useQuery(api.plaid.status, {}),
    simplefin = useQuery(api.simplefin.status, {}),
    lunchflow = useQuery(api.simplefin.status, { provider: "lunchflow" }),
    sync = useAction(api.plaid.sync),
    disconnect = useAction(api.plaid.disconnect),
    createToken = useAction(api.plaid.createLinkToken),
    { busy, run } = useTask();
  const [confirm, setConfirm] = useState<Id<"plaidItems"> | null>(null);
  const disconnecting = status?.items.find((item) => item._id === confirm);
  async function reconnect(itemId: Id<"plaidItems">, investment: boolean) {
    await run(async () => {
      if (!data.profile) return;
      const result = await createToken({
        itemId,
        mode: investment ? "investments" : "transactions",
      });
      startPlaidFlow({
        ...result,
        kind: "update",
        itemId,
        userId: data.profile.userId,
      });
    });
  }
  async function revoke() {
    if (!confirm) return;
    const ok = await run(
      () => disconnect({ itemId: confirm }),
      "Bank disconnected. Your account history is saved.",
    );
    if (ok) setConfirm(null);
  }
  if (
    status === undefined ||
    simplefin === undefined ||
    lunchflow === undefined
  )
    return <Loading text="Loading bank connections…" />;
  return (
    <div className="institutions-settings">
      <div className="institutions-heading">
        <div>
          <h2>Institutions</h2>
          <p>
            Manage the banks connected to your workspace. Connections are
            read-only.
          </p>
        </div>
        <Button tone="primary" icon={<Plus size={16} />} onClick={onAddAccount}>
          Add connection
        </Button>
      </div>
      {status.environment === "sandbox" && status.items.length > 0 && (
        <div className="account-notice">
          Test connections are enabled. Connected balances and transactions are
          fictional.
        </div>
      )}
      {status.items.length === 0 &&
      !simplefin.connection &&
      !lunchflow.connection ? (
        <Panel>
          <Empty
            icon={<Landmark size={26} />}
            title="Connect your first bank"
            description="Choose SimpleFIN or Lunch Flow to bring in your accounts. Your connected services and their latest imports will appear here."
            action={
              <Button onClick={onAddAccount} icon={<Link2 size={16} />}>
                Connect a bank
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="institution-list">
          {status.items.map((item) => {
            const accounts = data.accounts.filter((a) => a.itemId === item._id),
              disconnected = item.status === "disconnected",
              syncing = item.status === "syncing";
            return (
              <Panel key={item._id} className="institution-card">
                <div className="institution-card-top">
                  <Avatar name={item.institution} logo={accounts[0]?.logoUrl} />
                  <div>
                    <h3>{item.institution}</h3>
                    <span>
                      {accounts.length}{" "}
                      {accounts.length === 1 ? "account" : "accounts"} ·{" "}
                      {item.syncedAt
                        ? `Updated ${new Date(item.syncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "Waiting for first sync"}
                    </span>
                  </div>
                  <span className={`institution-status ${item.status}`}>
                    {syncing && <Loader2 size={12} className="spin" />}
                    {item.status === "error" && <AlertCircle size={12} />}
                    {
                      {
                        connected: "Connected",
                        syncing: "Syncing",
                        error: "Needs attention",
                        disconnected: "Disconnected",
                      }[item.status]
                    }
                  </span>
                </div>
                {item.error && (
                  <div className="institution-error">
                    <AlertCircle size={16} />
                    <span>{item.error}</span>
                  </div>
                )}
                <div className="institution-accounts">
                  {accounts.map((account) => (
                    <a
                      key={account._id}
                      href={`/accounts?account=${account._id}`}
                    >
                      <span>
                        {account.name}
                        {account.mask && ` · ••${account.mask}`}
                      </span>
                      <ArrowUpRight size={13} />
                    </a>
                  ))}
                </div>
                <div className="institution-actions">
                  {!disconnected && (
                    <>
                      <Button
                        disabled={busy || syncing}
                        icon={
                          syncing ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )
                        }
                        onClick={() =>
                          void run(
                            () => sync({ itemId: item._id }),
                            "Sync requested",
                          )
                        }
                      >
                        {syncing ? "Syncing…" : "Sync now"}
                      </Button>
                      <Button
                        disabled={busy}
                        icon={<Link2 size={14} />}
                        onClick={() =>
                          void reconnect(
                            item._id,
                            !item.products.includes("transactions") &&
                              item.products.includes("investments"),
                          )
                        }
                      >
                        Reconnect
                      </Button>
                    </>
                  )}
                  {disconnected && !item.error ? (
                    <span className="muted">
                      History retained · no further updates
                    </span>
                  ) : (
                    <Button
                      tone="quiet"
                      disabled={busy}
                      icon={<Unplug size={14} />}
                      onClick={() => setConfirm(item._id)}
                    >
                      {disconnected ? "Retry disconnect" : "Disconnect"}
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      <SimpleFinConnection />
      <SimpleFinConnection provider="lunchflow" />
      {disconnecting && (
        <Modal
          open
          onClose={() => setConfirm(null)}
          title={`Disconnect ${disconnecting.institution}?`}
        >
          <div className="disconnect-confirm">
            <p>
              {disconnecting.status === "disconnected"
                ? "Marten stopped syncing, but the bank connection still needs to be revoked. Retry to finish disconnecting."
                : "Marten will revoke this connection and stop importing updates. Your saved accounts, balances, and transaction history will remain."}
            </p>
            <div className="account-form-footer">
              <Button onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                tone="danger"
                onClick={() => void revoke()}
                disabled={busy}
                icon={
                  busy ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Unplug size={16} />
                  )
                }
              >
                {busy ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
