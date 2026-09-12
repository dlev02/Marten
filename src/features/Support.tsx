import { useState } from "react";
import { PageHeader } from "../components/folio/PageHeader";
import { SupportContent } from "./support/SupportContent";
import { FeedbackDialog } from "./Feedback";

/** In-app "Support Marten" screen, reached from the sidebar. */
export function Support() {
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <PageHeader title="Support Marten" />
      <SupportContent compact onFeedback={() => setFeedback(true)} />
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} />
    </>
  );
}
