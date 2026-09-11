const DEMO_FLAG = "folio-demo-session";

type DemoContext = {
  active: boolean;
  storage?: Storage;
  error?: string;
};

let context: DemoContext = { active: false };
let exiting = false;

/** Demo tokens must never use the normal account's localStorage. */
export function resolveDemoContext(
  location: Pick<Location, "pathname" | "search">,
  getSessionStorage: () => Storage,
): DemoContext {
  const requested =
    location.pathname === "/demo" ||
    new URLSearchParams(location.search).get("demo") === "1";
  try {
    const storage = getSessionStorage();
    const active = requested || storage.getItem(DEMO_FLAG) === "1";
    if (active) storage.setItem(DEMO_FLAG, "1");
    return active ? { active: true, storage } : { active: false };
  } catch {
    return requested
      ? {
          active: true,
          error: "Allow session storage in your browser to explore the demo.",
        }
      : { active: false };
  }
}

export function initializeDemoContext() {
  context = resolveDemoContext(window.location, () => window.sessionStorage);
  if (context.active && !context.error) {
    const url = new URL(window.location.href);
    if (url.pathname === "/demo") url.pathname = "/";
    url.searchParams.delete("demo");
    window.history.replaceState(window.history.state, "", url);
  }
  return context;
}

export function isDemoSession() {
  return context.active;
}

export function demoStorageError() {
  return context.error;
}

export function isExitingDemo() {
  return exiting;
}

export async function exitDemo(signOut: () => Promise<void>) {
  exiting = true;
  try {
    await signOut();
    returnToAccount();
  } catch (error) {
    exiting = false;
    throw error;
  }
}

export function returnToAccount() {
  try {
    context.storage?.removeItem(DEMO_FLAG);
  } catch {
    // A blocked storage provider has no demo session to preserve.
  }
  window.location.assign("/");
}
