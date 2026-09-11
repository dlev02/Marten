import { describe, expect, test } from "vitest";
import { resolveDemoContext } from "./demo";

function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    key: (index) => [...data.keys()][index] ?? null,
  };
}

describe("demo tab isolation", () => {
  test("a demo survives route reloads in its own tab without activating another tab", () => {
    const demoTab = storage(),
      normalTab = storage();
    const demo = resolveDemoContext(
      { pathname: "/demo", search: "" },
      () => demoTab,
    );
    expect(demo).toEqual({ active: true, storage: demoTab });
    demo.storage!.setItem("demo-token", "fictional-session");
    expect(
      resolveDemoContext({ pathname: "/accounts", search: "" }, () => demoTab)
        .active,
    ).toBe(true);
    expect(
      resolveDemoContext(
        { pathname: "/accounts", search: "" },
        () => normalTab,
      ),
    ).toEqual({ active: false });
    expect(normalTab.getItem("demo-token")).toBeNull();
  });

  test("explicit query entry is supported and blocked session storage fails closed", () => {
    expect(
      resolveDemoContext({ pathname: "/forecast", search: "?demo=1" }, storage)
        .active,
    ).toBe(true);
    const blocked = () => {
      throw new Error("Blocked");
    };
    expect(
      resolveDemoContext({ pathname: "/demo", search: "" }, blocked),
    ).toMatchObject({ active: true, error: expect.any(String) });
    expect(resolveDemoContext({ pathname: "/", search: "" }, blocked)).toEqual({
      active: false,
    });
  });
});
