import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "../../lib/convex";
import { useNavigate } from "react-router-dom";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useData } from "../../lib/data";
import { message } from "../../lib/format";
import { useToast } from "../../components/folio/ui";
import {
  parsePlaidFlow,
  PLAID_FLOW_EVENT,
  PLAID_FLOW_KEY,
  type PlaidFlow,
} from "../../lib/plaidLinkState";

type Session = {
  flow: PlaidFlow | null;
  redirectUri?: string;
  invalidReturn: boolean;
};
function readSession(userId: string): Session {
  const redirectUri = new URL(window.location.href).searchParams.has(
    "oauth_state_id",
  )
    ? window.location.href
    : undefined;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PLAID_FLOW_KEY);
  } catch {
    /* The initial launcher reports unavailable storage. */
  }
  const flow = parsePlaidFlow(raw, userId);
  return { flow, redirectUri, invalidReturn: !!redirectUri && !flow };
}

// Mount once inside the authenticated Shell, including at the OAuth callback URL.
// Both new connections and update mode use the same persisted Link session.
export function PlaidLinkFlow() {
  const { profile } = useData(),
    userId = profile?.userId ?? "";
  const navigate = useNavigate(),
    toast = useToast();
  const exchange = useAction(api.plaid.exchangePublicToken),
    sync = useAction(api.plaid.sync);
  const [session, setSession] = useState<Session>(() => readSession(userId));
  const warned = useRef(false);
  const clear = useCallback(
    (returnTo?: string) => {
      try {
        sessionStorage.removeItem(PLAID_FLOW_KEY);
      } catch {
        /* Best effort when storage is disabled after launch. */
      }
      const url = new URL(window.location.href);
      if (url.searchParams.has("oauth_state_id")) {
        url.searchParams.delete("oauth_state_id");
        void navigate(returnTo ?? `${url.pathname}${url.search}${url.hash}`, {
          replace: true,
        });
      }
      setSession({ flow: null, invalidReturn: false });
    },
    [navigate],
  );
  useEffect(() => {
    if (!session.flow) {
      try {
        sessionStorage.removeItem(PLAID_FLOW_KEY);
      } catch {
        /* Storage may be disabled. */
      }
    }
  }, [session.flow]);
  useEffect(() => {
    const receive = () => {
      warned.current = false;
      setSession(readSession(userId));
    };
    window.addEventListener(PLAID_FLOW_EVENT, receive);
    return () => window.removeEventListener(PLAID_FLOW_EVENT, receive);
  }, [userId]);
  useEffect(() => {
    if (session.invalidReturn && !warned.current) {
      warned.current = true;
      clear();
      toast(
        "This bank connection session is missing or expired. Start the connection again.",
        true,
      );
    }
  }, [session.invalidReturn, clear, toast]);
  useEffect(() => {
    if (!session.flow) return;
    if (session.flow.userId !== userId) {
      clear();
      return;
    }
    const remaining = Date.parse(session.flow.expiration) - Date.now();
    const timer = window.setTimeout(
      () => {
        clear(session.flow?.returnTo);
        toast("This bank connection expired. Please start again.", true);
      },
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [session.flow, userId, clear, toast]);
  const complete = useCallback(
    async (
      publicToken: string | null,
      metadata: PlaidLinkOnSuccessMetadata,
    ) => {
      const flow = session.flow;
      if (!flow) return;
      // Clear before exchanging so a reload cannot replay a consumed public token.
      clear(flow.returnTo);
      try {
        if (flow.kind === "update" && flow.itemId) {
          await sync({ itemId: flow.itemId as Id<"plaidItems"> });
          toast("Connection updated. Your accounts are syncing.");
        } else {
          if (!publicToken)
            throw new Error(
              "No connection token was returned. Please try again.",
            );
          await exchange({
            publicToken,
            ...(flow.importFromDate
              ? { importFromDate: flow.importFromDate }
              : {}),
            ...(metadata.institution
              ? {
                  institutionId: metadata.institution.institution_id,
                  institutionName: metadata.institution.name,
                }
              : {}),
          });
          toast("Bank connected. Your balances and transactions are syncing.");
        }
      } catch (error) {
        toast(message(error), true);
      }
    },
    [session.flow, clear, sync, exchange, toast],
  );
  const exit = useCallback(
    (error?: string) => {
      clear(session.flow?.returnTo);
      if (error) toast(error, true);
    },
    [clear, session.flow?.returnTo, toast],
  );
  if (!session.flow || session.flow.userId !== userId) return null;
  return (
    <LinkSession
      key={session.flow.linkToken}
      flow={session.flow}
      receivedRedirectUri={session.redirectUri}
      onSuccess={complete}
      onExit={exit}
    />
  );
}
function LinkSession({
  flow,
  receivedRedirectUri,
  onSuccess,
  onExit,
}: {
  flow: PlaidFlow;
  receivedRedirectUri?: string;
  onSuccess: (
    token: string | null,
    metadata: PlaidLinkOnSuccessMetadata,
  ) => Promise<void>;
  onExit: (error?: string) => void;
}) {
  const opened = useRef(false),
    completed = useRef(false);
  const { ready, open, error } = usePlaidLink({
    token: flow.linkToken,
    ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
    onSuccess: (token, metadata) => {
      if (completed.current) return;
      completed.current = true;
      void onSuccess(token, metadata);
    },
    onExit: (error) => {
      if (completed.current) return;
      completed.current = true;
      onExit(
        error
          ? "The bank connection couldn't finish. Please start again."
          : undefined,
      );
    },
  });
  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true;
      open();
    }
  }, [ready, open]);
  useEffect(() => {
    if (error && !completed.current) {
      completed.current = true;
      onExit(
        "The bank connection couldn't open or has expired. Please start again.",
      );
    }
  }, [error, onExit]);
  return null;
}
