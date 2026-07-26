const DIALYZER_CONFIG = `      dialyzer: [
        plt_add_apps: [:ex_unit, :mix],
        plt_file: {:no_warn, "priv/plts/dialyzer.plt"},
        plt_core_path: "priv/plts",
        ignore_warnings: ".dialyzer_ignore.exs",
        flags: [:error_handling, :unknown]
      ],`;

const TOOLING_DEPS = `
      # --- Tooling / verification gate ---
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false},
      {:dialyxir, "~> 1.4", only: [:dev, :test], runtime: false},
      {:sobelow, "~> 0.13", only: [:dev, :test], runtime: false},
      {:mox, "~> 1.1", only: :test}`;

export const PRECOMMIT_STEPS = [
  "deps.get --check-locked",
  "compile --warnings-as-errors",
  "format --check-formatted",
  "credo --strict",
  "sobelow --config",
  "ecto.create --quiet",
  "ecto.migrate --quiet",
  "dialyzer",
  "test --warnings-as-errors",
  "assets.build",
];

export function patch(content: string): string {
  return updatePrecommitAlias(addToolingDeps(addDialyzerConfig(content)));
}

export function addDialyzerConfig(content: string): string {
  if (content.includes("dialyzer:")) return content;

  if (content.includes("listeners: [Phoenix.CodeReloader]")) {
    return content.replace(
      "listeners: [Phoenix.CodeReloader]",
      `listeners: [Phoenix.CodeReloader],\n${DIALYZER_CONFIG}`,
    );
  }
  if (content.includes("deps: deps(),")) {
    return content.replace("deps: deps(),", `deps: deps(),\n${DIALYZER_CONFIG}`);
  }
  if (content.includes("deps: deps()")) {
    return content.replace("deps: deps()", `deps: deps(),\n${DIALYZER_CONFIG.replace(/,$/, "")}`);
  }
  return content;
}

export function addToolingDeps(content: string): string {
  if (content.includes(":credo")) return content;
  const banditPattern = /(\{:bandit,[^}]+\})(\s*\n\s*\])/;
  if (banditPattern.test(content)) {
    return content.replace(banditPattern, (_m, g1, g2) => `${g1},${TOOLING_DEPS}\n${g2}`);
  }
  return content;
}

export function updatePrecommitAlias(content: string): string {
  if (content.includes("credo --strict")) return content;
  const precommitPattern = /([ \t]*)precommit:\s*\[.*?\]/s;
  if (!precommitPattern.test(content)) return content;
  return content.replace(precommitPattern, (_m, indent: string) => {
    const items = PRECOMMIT_STEPS.map((s) => `${indent}  ${JSON.stringify(s)}`).join(",\n");
    return `${indent}precommit: [\n${items}\n${indent}]`;
  });
}

export function manualInstructions(): string {
  return `
── Manual mix.exs changes needed ────────────────────────────────────────

1. Add to the project/0 keyword list:

${DIALYZER_CONFIG}

2. Add to defp deps do ... end:
${TOOLING_DEPS}

3. Replace the precommit: alias in defp aliases do ... end:

    precommit: [
${PRECOMMIT_STEPS.map((s) => `      ${JSON.stringify(s)}`).join(",\n")}
    ]

─────────────────────────────────────────────────────────────────────────
`;
}
