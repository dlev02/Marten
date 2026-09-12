// Original Marten pictograms. 32-unit canvas, broad filled shapes, 2-unit details.
// The generated style exploration is in docs/design/category-icons/style-concept.png.
export const palette = {
  blue: "#356587",
  sky: "#83b8d5",
  sage: "#82947c",
  gold: "#c8a66a",
  clay: "#be806a",
  cream: "#ece4d3",
  ink: "#344956",
  pale: "#c6d6df",
};
const p = (d, color) => `<path d="${d}" fill="${palette[color]}"/>`;
const r = (x, y, w, h, color, rx = 2) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${palette[color]}"/>`;
const c = (x, y, radius, color) =>
  `<circle cx="${x}" cy="${y}" r="${radius}" fill="${palette[color]}"/>`;
const l = (d, color = "ink", width = 2) =>
  `<path d="${d}" fill="none" stroke="${palette[color]}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const coin = (x, y, radius = 5) =>
  c(x, y, radius, "gold") + l(`M${x} ${y - 2}v4`, "cream");
const wheel = (x, y) => c(x, y, 3.4, "ink") + c(x, y, 1.4, "cream");
const car = (color = "blue") =>
  p("M3 18 7 10Q8 8 12 8h7q3 0 5 4l3 5q3 1 3 4v3H2v-3q0-2 1-3Z", color) +
  p("M9 11h5v6H6Zm8 0h3l4 6h-7Z", "sky") +
  wheel(8, 24) +
  wheel(24, 24) +
  r(3, 19, 3, 2, "cream") +
  r(26, 19, 3, 2, "cream");
const house = () =>
  r(6, 13, 20, 15, "cream") +
  p("M3 14 14 4q2-2 4 0l11 10Z", "clay") +
  r(13, 19, 6, 9, "blue", 3) +
  r(8, 16, 3, 4, "sky", 1) +
  r(21, 16, 3, 4, "sky", 1) +
  r(22, 5, 4, 6, "clay", 1);
const shield = () =>
  p("M16 3Q10 7 5 8v9q0 8 11 13 11-5 11-13V8Q22 7 16 3Z", "blue") +
  p("M23 11Q22 18 16 21q-5 3-2 6-8-5-4-9 3-3 13-7Z", "sky");
const bag = () =>
  p(
    "M9 9 7 3l6 2 3-3 3 3 6-2-3 6q9 9 7 16-1 5-13 5S2 28 3 23Q3 17 9 9Z",
    "sage",
  ) +
  l("M10 10h12m-7 1-2 6m6-6 3 5", "ink", 2.5) +
  coin(24, 25, 6) +
  coin(16, 28, 3);
const card = () =>
  r(3, 6, 26, 21, "blue", 4) +
  r(3, 11, 26, 5, "ink", 0) +
  r(7, 20, 7, 3, "gold", 1) +
  r(21, 21, 4, 2, "pale", 1);
const monitor = () =>
  r(2, 4, 28, 20, "blue", 3) +
  r(5, 7, 22, 13, "sky", 1) +
  p("M8 18 14 11l5 4 5-6v11H5Z", "pale") +
  r(14, 24, 4, 4, "ink", 0) +
  r(9, 28, 14, 2, "ink", 1);
const parcel = () =>
  r(3, 6, 26, 23, "clay", 3) +
  r(14, 6, 4, 23, "cream", 0) +
  r(3, 12, 26, 3, "cream", 0) +
  r(21, 19, 5, 5, "pale", 1) +
  l("M6 24h4", "ink");
const book = () =>
  r(5, 3, 22, 27, "blue", 3) +
  r(8, 24, 19, 4, "cream", 1) +
  r(10, 3, 3, 19, "sky", 0) +
  l("M17 9h6m-6 5h4", "cream");
const leaf = () =>
  p("M16 28C4 25 3 16 5 9q12 0 11 14C15 9 21 4 29 3q2 16-12 21v5Z", "sage") +
  l("M16 28 9 16m7 8 8-13", "cream");
const suitcase = () =>
  l("M11 7V4h10v3", "ink", 3) +
  r(4, 7, 24, 21, "blue", 4) +
  r(9, 7, 3, 21, "sky", 0) +
  r(20, 7, 3, 21, "sky", 0) +
  r(8, 28, 4, 2, "ink", 1) +
  r(20, 28, 4, 2, "ink", 1);
const heart = (color = "clay") =>
  p("M16 28 5 17C-3 8 10-1 16 8 22-1 35 8 27 17Z", color);
const phone = () =>
  r(7, 2, 18, 28, "blue", 4) +
  r(10, 6, 12, 17, "sky", 1) +
  r(13, 25, 6, 2, "cream", 1);
const receipt = () =>
  p("M6 3h20v27l-4-2-3 2-3-2-3 2-3-2-4 2Z", "cream") +
  l("M11 9h10m-10 5h10m-10 5h5", "blue");
const arrow = () =>
  l("M4 10h23l-5-5m5 5-5 5", "blue", 3) + l("M28 22H5l5-5m-5 5 5 5", "sage", 3);
const bottle = () =>
  r(12, 3, 14, 4, "sage", 1) +
  r(15, 7, 8, 3, "cream", 0) +
  r(10, 10, 18, 19, "sage", 4) +
  r(13, 16, 12, 9, "cream", 2) +
  l("M16 19h6m-6 3h4", "ink");
const art = [];
function add(emoji, name, group, keywords, drawing, aliases = []) {
  art.push({ emoji, name, group, keywords, drawing, aliases });
}
add(
  "💵",
  "Paychecks",
  "Money",
  "salary income pay cash wages employee contract labor",
  r(2, 7, 28, 19, "sage", 3) +
    r(5, 10, 22, 13, "cream", 2) +
    c(16, 16.5, 5, "sage") +
    l("M16 14v5", "cream") +
    c(8, 16.5, 1, "sage") +
    c(24, 16.5, 1, "sage"),
);
add(
  "🌱",
  "Interest & growth",
  "Money",
  "interest savings investing investments returns dividends",
  r(8, 23, 16, 6, "clay", 2) +
    l("M16 24V12", "sage", 3) +
    p("M16 17Q3 19 4 6q12 0 12 11Zm0-5Q16 2 28 3q0 12-12 9Z", "sage"),
);
add(
  "💰",
  "Other income",
  "Money",
  "money bonus miscellaneous income pouch",
  bag(),
  ["✨"],
);
add(
  "💼",
  "Business income",
  "Money",
  "work freelance consulting business income",
  l("M11 9V5h10v4", "ink", 3) +
    r(3, 9, 26, 20, "blue", 3) +
    p("M3 11h26v8q-13 5-26 0Z", "sky") +
    r(14, 17, 4, 6, "gold", 1),
);
add(
  "🛒",
  "Resale",
  "Money",
  "resale ebay mercari selling marketplace online sales",
  l("M3 5h3l3 17h17", "ink", 2.5) +
    p("M7 9h23l-4 10H9Z", "sage") +
    wheel(12, 27) +
    wheel(24, 27) +
    r(13, 3, 10, 9, "clay", 1),
);
add(
  "🪙",
  "Cash back & rewards",
  "Money",
  "daily cash cashback rewards points rebates",
  coin(12, 21, 9) + coin(22, 10, 8) + l("M7 21h10", "cream"),
);
add(
  "🧾",
  "Reimbursements",
  "Money",
  "reimbursement reimbursements refund friends family shared expenses",
  receipt() + l("M18 25h11m-4-4 4 4-4 4", "sage", 3),
);
add(
  "🏧",
  "Cash & ATM",
  "Money",
  "cash atm withdrawal withdrawals cash machine",
  r(4, 3, 24, 22, "blue", 3) +
    r(8, 7, 16, 8, "sky", 1) +
    r(8, 18, 16, 3, "ink", 1) +
    r(11, 19, 10, 11, "sage", 1) +
    c(16, 25, 2, "cream"),
);
add(
  "🏦",
  "Banking & fees",
  "Money",
  "financial fees banking charges accounts bank",
  p("M2 10 16 2l14 8Z", "blue") +
    r(4, 11, 24, 3, "sky", 0) +
    [6, 14, 22].map((x) => r(x, 14, 4, 11, "cream", 0)).join("") +
    r(3, 25, 26, 4, "blue", 1),
);
add(
  "🏛️",
  "Taxes",
  "Money",
  "tax taxes government civic property income tax",
  receipt() + c(23, 24, 7, "blue") + l("M20 24h6m-3-3v6", "cream"),
);
add(
  "📆",
  "Loan payments",
  "Money",
  "loan repayment payments student debt financing",
  r(4, 5, 24, 24, "cream", 3) +
    r(4, 5, 24, 7, "blue", 2) +
    l("M10 3v5m12-5v5", "ink", 3) +
    coin(16, 21, 6),
);
add(
  "⚖️",
  "Balance & legal",
  "Money",
  "balance adjustments financial legal services law accounting",
  l("M16 4v23M6 10h20M8 10 3 20h10Zm16 0-5 10h10Z", "blue", 2) +
    p("M3 20q5 8 10 0Zm16 0q5 8 10 0Z", "sage") +
    r(10, 27, 12, 3, "blue", 1),
);
add(
  "🖋️",
  "Checks",
  "Money",
  "check cheque checks payment paper",
  r(2, 7, 27, 20, "cream", 2) +
    l("M6 12h6m-6 5h12m-12 5h9", "blue") +
    p("m18 25 2-6L28 7l3 2-8 13Z", "blue"),
);
add(
  "↔️",
  "Transfers",
  "Money",
  "transfer exchange movement between accounts",
  arrow(),
  ["🔁"],
);
add("💳", "Credit card", "Money", "credit card payment banking", card());
add(
  "🐷",
  "Savings",
  "Money",
  "savings fund emergency goals piggy bank",
  p(
    "M7 10Q4 4 10 6l4 2q10-3 14 6h3v9h-4l-2 5h-4l-1-4h-9l-1 4H6l-1-7Q0 15 7 10Z",
    "clay",
  ) +
    l("M13 11h7", "ink") +
    c(25, 16, 1.3, "ink") +
    l("M4 14Q0 11 2 9", "clay", 2.5),
);
add(
  "🏡",
  "Home",
  "Home & bills",
  "home house rent mortgage housing bnb",
  house(),
  ["🏠"],
);
add(
  "💡",
  "Utilities",
  "Home & bills",
  "utilities electricity energy light bulb",
  p("M10 22C10 18 5 17 5 11a11 11 0 0 1 22 0c0 6-5 7-5 11Z", "gold") +
    l("M12 12 16 16l4-4m-4 4v7", "cream") +
    r(11, 23, 10, 4, "ink", 1) +
    r(13, 28, 6, 2, "ink", 1),
);
add(
  "🌐",
  "Internet",
  "Home & bills",
  "internet cable network broadband wifi globe",
  c(16, 16, 13, "blue") +
    l("M3 16h26M5 10h22M5 22h22M16 3q-12 13 0 26M16 3q12 13 0 26", "sky", 1.8),
);
add("📱", "Phone", "Home & bills", "phone mobile cell telephone plan", phone());
add(
  "⚡",
  "Gas & electric",
  "Home & bills",
  "gas electric electricity power energy utilities",
  p("M18 2 5 19h10l-2 11L28 12H17Z", "gold"),
);
add(
  "💧",
  "Water",
  "Home & bills",
  "water plumbing utility bill",
  p("M16 2C13 9 5 14 5 21a11 11 0 0 0 22 0C27 14 19 9 16 2Z", "sky") +
    p("M9 19q-1 7 6 8 2 0 1-2-5-1-5-6-1-2-2 0Z", "cream"),
);
add(
  "🗑️",
  "Waste & recycling",
  "Home & bills",
  "trash garbage waste recycling disposal",
  r(7, 9, 18, 21, "sage", 3) +
    r(4, 5, 24, 4, "ink", 1) +
    r(12, 2, 8, 3, "ink", 1) +
    l("M12 14v10m8-10v10", "cream"),
);
add(
  "🔨",
  "Home improvement",
  "Home & bills",
  "home improvement repairs hardware renovation tools diy",
  p("M8 4h12l6 6-5 4-5-5h-4v5H5V7Z", "blue") +
    p("m15 8 5 4-10 18-5-3Z", "gold"),
);
add(
  "🪑",
  "Furniture",
  "Home & bills",
  "furniture housewares decor chair home furnishing",
  r(7, 3, 18, 15, "clay", 5) +
    r(4, 18, 24, 6, "clay", 2) +
    l("M8 24v6m16-6v6", "ink", 3) +
    l("M11 7h10", "cream"),
);
add(
  "🧹",
  "Cleaning",
  "Home & bills",
  "cleaning laundry housekeeping car wash supplies",
  l("M23 3 13 18", "ink", 3) +
    p("m9 14 10 6-5 10L2 23Z", "gold") +
    l("m8 20-3 5m8-2-3 5", "cream"),
);
add(
  "🏢",
  "Office rent",
  "Home & bills",
  "office rent business commercial workplace",
  r(6, 3, 20, 27, "blue", 2) +
    [8, 15, 22]
      .map((y) => r(10, y, 4, 4, "sky", 1) + r(18, y, 4, 4, "cream", 1))
      .join(""),
);
add(
  "🛡️",
  "Insurance",
  "Home & bills",
  "insurance security protection business insurance",
  shield(),
);
add(
  "🥑",
  "Groceries",
  "Food & drink",
  "groceries grocery food supermarket produce market",
  p(
    "M16 2C10 2 11 9 6 15C-3 27 9 31 16 30S33 25 26 15C21 8 22 2 16 2Z",
    "sage",
  ) +
    p("M16 5c-4 0-4 7-8 12-6 11 16 14 17 3 1-5-5-15-9-15Z", "cream") +
    c(16, 21, 6, "gold"),
  ["🍏", "🍞"],
);
add(
  "🍜",
  "Dining",
  "Food & drink",
  "restaurants restaurant bars dining food dinner takeaway meals",
  p("M3 14h26q-1 14-13 14T3 14Z", "clay") +
    r(2, 12, 28, 3, "cream", 1) +
    l("M9 3q-3 4 0 7m7-7q-3 4 0 7", "sage") +
    l("m22 3-4 9m10-7-6 7", "ink"),
  ["🍽️", "🍔"],
);
add(
  "☕",
  "Coffee & tea",
  "Food & drink",
  "coffee tea cafe drinks coffee shops",
  l("M24 11h2q8 6-2 10", "blue", 3) +
    p("M4 10h20v10q0 7-10 7T4 20Z", "blue") +
    r(2, 28, 25, 2, "ink", 1) +
    l("M10 3q-2 2 0 4m7-4q-2 2 0 4", "sage"),
);
add(
  "🥡",
  "Meal delivery",
  "Food & drink",
  "meal delivery takeout takeaway food delivery",
  p("M6 11h20l-3 18H9Z", "cream") +
    l("M7 12Q16-1 25 12", "ink") +
    r(11, 17, 10, 7, "clay", 2) +
    p("M14 18v5l5-2.5Z", "cream"),
);
add(
  "🍱",
  "Meal prep kits",
  "Food & drink",
  "meal prep kits bento lunch prepared food cooking",
  r(2, 5, 28, 23, "blue", 4) +
    r(5, 8, 11, 17, "cream", 2) +
    r(19, 8, 8, 7, "clay", 2) +
    r(19, 18, 8, 7, "sage", 2) +
    l("M8 12h5m-5 4h5m-5 4h5", "gold"),
);
add(
  "🍫",
  "Snacks & vending",
  "Food & drink",
  "vending machines snacks candy chocolate sweets convenience",
  r(7, 2, 18, 28, "clay", 2) +
    r(7, 17, 18, 13, "blue", 1) +
    [5, 11]
      .map((y) => r(10, y, 5, 4, "gold", 1) + r(17, y, 5, 4, "gold", 1))
      .join("") +
    p("m7 17 9 6 9-6Z", "cream"),
);
add(
  "🏪",
  "Convenience store",
  "Food & drink",
  "convenience store corner shop minimart quick mart",
  r(4, 13, 24, 16, "cream", 2) +
    p("M6 3h20l4 9H2Z", "clay") +
    p("M11 3h4l-1 9H8Zm9 0h3l3 9h-6Z", "cream") +
    r(7, 18, 7, 11, "blue", 2) +
    r(18, 17, 7, 6, "sky", 1),
);
add(
  "🍷",
  "Bars & drinks",
  "Food & drink",
  "bar bars drinks alcohol wine beer nightlife",
  p("M8 3h16v8q0 9-8 9t-8-9Z", "pale") +
    p("M9 10h14q1 8-7 8t-7-8Z", "clay") +
    l("M16 20v9M10 29h12", "ink"),
);
add(
  "🚙",
  "Car payments",
  "Transport",
  "car auto transport vehicle payment loan business auto expenses",
  car(),
  ["🚗"],
);
add(
  "⛽",
  "Fuel",
  "Transport",
  "gas gasoline fuel petrol station refuel",
  r(4, 3, 16, 26, "gold", 3) +
    r(7, 6, 10, 8, "cream", 2) +
    r(2, 28, 21, 3, "ink", 1) +
    l("M20 15q5-1 5 4v4q0 5 4 4V11l-5-5", "ink", 2.5) +
    p("M12 17q-7 8 0 9 7-1 0-9Z", "blue"),
);
add(
  "🚇",
  "Subway & trains",
  "Transport",
  "public transit subway metro train trains rail commuter",
  r(5, 2, 22, 25, "sage", 7) +
    r(12, 5, 8, 3, "cream", 1) +
    r(8, 10, 7, 9, "ink", 2) +
    r(17, 10, 7, 9, "ink", 2) +
    c(10, 23, 2, "cream") +
    c(22, 23, 2, "cream") +
    l("m10 27-4 4m16-4 4 4", "ink", 3),
  ["🚃", "🚊"],
);
add(
  "🚕",
  "Rideshare & taxis",
  "Transport",
  "rideshare ride shares taxi uber lyft cab business auto",
  car("gold") + r(12, 4, 9, 3, "ink", 1),
  ["🚖"],
);
add(
  "🛴",
  "Scooters",
  "Transport",
  "scooters scooter micromobility rideshare electric",
  wheel(7, 27) +
    wheel(26, 27) +
    l("M7 24h14l3-3-3-17h-5", "blue", 3) +
    l("M19 4h7", "ink", 3),
);
add(
  "🚌",
  "Bus",
  "Transport",
  "bus buses public transit transport coach",
  r(3, 3, 26, 25, "blue", 4) +
    r(6, 6, 20, 12, "sky", 2) +
    l("M16 6v12", "blue") +
    r(7, 22, 4, 3, "cream", 1) +
    r(21, 22, 4, 3, "cream", 1) +
    r(6, 28, 4, 3, "ink", 1) +
    r(22, 28, 4, 3, "ink", 1),
);
add(
  "🚲",
  "Cycling",
  "Transport",
  "cycling bicycle bike biking transport",
  l("M14 8h5m1-4h4l4 20m-20 0 7-12 9 12H8m7-12h10", "blue", 2) +
    l("M14 8 20 24", "sage", 2) +
    l(
      "M14 24a6 6 0 1 1-12 0 6 6 0 0 1 12 0m16 0a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
      "ink",
      2,
    ),
);
add(
  "🅿️",
  "Parking & tolls",
  "Transport",
  "parking tolls garage meter",
  r(4, 3, 24, 24, "blue", 4) +
    l("M12 22V9h6a4 4 0 0 1 0 8h-6", "cream", 3) +
    r(14, 27, 4, 4, "ink", 1),
);
add(
  "🔧",
  "Car maintenance",
  "Transport",
  "car maintenance mechanic repair service auto",
  p("M19 3q-7 3-4 10L3 25a3 3 0 0 0 4 4l12-12q10 3 11-9l-6 5-5-5Z", "sky") +
    c(6, 26, 1.5, "blue"),
);
add(
  "✈️",
  "Flights",
  "Travel",
  "flights airplane travel holiday vacation airline",
  p(
    "M14 3q2-4 4 0v9l12 8v4l-12-4v7l4 2v2l-6-1-6 1v-2l4-2v-7L2 24v-4l12-8Z",
    "blue",
  ) + p("M16 3v24l6 2v2l-6-1Z", "sky"),
);
add(
  "🏨",
  "Stays",
  "Travel",
  "hostels hotels airbnb bnbs accommodation lodging stays rooms vacation rental",
  r(5, 10, 22, 19, "cream", 1) +
    p("M3 10 8 4h16l5 6Z", "clay") +
    r(14, 21, 6, 8, "blue", 3) +
    [8, 16, 23].map((x) => r(x, 13, 3, 5, "blue", 1.5)).join("") +
    p("M2 29v-5q3-8 6 0v5Z", "sage"),
);
add(
  "☂️",
  "Travel insurance",
  "Travel",
  "travel insurance protection umbrella coverage",
  p("M2 17a14 14 0 0 1 28 0q-5-4-9 0-5-4-10 0-5-4-9 0Z", "sage") +
    p("M16 3q-5 4-5 14 5-4 10 0 0-10-5-14Z", "cream") +
    l("M16 17v9q0 6-6 3", "blue", 2.5),
);
add(
  "📲",
  "eSIM & roaming",
  "Travel",
  "e sim esim e-sim travel roaming data mobile phone",
  p("M9 2h11l6 6v21H6V5q0-3 3-3Z", "blue") +
    r(10, 14, 12, 11, "gold", 2) +
    l("M16 14v11m-6-5h12", "cream") +
    l("M11 7h6", "sky", 2),
);
add(
  "🧳",
  "Travel planning",
  "Travel",
  "travel subscriptions planning wanderlog roame luggage packing itinerary",
  suitcase(),
);
add(
  "🗺️",
  "Tours & activities",
  "Travel",
  "tours activities fun money experiences sightseeing attractions excursions",
  p("m2 6 9-3 10 3 9-3v24l-9 3-10-3-9 3Z", "cream") +
    p("m11 3 10 3v24l-10-3Z", "sage") +
    p("M25 10c0 4-5 8-5 8s-5-4-5-8a5 5 0 0 1 10 0Z", "clay") +
    c(20, 10, 2, "cream"),
);
add(
  "🏞️",
  "Souvenirs",
  "Travel",
  "shopping souvenirs keepsakes postcards travel memories",
  r(2, 5, 28, 23, "sky", 3) +
    c(23, 11, 3, "gold") +
    p("M2 25 12 11l8 12 4-5 6 7v3H2Z", "sage") +
    r(2, 26, 28, 3, "cream", 1),
);
add(
  "🛍️",
  "Shopping",
  "Shopping",
  "misc shopping retail stores purchases shopping bags",
  r(3, 12, 16, 18, "clay", 2) +
    r(17, 8, 13, 22, "gold", 2) +
    l("M7 14V9a4 4 0 0 1 8 0v5m6-4V5a3 3 0 0 1 6 0v5", "ink", 2),
);
add(
  "👕",
  "Clothing",
  "Shopping",
  "clothing clothes apparel shoes wardrobe fashion",
  p("M10 4q6 5 12 0l9 6-4 7-5-3v15H10V14l-5 3-4-7Z", "blue") +
    p("M11 4q5 4 10 0-1 9-10 0Z", "cream"),
);
add(
  "🖥️",
  "Electronics",
  "Shopping",
  "electronics computer laptop monitor hardware technology",
  monitor(),
);
add(
  "📦",
  "Postage & shipping",
  "Shopping",
  "postage shipping parcel package online orders amazon delivery mail",
  parcel(),
);
add(
  "🌿",
  "Herbs & edibles",
  "Shopping",
  "herbs herbal edibles botanicals plants",
  leaf(),
);
add(
  "👑",
  "Personal",
  "Shopping",
  "personal treats self care accessories",
  p("M4 9 10 14l6-11 6 11 6-5-3 17H7Z", "gold") +
    r(6, 26, 20, 4, "clay", 1) +
    c(16, 20, 2, "cream"),
);
add(
  "🛁",
  "Toiletries",
  "Health & care",
  "toiletries hygiene bath bathroom personal care soap",
  r(6, 13, 20, 17, "sky", 4) +
    r(12, 8, 8, 5, "blue", 1) +
    l("M16 8V4h9", "blue", 3) +
    r(10, 20, 12, 6, "cream", 2),
);
add("❤️", "Health", "Health & care", "health medical wellness care", heart());
add(
  "🏋️",
  "Fitness & gym",
  "Health & care",
  "fitness gym weights exercise workout sports strength",
  r(3, 8, 6, 17, "blue", 2) +
    r(23, 8, 6, 17, "blue", 2) +
    r(9, 14, 14, 5, "ink", 1) +
    r(1, 12, 3, 9, "sky", 1) +
    r(28, 12, 3, 9, "sky", 1) +
    r(5, 9, 2, 15, "sky", 1) +
    r(25, 9, 2, 15, "sky", 1),
  ["💪"],
);
add(
  "💊",
  "Pharmacy",
  "Health & care",
  "pharmacy medication medicine prescriptions drugstore vitamins",
  bottle() +
    p("M3 20 11 12q4-4 7 0 2 3-1 6l-8 10q-4 4-7 0-2-3 1-8Z", "cream") +
    p("m7 16 4-4q4-4 7 0 2 3-1 6l-3 4Z", "sky"),
);
add(
  "✂️",
  "Haircuts",
  "Health & care",
  "haircuts haircut hairdresser barber salon grooming comb",
  l("M9 23 25 4M12 7l13 20", "gold", 3) +
    c(7, 25, 5, "gold") +
    c(7, 25, 2.5, "cream") +
    c(26, 26, 4, "gold") +
    c(26, 26, 2, "cream") +
    p("M3 3h6v14H6V6H3Z", "blue") +
    l("M3 6h5M3 9h5M3 12h5M3 15h5", "blue"),
  ["🪮"],
);
add(
  "🦷",
  "Dental",
  "Health & care",
  "dentist dental teeth orthodontist tooth",
  p("M16 5C-1-3 3 17 7 27q3 7 6-3 3-9 6 0 3 10 6 3 9-29-9-22Z", "sky") +
    l("M12 9q4 2 8 0", "cream", 2),
);
add(
  "🩺",
  "Doctor visits",
  "Health & care",
  "medical doctor visits clinic appointments healthcare hospital",
  l("M5 4v8a7 7 0 0 0 14 0V4M12 20v3a7 7 0 0 0 14 0v-4", "blue", 2.5) +
    r(3, 2, 4, 5, "ink", 1.5) +
    r(17, 2, 4, 5, "ink", 1.5) +
    c(26, 15, 5, "sage") +
    c(26, 15, 2, "cream"),
);
add(
  "👓",
  "Vision",
  "Health & care",
  "vision optician glasses eye exams contacts",
  l("M3 18 5 8h3m21 10-2-10h-3M13 20q3-4 6 0", "blue", 2.5) +
    r(2, 15, 11, 11, "sky", 4) +
    r(19, 15, 11, 11, "sky", 4) +
    r(4, 17, 7, 7, "cream", 2) +
    r(21, 17, 7, 7, "cream", 2),
);
add(
  "🎟️",
  "Entertainment",
  "Leisure",
  "entertainment cinema movies music events tickets admission",
  p("M3 7h26v6q-6 3 0 6v6H3v-6q6-3 0-6Z", "clay") +
    l("M21 9v3m0 4v3m0 4v1", "cream") +
    r(9, 12, 7, 8, "cream", 1),
);
add(
  "🎮",
  "Gaming",
  "Leisure",
  "gaming video games consoles playstation xbox nintendo steam",
  p(
    "M10 7q6 3 12 0 6-1 9 16 2 11-9 1H10C-1 34 0 24 2 18 4 10 5 6 10 7Z",
    "blue",
  ) +
    l("M9 12v8m-4-4h8", "sky", 3) +
    c(24, 13, 1.6, "sky") +
    c(27, 17, 1.6, "sky") +
    c(21, 17, 1.6, "sky") +
    c(24, 21, 1.6, "sky"),
);
add(
  "🎭",
  "Theater",
  "Leisure",
  "theater theatre performances shows musical broadway live",
  p("M2 3q8 4 16 0v11q-1 11-8 12-8-3-8-12Z", "blue") +
    l("M6 10h2m4 0h2m-8 7q4 4 8 0", "cream") +
    p("M17 10q6 3 13 0v11q0 8-6 10-7-2-7-10Z", "clay") +
    l("M20 17h1m5 0h1m-7 7q4-3 7 0", "cream"),
);
add(
  "📺",
  "Streaming services",
  "Leisure",
  "streaming services subscriptions tv television movies netflix",
  r(2, 8, 28, 21, "blue", 4) +
    r(5, 11, 22, 15, "sky", 2) +
    p("m13 14 8 5-8 5Z", "cream") +
    l("M10 2 16 8l6-6", "ink", 2),
);
add(
  "🍿",
  "Movies & virtual events",
  "Leisure",
  "virtual movies events cinema popcorn entertainment",
  p("M5 11h22l-3 19H8Z", "clay") +
    p("m10 11 2 19h3V11Zm8 0v19h3l2-19Z", "cream") +
    c(8, 9, 5, "cream") +
    c(16, 6, 6, "gold") +
    c(24, 9, 5, "cream") +
    c(16, 12, 5, "cream"),
);
add(
  "🎳",
  "Bowling & activities",
  "Leisure",
  "activities bowling recreation fun games leisure",
  p("M9 3c7-1 0 10 4 15 10 17-15 17-11 5 2-8 7-9 5-15-1-3 0-4 2-5Z", "cream") +
    r(7, 11, 5, 3, "clay", 1) +
    c(23, 23, 8, "blue") +
    c(22, 19, 1, "sky") +
    c(25, 21, 1, "sky") +
    c(21, 23, 1, "sky"),
);
add(
  "🎧",
  "Music & audio",
  "Leisure",
  "music audio headphones podcasts concerts listening",
  l("M5 20v-6a11 11 0 0 1 22 0v6", "blue", 4) +
    r(2, 16, 8, 13, "sage", 3) +
    r(22, 16, 8, 13, "sage", 3) +
    r(8, 18, 3, 9, "cream", 1) +
    r(21, 18, 3, 9, "cream", 1),
);
add(
  "🏕️",
  "Outdoors",
  "Leisure",
  "outdoors camping hiking hiking gear nature recreation tent",
  p("M16 4 31 28H1Z", "sage") +
    p("M16 4v24H4Z", "cream") +
    p("m16 14 8 14H8Z", "blue") +
    l("M16 3v25", "ink", 1.8),
);
add(
  "🐾",
  "Pets",
  "Leisure",
  "pets pet dog cat veterinary vet animal food care",
  p("M9 18q7-11 14 0 10 14-7 9-16 5-7-9Z", "sage") +
    c(5, 12, 4, "sage") +
    c(12, 6, 4, "sage") +
    c(22, 6, 4, "sage") +
    c(28, 13, 3.5, "sage"),
);
add(
  "📚",
  "Books & learning",
  "Learning & work",
  "education educational material textbooks books classes courses training school",
  book(),
  ["🏫"],
);
add(
  "🎓",
  "Student loans",
  "Learning & work",
  "student loans tuition university college education graduation",
  p("M1 10 16 3l15 7-15 7Z", "blue") +
    p("M7 15v8q9 8 18 0v-8l-9 4Z", "sage") +
    l("M28 12v12", "gold", 2) +
    r(26, 24, 4, 5, "gold", 1),
);
add(
  "🧩",
  "APIs & development",
  "Learning & work",
  "apis api development developer programming code tools integrations",
  p(
    "M3 4h10q-3 8 3 8t3-8h10v10q-8-3-8 3t8 3v10H18q3-8-3-8t-3 8H3V20q8 3 8-3t-8-3Z",
    "blue",
  ) + c(24, 25, 2, "sky"),
);
add(
  "🧠",
  "AI assistants",
  "Learning & work",
  "ai assistants artificial intelligence models chatgpt claude assistant tools",
  p(
    "M15 5C9-1 5 4 6 8-1 9 1 15 3 17-3 23 6 29 10 27q2 5 5 1Zm2 0c6-6 10-1 9 3 7 1 5 7 3 9 6 6-3 12-7 10q-2 5-5 1Z",
    "sage",
  ) + l("M8 9q5 0 4 5M5 20q6-2 7 3m12-14q-5 0-4 5m7 6q-6-2-7 3", "cream"),
);
add(
  "🔲",
  "Digital services & apps",
  "Learning & work",
  "digital services apps software applications subscriptions",
  r(3, 3, 11, 11, "blue", 3) +
    r(18, 3, 11, 11, "sage", 3) +
    r(3, 18, 11, 11, "clay", 3) +
    r(18, 18, 11, 11, "gold", 3),
);
add(
  "🕸️",
  "Website domains",
  "Learning & work",
  "website domains hosting domain web url dns",
  r(2, 4, 28, 24, "blue", 3) +
    r(2, 4, 28, 6, "sky", 3) +
    c(6, 7, 1, "cream") +
    c(10, 7, 1, "cream") +
    l("m11 15-5 4 5 4m10-8 5 4-5 4m-4-9-2 11", "cream"),
);
add(
  "📎",
  "Office supplies",
  "Learning & work",
  "office supplies business expenses stationery supplies projects",
  l("M12 15 21 6c6-6 13 2 7 8L14 28C4 37-5 24 3 16L17 3", "blue", 3) +
    l("M8 18 21 5", "sky", 2.5),
);
add(
  "📣",
  "Advertising",
  "Learning & work",
  "advertising promotion marketing business ads",
  p("M4 12h9L28 4v24l-15-8H4Z", "gold") +
    p("M8 20h6l3 9H9Z", "ink") +
    r(3, 11, 7, 10, "clay", 2) +
    r(26, 3, 4, 26, "blue", 2),
);
add(
  "🎗️",
  "Charity",
  "Family & giving",
  "charity charitable donations giving nonprofit support",
  p("M11 3q5-3 10 0l4 7-6 9 7 8-7 3-6-10-7 9-5-5 11-14Z", "sage") +
    p("M11 3q5 7 10 0l4 7-6 9-4-6 5-6q-4 2-9-4Z", "cream"),
);
add(
  "🎁",
  "Gifts",
  "Family & giving",
  "gifts presents birthday holiday giving",
  r(4, 13, 24, 17, "clay", 2) +
    r(2, 9, 28, 6, "clay", 2) +
    r(14, 9, 4, 21, "cream", 0) +
    l("M16 9C0 10 6-6 16 9c16 1 10-15 0 0Z", "gold", 3),
);
add(
  "⚽",
  "Sports & child activities",
  "Family & giving",
  "child activities sports soccer football kids recreation",
  c(16, 16, 14, "cream") +
    p("m16 9 7 5-3 9h-8l-3-9Z", "blue") +
    p(
      "m4 8 5 6-4 7-3-2Zm24 0-5 6 4 7 3-2ZM10 29l2-6h8l2 6ZM12 2l4 7 4-7Z",
      "blue",
    ),
);
add(
  "🧸",
  "Child care",
  "Family & giving",
  "child care childcare daycare babysitting baby children kids toys",
  c(7, 7, 5, "gold") +
    c(25, 7, 5, "gold") +
    c(16, 13, 11, "gold") +
    r(6, 21, 20, 10, "gold", 5) +
    c(12, 12, 1.3, "ink") +
    c(20, 12, 1.3, "ink") +
    r(11, 16, 10, 6, "cream", 3) +
    c(16, 17, 1.6, "ink") +
    r(12, 24, 8, 5, "cream", 3),
  ["👶"],
);
add(
  "🔄",
  "Subscriptions",
  "Everyday",
  "subscriptions subscription recurring repeat memberships renewals",
  l("M27 11A12 12 0 0 0 5 8m0-5v6h6", "blue", 3) +
    l("M5 21a12 12 0 0 0 22 3m0 5v-6h-6", "sage", 3),
);
add(
  "📁",
  "General",
  "Everyday",
  "other uncategorized general miscellaneous filing folder organization",
  p("M2 6q0-3 3-3h7l4 4h11q3 0 3 3v18H2Z", "gold") +
    p("M2 13h28l-3 15H2Z", "cream"),
  ["❓", "💲"],
);
export const categoryArt = art;
