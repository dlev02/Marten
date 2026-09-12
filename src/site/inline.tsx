import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fillTokens } from "./siteConfig";

/**
 * Renders the tiny inline grammar the content modules use: `[label](url)`
 * links and `**bold**`. Internal links (starting with "/") use the router so
 * they stay inside the single-page app; external ones open in a new tab.
 */
export function Inline({ text }: { text: string }) {
  const source = fillTokens(text);
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(source))) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    if (match[1] !== undefined) {
      const href = match[2];
      const external = /^https?:/.test(href);
      nodes.push(
        external ? (
          <a
            key={key++}
            href={href}
            className="site-link"
            target="_blank"
            rel="noreferrer"
          >
            {match[1]}
          </a>
        ) : (
          <Link key={key++} to={href} className="site-link">
            {match[1]}
          </Link>
        ),
      );
    } else {
      nodes.push(<strong key={key++}>{match[3]}</strong>);
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </>
  );
}
