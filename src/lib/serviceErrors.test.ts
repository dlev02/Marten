import { expect, test } from "vitest";
import { message } from "./format";
import { serviceErrorKind } from "./serviceErrors";
test.each([
  "Could not find public function transactions:create",
  "ArgumentValidationError: Object contains extra field",
  "Failed to fetch dynamically imported module",
])("version mismatch offers recovery: %s", (raw) => {
  expect(serviceErrorKind(new Error(raw))).toBe("update");
  expect(message(new Error(raw))).toContain("Copy any unsaved details");
});
test("connection and server errors do not leak diagnostic details", () => {
  expect(message(new Error("Failed to fetch"))).toContain(
    "wait for confirmation",
  );
  const result = message(
    new Error(
      "[CONVEX M(transactions:create)] [Request ID: private-id] Server Error\nstack secret",
    ),
  );
  expect(result).toContain("try again");
  expect(result).not.toContain("private-id");
  expect(result).not.toContain("secret");
});
test("intentional validation errors remain actionable", () => {
  expect(
    message(
      new Error("[CONVEX M] Uncaught ConvexError: Choose an account.\nstack"),
    ),
  ).toBe("Choose an account.");
});
