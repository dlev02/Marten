/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentAccess from "../agentAccess.js";
import type * as agentHttp from "../agentHttp.js";
import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as creditScores from "../creditScores.js";
import type * as crons from "../crons.js";
import type * as forecasting from "../forecasting.js";
import type * as http from "../http.js";
import type * as investmentInternal from "../investmentInternal.js";
import type * as investments from "../investments.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_agentAuth from "../lib/agentAuth.js";
import type * as lib_agentCall from "../lib/agentCall.js";
import type * as lib_agentConfig from "../lib/agentConfig.js";
import type * as lib_agentExecution from "../lib/agentExecution.js";
import type * as lib_agentLimits from "../lib/agentLimits.js";
import type * as lib_agentTools from "../lib/agentTools.js";
import type * as lib_creditScores from "../lib/creditScores.js";
import type * as lib_finance from "../lib/finance.js";
import type * as lib_forecast from "../lib/forecast.js";
import type * as lib_forecastValidators from "../lib/forecastValidators.js";
import type * as lib_investmentData from "../lib/investmentData.js";
import type * as lib_investmentSample from "../lib/investmentSample.js";
import type * as lib_investmentSync from "../lib/investmentSync.js";
import type * as lib_passwordReset from "../lib/passwordReset.js";
import type * as lib_plaidApi from "../lib/plaidApi.js";
import type * as lib_recurring from "../lib/recurring.js";
import type * as lib_recurringDetection from "../lib/recurringDetection.js";
import type * as lib_reminderEmail from "../lib/reminderEmail.js";
import type * as lib_reminders from "../lib/reminders.js";
import type * as lib_resetLimits from "../lib/resetLimits.js";
import type * as lib_sophtronApi from "../lib/sophtronApi.js";
import type * as lib_transactions from "../lib/transactions.js";
import type * as plaid from "../plaid.js";
import type * as plaidInternal from "../plaidInternal.js";
import type * as recurring from "../recurring.js";
import type * as reminderDelivery from "../reminderDelivery.js";
import type * as reminders from "../reminders.js";
import type * as sample from "../sample.js";
import type * as settings from "../settings.js";
import type * as sophtron from "../sophtron.js";
import type * as sophtronInternal from "../sophtronInternal.js";
import type * as transactions from "../transactions.js";
import type * as validators from "../validators.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentAccess: typeof agentAccess;
  agentHttp: typeof agentHttp;
  auth: typeof auth;
  authEmail: typeof authEmail;
  creditScores: typeof creditScores;
  crons: typeof crons;
  forecasting: typeof forecasting;
  http: typeof http;
  investmentInternal: typeof investmentInternal;
  investments: typeof investments;
  "lib/access": typeof lib_access;
  "lib/agentAuth": typeof lib_agentAuth;
  "lib/agentCall": typeof lib_agentCall;
  "lib/agentConfig": typeof lib_agentConfig;
  "lib/agentExecution": typeof lib_agentExecution;
  "lib/agentLimits": typeof lib_agentLimits;
  "lib/agentTools": typeof lib_agentTools;
  "lib/creditScores": typeof lib_creditScores;
  "lib/finance": typeof lib_finance;
  "lib/forecast": typeof lib_forecast;
  "lib/forecastValidators": typeof lib_forecastValidators;
  "lib/investmentData": typeof lib_investmentData;
  "lib/investmentSample": typeof lib_investmentSample;
  "lib/investmentSync": typeof lib_investmentSync;
  "lib/passwordReset": typeof lib_passwordReset;
  "lib/plaidApi": typeof lib_plaidApi;
  "lib/recurring": typeof lib_recurring;
  "lib/recurringDetection": typeof lib_recurringDetection;
  "lib/reminderEmail": typeof lib_reminderEmail;
  "lib/reminders": typeof lib_reminders;
  "lib/resetLimits": typeof lib_resetLimits;
  "lib/sophtronApi": typeof lib_sophtronApi;
  "lib/transactions": typeof lib_transactions;
  plaid: typeof plaid;
  plaidInternal: typeof plaidInternal;
  recurring: typeof recurring;
  reminderDelivery: typeof reminderDelivery;
  reminders: typeof reminders;
  sample: typeof sample;
  settings: typeof settings;
  sophtron: typeof sophtron;
  sophtronInternal: typeof sophtronInternal;
  transactions: typeof transactions;
  validators: typeof validators;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
