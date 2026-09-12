import { SupportContent } from "../features/support/SupportContent";
import { SiteLayout } from "./SiteLayout";
import { useDocumentTitle } from "./useDocumentTitle";

export function SupportPage() {
  useDocumentTitle(
    "Support Marten",
    "Marten is free and open source. Optional donations keep the hosted site running.",
  );
  return (
    <SiteLayout tone="paper">
      <div className="support">
        <SupportContent />
      </div>
    </SiteLayout>
  );
}
