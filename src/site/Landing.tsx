import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Code2,
  DoorOpen,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { SiteLayout } from "./SiteLayout";
import { useDocumentTitle } from "./useDocumentTitle";
import { site } from "./siteConfig";

type Scene = "hero" | "morning" | "midday" | "afternoon" | "evening" | "night";

/** A product screenshot inside a minimal browser chrome, in both themes. */
function Shot({
  name,
  alt,
  path,
  eager = false,
}: {
  name: string;
  alt: string;
  path: string;
  eager?: boolean;
}) {
  return (
    <div className="browser-frame">
      <div className="browser-frame-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>
          {site.url.replace(/^https?:\/\//, "")}
          {path}
        </span>
      </div>
      <img
        className="shot-light"
        src={`/site/${name}-light.webp`}
        width={1440}
        height={820}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
      <img
        className="shot-dark"
        src={`/site/${name}-dark.webp`}
        width={1440}
        height={820}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

const beats: {
  scene: Scene;
  time: string;
  title: string;
  lede: string;
  points: string[];
  shot: string;
  path: string;
  alt: string;
}[] = [
  {
    scene: "morning",
    time: "7:40 am",
    title: "Know what’s due before it hits.",
    lede: "Recurring finds your subscriptions and bills in the charges you already have, then lines them up on a calendar with what’s still to pay this month.",
    points: [
      "Repeating charges are detected and shown with their evidence; nothing is added without your say.",
      "Checkmarks track what’s paid. Whatever is left rolls into the near-term forecast.",
      "Card statement reminders carry the due date and minimum payment your bank reports.",
    ],
    shot: "recurring",
    path: "/recurring",
    alt: "Marten’s Recurring page listing September bills and paychecks by day, with planned payments and expected income totals.",
  },
  {
    scene: "midday",
    time: "12:15 pm",
    title: "Every purchase, sorted and searchable.",
    lede: "Transactions arrive categorized. Fix one and a rule can fix the rest. Split a receipt, attach the PDF, leave a note for later.",
    points: [
      "Import from Excel, CSV, or a Monarch Money export. Rows that match a bank transaction update it instead of duplicating it.",
      "Rules, splits, tags, and receipts live in a detail drawer that saves as you type.",
      "Search anything with ⌘K, from a merchant to a setting.",
    ],
    shot: "transactions",
    path: "/transactions",
    alt: "Marten’s Transactions page with grouped purchases, merchant logos, categories, and an open detail drawer.",
  },
  {
    scene: "afternoon",
    time: "4:30 pm",
    title: "See where it went, then click to see why.",
    lede: "Cash Flow and Reports turn the month into a picture. Choose a slice and the transactions behind it appear, with the total, the average, and the biggest one.",
    points: [
      "Spending, income, and cash flow by category, merchant, or account, over any date range.",
      "Refunds reduce their category and transfers stay out of spending, so the numbers hold up.",
      "Save a report you like and export it as CSV.",
    ],
    shot: "reports",
    path: "/reports",
    alt: "Marten’s Reports page showing a spending donut by category with a breakdown table and drilldown.",
  },
  {
    scene: "evening",
    time: "9:00 pm",
    title: "Plan the years, not just the month.",
    lede: "Net worth across every account, investment holdings and cost basis, and a forecast that compares retirement ages, trips per year, and what checking looks like before payday.",
    points: [
      "Net worth history from bank balances, or rebuilt from a balance export you already have.",
      "Long-term scenarios with every assumption in plain sight and today’s dollars on request.",
      "Near-term cash runway built from your own recurring items, one account at a time.",
    ],
    shot: "forecast",
    path: "/forecast",
    alt: "Marten’s Forecast page with a long-term projection curve, editable plan assumptions, and an annual ledger.",
  },
];

/** Reports which landmark section currently owns the viewport. */
function useScene(root: React.RefObject<HTMLDivElement | null>) {
  const [scene, setScene] = useState<Scene>("hero");
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const targets = container.querySelectorAll<HTMLElement>("[data-scene]");
    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) =>
          ratios.set(entry.target, entry.intersectionRatio),
        );
        let best: { scene: string; ratio: number } | null = null;
        ratios.forEach((ratio, element) => {
          const scene = (element as HTMLElement).dataset.scene;
          if (scene && (!best || ratio > best.ratio)) best = { scene, ratio };
        });
        if (best) setScene((best as { scene: Scene }).scene);
      },
      { threshold: [0, 0.15, 0.3, 0.5, 0.7, 1] },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [root]);
  return scene;
}

