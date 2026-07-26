import { describe, it, expect } from "vitest";
import { patch, addDialyzerConfig, PRECOMMIT_STEPS } from "../mix-exs-patcher.js";

const PHOENIX_1_8 = `defmodule MyShop.MixProject do
  use Mix.Project

  def project do
    [
      app: :my_shop,
      version: "0.1.0",
      elixir: "~> 1.15",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      aliases: aliases(),
      deps: deps(),
      listeners: [Phoenix.CodeReloader]
    ]
  end

  defp deps do
    [
      {:phoenix, "~> 1.8.0"},
      {:phoenix_ecto, "~> 4.5"},
      {:ecto_sql, "~> 3.13"},
      {:bandit, "~> 1.5"}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      precommit: ["compile --warning-as-errors", "deps.unlock --unused", "format", "test"]
    ]
  end
end
`;

describe("patch", () => {
  it("adds dialyzer config after the listeners entry", () => {
    const patched = patch(PHOENIX_1_8);
    expect(patched).toContain("listeners: [Phoenix.CodeReloader],");
    expect(patched).toContain('plt_file: {:no_warn, "priv/plts/dialyzer.plt"}');
    expect(patched).toContain("flags: [:error_handling, :unknown]");
  });

  it("falls back to the deps: deps() anchor when listeners is absent (Phoenix 1.7 shape)", () => {
    const withoutListeners = PHOENIX_1_8.replace(",\n      listeners: [Phoenix.CodeReloader]", "");
    const patched = patch(withoutListeners);
    expect(patched).toContain("dialyzer: [");
    expect(patched).toContain("deps: deps(),\n");
  });

  it("adds the tooling deps after bandit", () => {
    const patched = patch(PHOENIX_1_8);
    expect(patched).toContain('{:bandit, "~> 1.5"},');
    expect(patched).toContain('{:credo, "~> 1.7", only: [:dev, :test], runtime: false}');
    expect(patched).toContain('{:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false}');
    expect(patched).toContain('{:sobelow, "~> 0.13", only: [:dev, :test], runtime: false}');
    expect(patched).toContain('{:mox, "~> 1.1", only: :test}');
  });

  it("expands the precommit alias to the full pipeline", () => {
    const patched = patch(PHOENIX_1_8);
    for (const step of PRECOMMIT_STEPS) {
      expect(patched).toContain(JSON.stringify(step));
    }
    expect(patched).not.toContain("deps.unlock --unused");
  });

  it("is idempotent — patching twice equals patching once", () => {
    const once = patch(PHOENIX_1_8);
    expect(patch(once)).toBe(once);
  });

  it("returns content unchanged when no anchors match", () => {
    const unrecognized = `defmodule Odd.MixProject do\n  use Mix.Project\n  def project, do: [app: :odd, version: "0.1.0"]\nend\n`;
    expect(patch(unrecognized)).toBe(unrecognized);
  });

  it("leaves an existing dialyzer config alone", () => {
    const withDialyzer = PHOENIX_1_8.replace("deps: deps(),", "deps: deps(),\n      dialyzer: [flags: []],");
    expect(addDialyzerConfig(withDialyzer)).toBe(withDialyzer);
  });
});
