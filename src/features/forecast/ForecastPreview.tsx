import { Plus } from "lucide-react";
import { Button } from "../../components/folio/ui";
import "./forecastPreview.css";

export function ForecastPreview({
  nearTerm = false,
  onAddAccount,
}: {
  nearTerm?: boolean;
  onAddAccount: () => void;
}) {
  return (
    <section
      className="panel forecast-preview"
      aria-label="Forecast getting started"
    >
      <div className="forecast-preview-art">
        <span className="forecast-preview-label">Preview</span>
        <svg viewBox="0 0 300 120" fill="none" aria-hidden="true">
          <path
            className="forecast-preview-grid"
            d="M0 30H300M0 65H300M0 100H300"
          />
          <path
            className="forecast-preview-line"
            d={
              nearTerm
                ? "M0 40H45V62H95V28H150V50H205V72H255V36H300"
                : "M0 100C80 100 120 68 170 55S250 30 300 18"
            }
          />
          {!nearTerm && (
            <path
              className="forecast-preview-alternative"
              d="M0 100C90 100 125 82 170 76S250 67 300 55"
            />
          )}
        </svg>
      </div>
      <div className="forecast-preview-copy">
        <h2>
          {nearTerm
            ? "See what’s ahead for your cash"
            : "Give your plans a starting point"}
        </h2>
        <p>
          {nearTerm
            ? "Add a USD checking or savings account to model your cash balance with scheduled payments and a spending allowance."
            : "Add accounts and transactions to inform your starting balances and monthly estimates, or build a scenario with your own amounts below."}
        </p>
        <Button tone="primary" icon={<Plus size={16} />} onClick={onAddAccount}>
          Add account
        </Button>
      </div>
    </section>
  );
}
