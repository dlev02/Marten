export type SiteBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "callout"; text: string };
export type SiteSection = { id: string; heading: string; blocks: SiteBlock[] };
export type SiteDocument = {
  slug: string;
  title: string;
  summary: string;
  effective: string;
  sections: SiteSection[];
};
export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
  category:
    | "Getting started"
    | "Banks & data"
    | "Privacy & security"
    | "Hosting & open source"
    | "Support the project";
};
