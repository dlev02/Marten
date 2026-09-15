import { useEffect } from "react";
import { useMutation, useQuery } from "../../lib/convex";
import { api } from "../../../convex/_generated/api";
import { useToast } from "../../components/folio/ui";

/** A job is shown while it reports progress; a silent one is treated as abandoned. */
const staleAfter = 15 * 60_000;

/**
 * Follows a spreadsheet import that runs on the server. Shows a small progress
 * card anywhere in the app while rows are saving, then a one-time note with
 * the outcome, even if the import finished while this tab was closed.
 */
export function ImportJobStatus() {
  const job = useQuery(api.imports.latest, {});
  const acknowledge = useMutation(api.imports.acknowledge);
  const toast = useToast();
  const jobId = job?._id,
    status = job?.status,
    acknowledged = job?.acknowledged;
  useEffect(() => {
    if (!job || job.acknowledged) return;
    if (job.status === "done")
      toast(
        job.kind === "balances"
          ? `${job.updates.toLocaleString()} balance ${job.updates === 1 ? "update" : "updates"} imported for ${job.accounts.toLocaleString()} ${job.accounts === 1 ? "account" : "accounts"}.`
          : `${job.inserted.toLocaleString()} ${job.inserted === 1 ? "transaction" : "transactions"} imported${job.matched ? `, ${job.matched.toLocaleString()} updated` : ""}${job.skipped ? `, ${job.skipped.toLocaleString()} already saved` : ""}.`,
      );
    else if (job.status === "failed")
      toast(`Import stopped: ${job.error ?? "something went wrong."}`, true);
    else return;
    void acknowledge({ jobId: job._id });
    // Only a change of job or outcome should announce again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, status, acknowledged]);
  if (
    !job ||
    (job.status !== "queued" && job.status !== "running") ||
    Date.now() - job.updatedAt > staleAfter
  )
    return null;
  const percent = Math.min(100, (job.processed / Math.max(1, job.total)) * 100);
  return (
    <div className="import-job-status" role="status" aria-live="polite">
      <div>
        <strong>
          Importing {job.kind === "balances" ? "balances" : "transactions"}…
        </strong>
        <span>
          {job.processed.toLocaleString()} of {job.total.toLocaleString()}
        </span>
      </div>
      <div className="import-progress-bar" aria-hidden="true">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
