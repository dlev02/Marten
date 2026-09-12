import type { ReactNode } from "react";

/** Decorative shapes only: this illustration never stands in for account data. */
export function InvestmentPreviewChart() {
  return (
    <div className="investment-preview-chart">
      <span className="investment-preview-label">Preview</span>
      <svg viewBox="0 0 500 150" fill="none" aria-hidden="true">
        <path
          className="investment-preview-grid"
          d="M0 30H500M0 75H500M0 120H500"
        />
        <path
          className="investment-preview-line"
          d="M0 118L50 108L100 112L150 84L200 94L250 66L300 73L350 42L400 52L450 29L500 35"
        />
      </svg>
    </div>
  );
}

export function InvestmentPreview({ action }: { action: ReactNode }) {
  return (
    <section
      className="panel investment-preview"
      aria-labelledby="investment-preview-title"
    >
      <div className="investment-preview-art">
        <InvestmentPreviewChart />
        <div className="investment-preview-cards" aria-hidden="true">
          <div>
            <i />
            <span />
          </div>
          <div>
            <i />
            <span />
          </div>
          <div>
            <i />
            <span />
          </div>
        </div>
      </div>
      <div className="investment-preview-copy">
        <h2 id="investment-preview-title">Your portfolio, in perspective</h2>
        <p>
          Add an investment account to track its balance over time, with
          holdings and allocation when your connected institution provides them.
        </p>
        {action}
      </div>
    </section>
  );
}
