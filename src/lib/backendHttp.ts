/** HTTP actions live on the paired site origin, never the WebSocket origin. */
export function backendHttpUrl(path: string) {
  const configured = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  if (configured) return new URL(path, configured).href;
  const cloud = new URL(import.meta.env.VITE_CONVEX_URL);
  cloud.hostname = cloud.hostname.replace(/\.convex\.cloud$/, ".convex.site");
  return new URL(path, cloud).href;
}
