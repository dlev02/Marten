import { useId, useState } from "react";
import { ArrowDown, ArrowRight, MoveDownRight } from "lucide-react";
import { money } from "../../lib/format";
import {
  buildMoneyFlow,
  condenseMoneyFlow,
  type MoneyFlowNode,
  type MoneyFlowSummary,
} from "../../lib/moneyFlow";
import "./moneyFlow.css";

const bandHeight = 184,
  gap = 30,
  top = 30;
function place(nodes: MoneyFlowNode[], total: number, height: number) {
  let cursor = top + (height - bandHeight - gap * (nodes.length - 1)) / 2;
  let center = top + (height - bandHeight) / 2;
  return nodes.map((node) => {
    const size = (bandHeight * node.value) / total;
    const result = { ...node, y: cursor, size, center };
    cursor += size + gap;
    center += size;
    return result;
  });
}
function ribbon(x1: number, y1: number, x2: number, y2: number, size: number) {
  const middle = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2} L ${x2} ${y2 + size} C ${middle} ${y2 + size}, ${middle} ${y1 + size}, ${x1} ${y1 + size} Z`;
}

/** Pass a fully loaded summarize() result; all amounts are signed integer cents. */
export function MoneyFlow(summary: MoneyFlowSummary) {
  const chartId = useId();
  const [active, setActive] = useState<MoneyFlowNode | null>(null);
  const flow = buildMoneyFlow(summary);
  if (!flow.valid)
    return (
      <div className="money-flow-empty">
        This breakdown could not be reconciled. Refresh the report or choose
        another period.
      </div>
    );
  if (!flow.total)
    return (
      <div className="money-flow-empty">
        <MoveDownRight size={24} />
        <strong>No net movement in this period</strong>
        <p>
          Income, expenses, and credits balance to zero within each category.
        </p>
      </div>
    );
  const sourceNodes = condenseMoneyFlow(flow.sources, "inflows");
  const destinationNodes = condenseMoneyFlow(flow.destinations, "outflows");
  const height =
    bandHeight +
    gap * (Math.max(sourceNodes.length, destinationNodes.length) - 1);
  const sources = place(sourceNodes, flow.total, height),
    destinations = place(destinationNodes, flow.total, height);
  const centerY = top + (height - bandHeight) / 2;
  const hovered = active
    ? ([
        ...flow.sources,
        ...flow.destinations,
        ...sourceNodes,
        ...destinationNodes,
      ].find((node) => node.id === active.id) ?? null)
    : null;
  return (
    <div className="money-flow">
      <div className="money-flow-heading">
        <span>Where it came from</span>
        <span>Where it went</span>
      </div>
      <div className="money-flow-desktop">
        <svg
          viewBox={`0 0 760 ${height + top * 2}`}
          role="group"
          aria-labelledby={`${chartId}-title`}
        >
          <title id={`${chartId}-title`}>
            Income, refunds, expenses, and money left over
          </title>
          <desc>
            Ribbon widths are proportional to exact amounts. Focus a category
            for its value. The complete breakdown is available under View all
            movements.
          </desc>
          {sources.map((node) => (
            <path
              key={`link:${node.id}`}
              d={ribbon(174, node.y, 375, node.center, node.size)}
              fill={node.color}
              fillOpacity={hovered && hovered.id !== node.id ? 0.12 : 0.28}
              className="money-flow-ribbon"
            />
          ))}
          {destinations.map((node) => (
            <path
              key={`link:${node.id}`}
              d={ribbon(385, node.center, 586, node.y, node.size)}
              fill={node.color}
              fillOpacity={hovered && hovered.id !== node.id ? 0.12 : 0.28}
              className="money-flow-ribbon"
            />
          ))}
          <rect
            x={375}
            y={centerY}
            width={10}
            height={bandHeight}
            rx={3}
            className="money-flow-center-bar"
          />
          <text
            x={380}
            y={centerY - 25}
            textAnchor="middle"
            className="money-flow-center-label"
          >
            Money available
          </text>
          <text
            x={380}
            y={centerY - 8}
            textAnchor="middle"
            className="money-flow-center-value"
          >
            {money(flow.total)}
          </text>
          {[
            { nodes: sources, side: "source" },
            { nodes: destinations, side: "destination" },
          ].map(({ nodes, side }) =>
            nodes.map((node) => {
              const left = side === "source",
                x = left ? 164 : 586,
                textX = left ? 0 : 609;
              return (
                <g
                  key={node.id}
                  tabIndex={0}
                  role="img"
                  aria-label={`${node.name}: ${money(node.value)}. ${node.detail}.`}
                  onMouseEnter={() => setActive(node)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(node)}
                  onBlur={() => setActive(null)}
                  className="money-flow-node"
                >
                  <title>
                    {node.name}: {money(node.value)} — {node.detail}
                  </title>
                  <rect
                    className="money-flow-focus"
                    x={left ? 0 : 580}
                    y={node.y + node.size / 2 - 19}
                    width={180}
                    height={38}
                    rx={5}
                  />
                  <rect
                    x={x}
                    y={node.y}
                    width={10}
                    height={node.size}
                    rx={Math.min(3, node.size / 2)}
                    fill={node.color}
                  />
                  <foreignObject
                    x={textX}
                    y={node.y + node.size / 2 - 15}
                    width={151}
                    height={32}
                  >
                    <div
                      className="money-flow-node-label"
                      style={{ textAlign: left ? "right" : "left" }}
                    >
                      <strong>{node.name}</strong>
                      <span>
                        {money(node.value)}
                        {node.kind === "refund"
                          ? " credit"
                          : node.kind === "reversal"
                            ? " reversal"
                            : ""}
                      </span>
                    </div>
                  </foreignObject>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <div className="money-flow-mobile">
        <MovementList title="Money in" nodes={sourceNodes} total={flow.total} />
        <div className="money-flow-mobile-total">
          <ArrowDown size={17} />
          <span>Money available</span>
          <strong>{money(flow.total)}</strong>
        </div>
        <MovementList
          title="Money out & left over"
          nodes={destinationNodes}
          total={flow.total}
        />
      </div>
      <div className="money-flow-insight" aria-live="polite">
        {hovered ? (
          <>
            <span
              className="money-flow-dot"
              style={{ background: hovered.color }}
            />
            <strong>{hovered.name}</strong>
            <span>{hovered.detail}</span>
            <b>{money(hovered.value)}</b>
          </>
        ) : (
          <>
            <ArrowRight size={15} />
            <span>
              {summary.savings < 0
                ? `Expenses exceed income by ${money(-summary.savings)}. The shortfall is covered by existing funds or borrowing.`
                : `${money(summary.savings)} left after expenses.`}
            </span>
          </>
        )}
      </div>
      <details className="money-flow-details">
        <summary>View all movements</summary>
        <div>
          <MovementList
            title="Money in"
            nodes={flow.sources}
            total={flow.total}
          />
          <MovementList
            title="Money out & left over"
            nodes={flow.destinations}
            total={flow.total}
          />
        </div>
      </details>
    </div>
  );
}

function MovementList({
  title,
  nodes,
  total,
}: {
  title: string;
  nodes: MoneyFlowNode[];
  total: number;
}) {
  return (
    <section className="money-flow-list">
      <h3>{title}</h3>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            <span
              className="money-flow-dot"
              style={{ background: node.color }}
            />
            <span>
              <strong>{node.name}</strong>
              <small>{node.detail}</small>
              <i
                style={{
                  width: `${(node.value / total) * 100}%`,
                  background: node.color,
                }}
              />
            </span>
            <b>{money(node.value)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