/** Fades each beat’s screenshot in once it scrolls into view. */
function useReveal(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const beatsInView = container.querySelectorAll<HTMLElement>(".beat");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    beatsInView.forEach((beat) => observer.observe(beat));
    return () => observer.disconnect();
  }, [root]);
}

export function Landing() {
  useDocumentTitle(
    "Marten · Free, open-source personal finance",
    "Marten is a free, open-source personal finance app. Connect your banks, see where the money goes, and plan what’s next. No ads, no data sales, no subscription.",
  );
  const root = useRef<HTMLDivElement>(null);
  const scene = useScene(root);
  useReveal(root);
  // The ground is painted by the site frame (header and footer included), so
  // the scene lives on that ancestor rather than on this section tree.
  useEffect(() => {
    const frame = root.current?.closest<HTMLElement>(".site");
    frame?.setAttribute("data-scene", scene);
    return () => frame?.removeAttribute("data-scene");
  }, [scene]);
  return (
    <SiteLayout>
      <div className="site-landing" ref={root}>
        <section className="hero" data-scene="hero">
          <div className="hero-copy">
            <h1>
              Your money, <em>in one calm place.</em>
            </h1>
            <p className="hero-lede">
              Marten is a free, open-source personal finance app. Connect your
              banks, see where the money goes, and plan what’s next. No ads, no
              data sales, no subscription.
            </p>
            <div className="hero-actions">
              <Link
                to="/sign-in?signup=1"
                className="site-button primary large"
              >
                Create a free account
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a
                href="/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="site-button ghost large"
              >
                Explore the demo
              </a>
            </div>
            <ul className="hero-facts">
              <li>
                <Check size={14} aria-hidden="true" /> Free, no ads
              </li>
              <li>
                <Check size={14} aria-hidden="true" /> Open source
              </li>
              <li>
                <Check size={14} aria-hidden="true" /> Use ours or self-host
              </li>
              <li>
                <Check size={14} aria-hidden="true" /> Plaid or SimpleFIN
              </li>
            </ul>
          </div>
          <figure className="hero-shot">
            <Shot
              name="dashboard"
              path="/dashboard"
              eager
              alt="Marten’s dashboard with net worth history, recent transactions, upcoming bills, and spending by category."
            />
          </figure>
        </section>

        <section className="day" id="features" aria-labelledby="day-title">
          <ol className="day-rail" aria-hidden="true">
            {beats.map((beat) => (
              <li
                key={beat.scene}
                className={scene === beat.scene ? "is-current" : ""}
              >
                {beat.time}
              </li>
            ))}
          </ol>
          <div className="day-intro">
            <h2 id="day-title">A day with Marten.</h2>
            <p>
              Money doesn’t happen all at once. Here’s how the app fits into an
              ordinary Tuesday.
            </p>
          </div>
          {beats.map((beat) => (
            <article
              key={beat.scene}
              className="beat"
              data-scene={beat.scene}
              aria-labelledby={`beat-${beat.scene}`}
            >
              <div className="beat-copy">
                <h2 id={`beat-${beat.scene}`}>
                  <span className="beat-time">{beat.time}</span>
                  {beat.title}
                </h2>
                <p>{beat.lede}</p>
                <ul className="beat-points">
                  {beat.points.map((point) => (
                    <li key={point}>
                      <Check size={15} aria-hidden="true" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <figure className="beat-shot">
                <Shot name={beat.shot} path={beat.path} alt={beat.alt} />
              </figure>
            </article>
          ))}
        </section>

        <section
          className="night"
          data-scene="night"
          aria-labelledby="night-title"
        >
          <div className="night-inner">
            <div>
              <h2 id="night-title">
                Yours, <em>and only yours.</em>
              </h2>
              <p className="night-lede">
                Marten is a passion project, not a business. That changes what
                it can promise.
              </p>
              <div className="night-brand" aria-hidden="true" />
            </div>
            <ul className="promise-list">
              <li>
                <BadgeCheck size={22} aria-hidden="true" />
                <div>
                  <strong>No ads, no data sales</strong>
                  <span>
                    Your financial data is never sold, advertised against, or
                    used to train anything. There is nothing to upsell.
                  </span>
                </div>
              </li>
              <li>
                <Code2 size={22} aria-hidden="true" />
                <div>
                  <strong>Open source</strong>
                  <span>
                    Read the code, file an issue, or run your own copy on a free
                    backend and a free static host.
                  </span>
                </div>
              </li>
              <li>
                <Landmark size={22} aria-hidden="true" />
                <div>
                  <strong>Your banks, your choice</strong>
                  <span>
                    Connect through Plaid, or bring your own SimpleFIN Bridge
                    token for about $1.50 a month paid to SimpleFIN. Marten
                    never sees a bank password.
                  </span>
                </div>
              </li>
              <li>
                <ShieldCheck size={22} aria-hidden="true" />
                <div>
                  <strong>Read-only by design</strong>
                  <span>
                    Marten shows balances and transactions. It cannot move
                    money, pay a bill, or trade anything.
                  </span>
                </div>
              </li>
              <li>
                <DoorOpen size={22} aria-hidden="true" />
                <div>
                  <strong>Leave any time</strong>
                  <span>
                    Export your transactions as CSV, disconnect a bank in one
                    click, or delete your account entirely.
                  </span>
                </div>
              </li>
            </ul>
          </div>
          <div className="ways">
            <h3>Two ways to run it</h3>
            <table className="ways-table">
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Cost</th>
                  <th scope="col">Bank connections</th>
                  <th scope="col">Good for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Use the hosted site</th>
                  <td data-label="Cost">
                    <strong>Free.</strong> Donations welcome, never required.
                  </td>
                  <td data-label="Bank connections">
                    Your own SimpleFIN Bridge subscription, or manual and
                    spreadsheet entry.
                  </td>
                  <td data-label="Good for">
                    Anyone who wants an account in two minutes.
                  </td>
                </tr>
                <tr>
                  <th scope="row">Run your own</th>
                  <td data-label="Cost">
                    <strong>Free tiers</strong> on Convex and Netlify cover a
                    household.
                  </td>
                  <td data-label="Bank connections">
                    Plaid’s free trial for your family’s banks, plus SimpleFIN.
                  </td>
                  <td data-label="Good for">
                    People who want the data on infrastructure they control.{" "}
                    <a
                      className="site-link"
                      href={`${site.github}#self-hosting`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Self-hosting guide
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="story">
            <h2>Why it exists</h2>
            <div>
              <p>
                I’m a happy Monarch Money user. But my parents and a few friends
                just wanted something simple and free that beat a spreadsheet,
                without opening five bank apps to find out where things stood.
              </p>
              <p>
                There wasn’t a good free one. So I built it for them, and now
                it’s here for you too.{" "}
                <Link to="/about" className="site-link">
                  Read the whole story
                </Link>
              </p>
            </div>
          </div>
          <div className="closing">
            <h2>Try it with fictional money first.</h2>
            <div className="hero-actions">
              <a
                href="/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="site-button primary large"
              >
                Explore the demo
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <Link to="/sign-in?signup=1" className="site-button ghost large">
                Create a free account
              </Link>
            </div>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
