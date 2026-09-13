import type { SiteDocument } from "./types";

export const aboutStory: SiteDocument = {
  slug: "about",
  title: "About Marten",
  summary:
    "Why I built a free finance app, what the name means, how it is paid for, and where the code lives.",
  layout: "essay",
  sections: [
    {
      id: "why-marten-exists",
      heading: "Why Marten exists",
      blocks: [
        {
          type: "p",
          text: "I'm a happy Monarch Money user. I have a lot of credit cards, I chase points and travel on them, and for me a paid finance app earns its keep. Then my parents and a few friends asked what they should use. They didn't want to chase points or model retirement scenarios; they wanted something simpler and free that beat a spreadsheet and didn't mean opening four or five bank apps to find out where things stood.",
        },
        {
          type: "p",
          text: "There was nothing to recommend. In the United States, bank data isn't open. Apps reach it through aggregators, and the free or self-hosted options mostly leave you typing in every purchase by hand. So I built the thing I wished I could point people to: a calm app that connects to your banks through a provider you choose, sorts your transactions, shows your bills and net worth, and stays out of the way. I run it for my family and share it with anyone who wants it.",
        },
        {
          type: "p",
          text: "It isn't trying to replace the full-featured paid apps. It's trying to be the good free one.",
        },
      ],
    },
    {
      id: "the-name",
      heading: "The name",
      blocks: [
        {
          type: "p",
          text: "A pine marten is a small, quick, curious animal from the forests of Europe and northern Asia, a relative of the weasel with a cream-colored bib and a long tail. It is alert, tidy, and keeps its den in order, which felt like the right temperament for something that looks after your money: pay attention, keep things neat, don't make a fuss.",
        },
        {
          type: "p",
          text: "The logo is a marten curled around itself, the way the animal sleeps, tucked in and settled. That's the feeling I'm going for.",
        },
      ],
    },
    {
      id: "how-its-funded",
      heading: "How it's funded",
      blocks: [
        {
          type: "p",
          text: "It isn't, really. Marten has no revenue, no investors, and no plan for either. The backend runs on Convex and the site on a static host, so the running costs are small: a domain name and my evenings. If it saves you a subscription and you want to say thanks, there's a [Ko-fi page](https://ko-fi.com/dlev384895). Donations cover the domain and are never required for anything.",
        },
      ],
    },
    {
      id: "open-source",
      heading: "Open source",
      blocks: [
        {
          type: "p",
          text: "The whole app is on GitHub at [github.com/dlev02/marten](https://github.com/dlev02/marten). You can read how it stores your data, report a bug, suggest a feature, or run your own copy with your own backend in about ten minutes using the [self-hosting guide](https://github.com/dlev02/marten/blob/main/docs/self-hosting.md). If you'd rather trust your own server than mine, that option is always there, and it's also the way to use Plaid with your own credentials.",
        },
      ],
    },
  ],
};
