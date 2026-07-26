import { describe, it, expect } from "vitest";
import { pathOwnedBy } from "../../../lib/ownership.js";

describe("pathOwnedBy", () => {
  it("matches an exact file", () => {
    expect(pathOwnedBy("lib/foo.ex", "lib/foo.ex")).toBe(true);
    expect(pathOwnedBy("lib/bar.ex", "lib/foo.ex")).toBe(false);
  });

  it("matches a directory entry without trailing slash", () => {
    expect(pathOwnedBy("lib/foo/bar.ex", "lib/foo")).toBe(true);
  });

  it("matches a directory-prefix entry with trailing slash", () => {
    expect(pathOwnedBy("priv/repo/migrations/20260101_x.exs", "priv/repo/migrations/")).toBe(true);
  });

  it("matches the reverse case: a dirty parent directory covering a declared file", () => {
    expect(pathOwnedBy("lib/foo/adapters/", "lib/foo/adapters/impl.ex")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(pathOwnedBy("lib/other/bar.ex", "lib/foo/")).toBe(false);
  });
});
