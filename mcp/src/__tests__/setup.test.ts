// mcp/src/__tests__/setup.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  substitutions,
  applySubstitutions,
  fileMappings,
  detectAppName,
  runSetup,
} from "../setup.js";

describe("substitutions", () => {
  it("renders all placeholder tokens", () => {
    const subs = substitutions("my_shop", { date: "2026-07-16" });
    const content = [
      "defmodule __APP_WEB_MODULE__.PageController do",
      "  alias __APP_MODULE__.Accounts",
      "end",
      "# lib/__APP_WEB_NAME__/ and lib/__APP_NAME__/",
      "# Recorded: __GENERATED_DATE__",
    ].join("\n");

    const rendered = applySubstitutions(content, subs);
    expect(rendered).toContain("MyShopWeb.PageController");
    expect(rendered).toContain("alias MyShop.Accounts");
    expect(rendered).toContain("lib/my_shop_web/ and lib/my_shop/");
    expect(rendered).toContain("Recorded: 2026-07-16");
    expect(rendered).not.toContain("__APP_");
    expect(rendered).not.toContain("__GENERATED_DATE__");
  });
});

describe("detectAppName", () => {
  it("extracts the app atom from mix.exs", () => {
    const mixExs = `defmodule MyShop.MixProject do\n  def project do\n    [\n      app: :my_shop,\n      version: "0.1.0"\n    ]\n  end\nend\n`;
    expect(detectAppName(mixExs)).toBe("my_shop");
  });

  it("throws when no app atom is found", () => {
    expect(() => detectAppName("defmodule X do end")).toThrow(/could not find/);
  });
});

let templateDir: string;
let cwd: string;

beforeEach(() => {
  templateDir = mkdtempSync(join(tmpdir(), "templates-"));
  cwd = mkdtempSync(join(tmpdir(), "project-"));
  mkdirSync(join(templateDir, "docs"), { recursive: true });
  writeFileSync(join(templateDir, "SPEC.md"), "# __APP_MODULE__ Spec\n");
  writeFileSync(join(templateDir, "docs", "architecture.md"), "# __APP_MODULE__ Architecture\n");
  writeFileSync(join(templateDir, "credo.exs"), "%{configs: []}\n");
  writeFileSync(join(templateDir, "spawn-agent"), "#!/bin/bash\necho hi\n");
});

afterEach(() => {
  rmSync(templateDir, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("fileMappings", () => {
  it("maps root dotfiles and nests docs/ unchanged", () => {
    const mappings = fileMappings(templateDir);
    const dest = new Map(mappings.map((m) => [m.templateRel, m.dest]));
    expect(dest.get("SPEC.md")).toBe("SPEC.md");
    expect(dest.get("docs/architecture.md")).toBe("docs/architecture.md");
    expect(dest.get("credo.exs")).toBe(".credo.exs");
    expect(dest.get("spawn-agent")).toBe("spawn-agent");
  });
});

describe("runSetup", () => {
  it("writes rendered templates, patches mix.exs, and never overwrites existing files", () => {
    writeFileSync(
      join(cwd, "mix.exs"),
      `defmodule MyShop.MixProject do\n  def project do\n    [\n      app: :my_shop,\n      deps: deps(),\n      listeners: [Phoenix.CodeReloader]\n    ]\n  end\n\n  defp deps do\n    [\n      {:bandit, "~> 1.5"}\n    ]\n  end\nend\n`,
    );
    // Pre-existing SPEC.md must survive untouched.
    writeFileSync(join(cwd, "SPEC.md"), "# already here\n");

    const result = runSetup(cwd, templateDir);

    expect(readFileSync(join(cwd, "SPEC.md"), "utf8")).toBe("# already here\n");
    expect(result.skipped).toContain("SPEC.md");

    expect(existsSync(join(cwd, "docs", "architecture.md"))).toBe(true);
    expect(readFileSync(join(cwd, "docs", "architecture.md"), "utf8")).toContain("MyShop Architecture");
    expect(result.created).toContain("docs/architecture.md");

    expect(result.mixExsPatched).toBe(true);
    const patchedMixExs = readFileSync(join(cwd, "mix.exs"), "utf8");
    expect(patchedMixExs).toContain("dialyzer: [");
  });
});
