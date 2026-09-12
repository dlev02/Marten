import { describe, expect, test } from "vitest";
import {
  credentialKeyBytes,
  isSealed,
  openCredential,
  sealCredential,
} from "./lib/credentialCrypto";

const key = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

describe("credential sealing", () => {
  test("stores plaintext without a key and sealed ciphertext with one", async () => {
    expect(credentialKeyBytes(undefined)).toBeNull();
    expect(credentialKeyBytes("too-short")).toBeNull();
    expect(credentialKeyBytes(key)?.length).toBe(32);
    const secret = "ZmljdGlvbmFsLWFjY2Vzcy1rZXk=";
    expect(await sealCredential(secret, undefined)).toBe(secret);
    const sealed = await sealCredential(secret, key);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(await sealCredential(secret, key)).not.toBe(sealed);
    expect(await openCredential(sealed, key)).toBe(secret);
    expect(await openCredential(secret, key)).toBe(secret);
  });
  test("explains a missing or wrong key instead of returning garbage", async () => {
    const sealed = await sealCredential("secret", key);
    await expect(openCredential(sealed, undefined)).rejects.toThrow(
      "CREDENTIALS_KEY is missing",
    );
    const otherKey = btoa(
      String.fromCharCode(...new Uint8Array(32).map((_, i) => 255 - i)),
    );
    await expect(openCredential(sealed, otherKey)).rejects.toThrow(
      "could not be decrypted",
    );
  });
});
