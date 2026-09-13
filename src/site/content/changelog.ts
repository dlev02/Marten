/**
 * Release notes for the public changelog. Newest first. Keep each item to one
 * plain sentence a household member would understand; link screens with the
 * same `[label](/path)` grammar the other site content uses.
 */
export type ChangeKind = "new" | "improved" | "fixed";
export type ChangeGroup = { kind: ChangeKind; items: string[] };
export type ChangelogEntry = {
  /** ISO date the changes reached marten.money. */
  date: string;
  /** Short editorial title, like a newspaper deck. */
  title: string;
  /** One paragraph of context before the lists. */
  lead: string;
  groups: ChangeGroup[];
};

export const changeKindLabels: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

export const changelog: ChangelogEntry[] = [
  {
    date: "2026-09-13",
    title: "Two new dashboard sections, and cards that know they are cards",
    lead: "A day spent on the dashboard and on the accounts SimpleFIN brings in. If a cash-back card ever arrived labeled as a checking account, this release is for you.",
    groups: [
      {
        kind: "new",
        items: [
          "An **Investments** section for the dashboard: portfolio value, the change over six months, unrealized gain, and holdings by type. Turn it on from **Customize**.",
          "A **Credit score** section with a gauge on the 300–850 scale, the score band for your model, and the change since your last entry.",
          "A single **date range** button on Reports with presets such as Last 3 months and Year to date, plus custom dates. Transactions uses the same control.",
          "**Choose avatar** beside Upload photo in Preferences, so the preset avatars no longer take up a whole row.",
          "This changelog.",
        ],
      },
      {
        kind: "improved",
        items: [
          "The loading screen shows the marten drawing itself, tail first.",
          "Recurring keeps type and status behind one **Filters** button, and its monthly figures read as rows on phones.",
          "The import sheet explains what your file needs in two short columns instead of a paragraph.",
          "The Investments period menu now matches the width of its button, the Accounts page dropped its note about update timing, and the Institutions page says once that connections are read-only.",
          "Buttons no longer stay lit after a tap on touch screens.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "SimpleFIN accounts named after a card, such as Blue Cash Everyday, Double Cash, or Aeroplan, are recognized as credit cards. A card-only issuer or an owed balance also counts.",
          "An imported SimpleFIN account can be corrected to a credit card or loan from Edit account; its balance and history flip to the amount owed and stay that way on the next import.",
          "Dragging a card in Customize dashboard no longer opens a horizontal scrollbar.",
        ],
      },
    ],
  },
  {
    date: "2026-09-12",
    title: "Statements, rules, and a fresh start",
    lead: "Fixes and refinements from the first day marten.money was open to the public, mostly around recurring bills, the rule editor, and importing.",
    groups: [
      {
        kind: "new",
        items: [
          "**Start fresh** in Preferences clears every account and transaction but keeps your sign-in.",
          "Credit scores can be read from a Discover statement PDF; the document never leaves your browser.",
          "Each report chart shows its transaction count with an info tip explaining how the period is counted.",
        ],
      },
      {
        kind: "improved",
        items: [
          "The rule editor lists each change as a row with a switch, including new merchant names.",
          "Customize dashboard arranges sections in the same two-column grid the dashboard uses.",
          "Brokerage trades stay out of Transactions unless you opt in from Preferences.",
          "Empty states, spacing, and button hover were tidied across settings and pages.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "The feedback dialog stays steady when switching between report types.",
          "SimpleFIN investment names such as stocks and mutual funds are classified correctly, while Investor Checking stays cash.",
        ],
      },
    ],
  },
];
