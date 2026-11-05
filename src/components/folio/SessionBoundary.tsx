import React from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { decodeJwt } from "jose";
import { isDemoSession, returnToAccount } from "../../lib/demo";

export function SessionBoundary({ children }: React.PropsWithChildren) {
  const token = useAuthToken();
  const subject = token ? (decodeJwt(token).sub ?? null) : null;
  const previous = React.useRef<string | null>(subject);
  const changed = previous.current !== null && previous.current !== subject;
  React.useEffect(() => {
    // Includes sign-out in another tab and account switches without a local click.
    // Recreate the client as well as the helper registry before showing another owner.
    if (!changed) previous.current = subject;
    else if (subject) window.location.reload();
    else if (isDemoSession()) returnToAccount();
    else window.location.assign("/");
  }, [changed, subject]);
  return changed ? null : children;
}
