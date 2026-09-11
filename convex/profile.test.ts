/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { cropBounds } from "../src/features/settings/profileCrop";

const modules = import.meta.glob("./**/*.ts");
const photo = () => ({
  contentType: "image/png",
  bytes: Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=",
    ),
    (character) => character.charCodeAt(0),
  ).buffer,
});
async function fixture() {
  const t = convexTest(schema, modules);
  const users = await t.run(async (ctx) => ({
    alice: await ctx.db.insert("users", {
      email: "profile-alice@example.test",
    }),
    bob: await ctx.db.insert("users", { email: "profile-bob@example.test" }),
  }));
  const alice = t.withIdentity({ subject: users.alice });
  const bob = t.withIdentity({ subject: users.bob });
  await alice.mutation(api.workspace.initialize, {
    name: "Alice",
    sample: false,
  });
  await bob.mutation(api.workspace.initialize, { name: "Bob", sample: false });
  return { t, users, alice, bob };
}

describe("profile pictures", () => {
  test("requires authentication and a profile before storing a photo", async () => {
    const { t } = await fixture();
    await expect(
      t.action(api.workspace.uploadProfilePhoto, photo()),
    ).rejects.toThrow("sign in");
    await expect(
      t.mutation(api.workspace.saveProfileAvatar, { preset: "sage" }),
    ).rejects.toThrow("sign in");
    const newUser = await t.run((ctx) => ctx.db.insert("users", {}));
    await expect(
      t
        .withIdentity({ subject: newUser })
        .action(api.workspace.uploadProfilePhoto, photo()),
    ).rejects.toThrow("Set up");
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(0);
  });

  test("rejects empty, oversized, unsupported, and mislabeled images without storage writes", async () => {
    const { t, alice } = await fixture();
    await expect(
      alice.action(api.workspace.uploadProfilePhoto, {
        ...photo(),
        bytes: new ArrayBuffer(0),
      }),
    ).rejects.toThrow("1 MB");
    await expect(
      alice.action(api.workspace.uploadProfilePhoto, {
        ...photo(),
        bytes: new ArrayBuffer(1024 * 1024 + 1),
      }),
    ).rejects.toThrow("1 MB");
    await expect(
      alice.action(api.workspace.uploadProfilePhoto, {
        ...photo(),
        contentType: "image/svg+xml",
      }),
    ).rejects.toThrow("JPEG or PNG");
    await expect(
      alice.action(api.workspace.uploadProfilePhoto, {
        ...photo(),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow("JPEG or PNG");
    await expect(
      alice.action(api.workspace.uploadProfilePhoto, {
        ...photo(),
        bytes: new TextEncoder().encode("not an image").buffer,
      }),
    ).rejects.toThrow("JPEG or PNG");
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(0);
  });

  test("photo replacement and presets remove only the signed-in user's old photo", async () => {
    const { t, alice, bob } = await fixture();
    await alice.action(api.workspace.uploadProfilePhoto, photo());
    await bob.action(api.workspace.uploadProfilePhoto, photo());
    const firstAlice = (await alice.query(api.workspace.metadata, {})).profile!;
    const bobProfile = (await bob.query(api.workspace.metadata, {})).profile!;
    expect(firstAlice.avatarUrl).toEqual(expect.any(String));
    expect(firstAlice.photoStorageId).toBeDefined();
    await alice.action(api.workspace.uploadProfilePhoto, photo());
    const replacement = (await alice.query(api.workspace.metadata, {}))
      .profile!;
    expect(replacement.photoStorageId).not.toBe(firstAlice.photoStorageId);
    expect(
      await t.run((ctx) => ctx.storage.get(firstAlice.photoStorageId!)),
    ).toBeNull();
    expect(
      await t.run(
        async (ctx) =>
          (await ctx.storage.get(bobProfile.photoStorageId!)) !== null,
      ),
    ).toBe(true);
    await alice.mutation(api.workspace.saveProfileAvatar, { preset: "ocean" });
    const preset = (await alice.query(api.workspace.metadata, {})).profile!;
    expect(preset).toMatchObject({
      name: "Alice",
      avatarPreset: "ocean",
      avatarUrl: null,
    });
    expect(preset.photoStorageId).toBeUndefined();
    expect(
      await t.run((ctx) => ctx.storage.get(replacement.photoStorageId!)),
    ).toBeNull();
    expect((await bob.query(api.workspace.metadata, {})).profile).toMatchObject(
      bobProfile,
    );
    await alice.mutation(api.workspace.saveProfileAvatar, { preset: null });
    expect(
      (await alice.query(api.workspace.metadata, {})).profile?.avatarPreset,
    ).toBeUndefined();
  });

  test("photo upload replaces a saved preset, and clearing a sample workspace deletes its photo", async () => {
    const { t, alice } = await fixture();
    await alice.mutation(api.workspace.saveProfileAvatar, { preset: "sage" });
    await alice.action(api.workspace.uploadProfilePhoto, photo());
    const saved = (await alice.query(api.workspace.metadata, {})).profile!;
    expect(saved.avatarPreset).toBeUndefined();
    await t.run((ctx) => ctx.db.patch(saved._id, { demo: true }));
    let done = false;
    while (!done)
      done = (await alice.mutation(api.workspace.clearSample, {})).done;
    expect(
      await t.run((ctx) => ctx.storage.get(saved.photoStorageId!)),
    ).toBeNull();
    expect((await alice.query(api.workspace.metadata, {})).profile).toBeNull();
  });
});

describe("profile crop geometry", () => {
  test("centers portrait and landscape photos without stretching", () => {
    expect(cropBounds(1200, 800, { zoom: 1, x: 0, y: 0 })).toEqual({
      x: 200,
      y: 0,
      side: 800,
    });
    expect(cropBounds(800, 1200, { zoom: 1, x: 0, y: 0 })).toEqual({
      x: 0,
      y: 200,
      side: 800,
    });
  });
  test("pan and zoom always stay inside the original image", () => {
    for (const [width, height] of [
      [1200, 800],
      [800, 1200],
      [500, 500],
    ]) {
      for (const zoom of [0, 1, 2, 3, 10]) {
        for (const position of [-2, -1, 0, 1, 2]) {
          const bounds = cropBounds(width, height, {
            zoom,
            x: position,
            y: position,
          });
          expect(bounds.side).toBeGreaterThan(0);
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.side).toBeLessThanOrEqual(width);
          expect(bounds.y + bounds.side).toBeLessThanOrEqual(height);
        }
      }
    }
    expect(cropBounds(1200, 800, { zoom: 2, x: 1, y: -1 })).toEqual({
      x: 800,
      y: 0,
      side: 400,
    });
  });
});
