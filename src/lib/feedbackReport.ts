import { site } from "../site/siteConfig";
import { isDemoSession } from "./demo";

export type FeedbackKind = "bug" | "idea" | "question";

declare const __MARTEN_BUILD__: string;

/** Rough, privacy-safe description of where Marten is running. */
export function environmentDetails() {
  const ua = navigator.userAgent;
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[0].replace("Edg/", "Edge ") ??
    /Firefox\/(\d+)/.exec(ua)?.[0].replace("/", " ") ??
    /Chrome\/(\d+)/.exec(ua)?.[0].replace("/", " ") ??
    /Version\/(\d+)[^ ]* Safari/.exec(ua)?.[1].replace(/^/, "Safari ") ??
    "Unknown browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  const theme = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
  const hosted = (() => {
    try {
      return window.location.hostname === new URL(site.url).hostname;
    } catch {
      return false;
    }
  })();
  const where = isDemoSession()
    ? "Demo mode"
    : hosted
      ? "Hosted Marten site"
      : "Self-hosted";
  return {
    browser,
    os,
    viewport: `${window.innerWidth}×${window.innerHeight} at ${window.devicePixelRatio}x`,
    theme,
    page: window.location.pathname,
    build: typeof __MARTEN_BUILD__ === "string" ? __MARTEN_BUILD__ : "dev",
    where,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  };
}

export function environmentSummary() {
  const env = environmentDetails();
  return [
    `Browser: ${env.browser} on ${env.os}${env.coarsePointer ? " (touch)" : ""}`,
    `Viewport: ${env.viewport}, ${env.theme} appearance`,
    `Page: ${env.page}`,
    `Build: ${env.build}`,
  ].join("\n");
}

/**
 * Prefills a GitHub issue form. Field names match the ids declared in
 * .github/ISSUE_TEMPLATE/*.yml; GitHub reads them from the query string.
 */
export function buildIssueUrl({
  kind,
  title,
  details,
  includeEnvironment,
}: {
  kind: FeedbackKind;
  title: string;
  details: string;
  includeEnvironment: boolean;
}) {
  const params = new URLSearchParams();
  if (title.trim()) params.set("title", title.trim());
  const body = details.trim();
  if (kind === "bug") {
    params.set("template", "bug_report.yml");
    if (body) params.set("what-happened", body);
    if (includeEnvironment) {
      params.set("environment", environmentSummary());
      params.set("data", environmentDetails().where);
    }
  } else if (kind === "idea") {
    params.set("template", "feature_request.yml");
    if (body) params.set("idea", body);
  } else {
    params.set("template", "question.yml");
    if (body) params.set("question", body);
    if (includeEnvironment) params.set("context", environmentSummary());
  }
  return `${site.issues}/new?${params.toString()}`;
}

/** A copy-and-paste fallback when the browser blocks the new tab. */
export function issueMarkdown({
  kind,
  title,
  details,
  includeEnvironment,
}: {
  kind: FeedbackKind;
  title: string;
  details: string;
  includeEnvironment: boolean;
}) {
  const heading = { bug: "Bug", idea: "Idea", question: "Question" }[kind];
  return [
    `### ${heading}: ${title.trim() || "(untitled)"}`,
    "",
    details.trim(),
    ...(includeEnvironment
      ? ["", "### Environment", environmentSummary()]
      : []),
  ].join("\n");
}
