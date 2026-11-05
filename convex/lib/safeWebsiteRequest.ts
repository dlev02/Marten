"use node";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

/** IPv4 only: deny all special-use, private, loopback, link-local and multicast ranges. */
export function publicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/** TLS still authenticates the hostname; only the socket's checked DNS answer is pinned. */
export async function safeWebsiteRequest(
  url: URL,
  limit: number,
  signal: AbortSignal,
) {
  if (url.protocol !== "https:" || url.port || url.username || url.password)
    throw new Error("Unsupported website");
  const answers = await lookup(url.hostname, { all: true, family: 4 });
  if (!answers.length || answers.some((row) => !publicIpv4(row.address)))
    throw new Error("Website address unavailable");
  return await new Promise<{
    status: number;
    location?: string;
    bytes: Uint8Array<ArrayBuffer>;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        agent: false,
        family: 4,
        signal,
        maxHeaderSize: 16 * 1024,
        lookup: (_host, _options, callback) =>
          callback(null, answers[0].address, 4),
        headers: {
          Accept: "text/html,image/*;q=0.9",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 500;
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          resolve({
            status,
            location: response.headers.location,
            bytes: new Uint8Array(0),
          });
          return;
        }
        if (Number(response.headers["content-length"]) > limit) {
          response.destroy();
          reject(new Error("Website too large"));
          return;
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > limit) {
            response.destroy();
            reject(new Error("Website too large"));
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          resolve({ status, bytes });
        });
      },
    );
    req.setTimeout(8000, () => req.destroy(new Error("Website timed out")));
    req.on("error", reject);
    req.end();
  });
}
