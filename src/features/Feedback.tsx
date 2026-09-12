import { useEffect, useState } from "react";
import { Copy, ExternalLink, Check } from "lucide-react";
import { Button, Field, Modal, Tabs, useToast } from "../components/folio/ui";
import { site } from "../site/siteConfig";
import {
  buildIssueUrl,
  environmentDetails,
  issueMarkdown,
  type FeedbackKind,
} from "../lib/feedbackReport";
import "./feedback.css";

const kinds: { value: FeedbackKind; label: string }[] = [
  { value: "bug", label: "Something’s broken" },
  { value: "idea", label: "An idea" },
  { value: "question", label: "A question" },
];

/**
 * Collects a report and hands it to the public GitHub issue tracker, where
 * Drew reads everything first. Nothing is sent from Marten's servers; the
 * user reviews the prefilled issue on GitHub before posting it.
 */
export function FeedbackDialog({
  open,
  onClose,
  initialKind = "bug",
}: {
  open: boolean;
  onClose: () => void;
  initialKind?: FeedbackKind;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [includeEnvironment, setIncludeEnvironment] = useState(true);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setCopied(false);
    }
  }, [open, initialKind]);
  const environment = open ? environmentDetails() : null;
  const report = { kind, title, details, includeEnvironment };
  const placeholder = {
    bug: "What happened, and what did you expect instead? Steps help a lot.",
    idea: "What would you like Marten to do, and what are you trying to get done?",
    question: "What would you like to know?",
  }[kind];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send feedback"
      description="Opens a prefilled issue on Marten’s public GitHub tracker, where bugs and ideas are read first. Please leave out account numbers and other private details."
      className="feedback-modal"
    >
      <div className="form-stack">
        <Tabs
          pill
          value={kind}
          onChange={(value) => setKind(value as FeedbackKind)}
          items={kinds}
        />
        <Field label="Title">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              kind === "bug"
                ? "Short summary of the problem"
                : kind === "idea"
                  ? "Short summary of the idea"
                  : "Your question in one line"
            }
            maxLength={120}
          />
        </Field>
        <Field label="Details">
          <textarea
            rows={5}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder={placeholder}
          />
        </Field>
        {kind !== "idea" && environment && (
          <label className="feedback-environment">
            <input
              type="checkbox"
              checked={includeEnvironment}
              onChange={(event) => setIncludeEnvironment(event.target.checked)}
            />
            <span>
              <strong>Include device details</strong>
              <small>
                {environment.browser} on {environment.os} ·{" "}
                {environment.viewport} · {environment.theme} appearance ·{" "}
                {environment.where} · build {environment.build}. No account or
                financial data.
              </small>
            </span>
          </label>
        )}
        <div className="feedback-actions">
          <Button
            icon={copied ? <Check size={15} /> : <Copy size={15} />}
            onClick={() => {
              void navigator.clipboard
                .writeText(issueMarkdown(report))
                .then(() => {
                  setCopied(true);
                  toast("Copied. Paste it into a GitHub issue or an email.");
                })
                .catch(() => toast("Couldn’t copy on this device.", true));
            }}
          >
            {copied ? "Copied" : "Copy instead"}
          </Button>
          <a
            className="f-button primary"
            href={buildIssueUrl(report)}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              toast("Review the issue on GitHub, then submit it there.");
              onClose();
            }}
          >
            Continue on GitHub
            <ExternalLink size={15} />
          </a>
        </div>
        <p className="feedback-note">
          You’ll need a free GitHub account to post. Prefer not to?{" "}
          <a
            className="text-link"
            href={site.issues}
            target="_blank"
            rel="noreferrer"
          >
            Browse existing issues
          </a>{" "}
          or copy the report and send it another way.
        </p>
      </div>
    </Modal>
  );
}
