import { v } from "convex/values";
export const bankProvider = v.union(
  v.literal("simplefin"),
  v.literal("lunchflow"),
);
export type BankProvider = "simplefin" | "lunchflow";
export const providerName = (provider: BankProvider = "simplefin") =>
  provider === "lunchflow" ? "Lunch Flow" : "SimpleFIN";
