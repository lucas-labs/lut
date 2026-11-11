// Analysis areas: every tracked file of the imported Terax code must match exactly one area.
// Pattern syntax: "dir/" = prefix, "a/*.ts" or "a/**" = glob (* = one segment, ** = any), else exact path.
// Paths excluded from the partition (lut's own material) are listed in EXCLUDED.

export const EXCLUDED = [".docs/", ".agents/"];

export const AREAS = [
  {
    id: "terminal",
    title: "Terminal core (frontend renderer, Ghostty WASM, fonts)",
    patterns: [
      "src/modules/terminal/",
      "packages/ghostty-core/",
      "src/assets/fonts/",
      "src/styles/terminalTheme.ts",
      "src/lib/nerdFontIcons.test.ts",
      "public/licenses/nerd-font-icons.txt",
      "scripts/ghostty-*",
      "scripts/ghostty-webkit-memory/",
      "scripts/terminal-visual/",
      "scripts/renderer-profile/",
      "src-tauri/tests/ghostty_artifacts.rs",
    ],
  },
  {
    id: "backend-core",
    title: "PTY, shell & platform backend (Rust)",
    patterns: [
      "src-tauri/src/lib.rs",
      "src-tauri/src/main.rs",
      "src-tauri/src/modules/mod.rs",
      "src-tauri/src/modules/pty/",
      "src-tauri/src/modules/shell/",
      "src-tauri/src/modules/proc/",
      "src-tauri/src/modules/history/",
      "src-tauri/src/modules/window_presentation.rs",
      "src-tauri/src/modules/runtime.rs",
      "src-tauri/src/modules/ipc_body.rs",
      "src-tauri/src/modules/vibrancy.rs",
      "src-tauri/tests/common/",
      "src-tauri/tests/shell_background.rs",
      "scripts/pty-smoke/",
      "scripts/ipc-profile/",
    ],
  },
  {
    id: "app-shell",
    title: "App shell, navigation & shared UI infrastructure",
    patterns: [
      "src/app/",
      "src/main.tsx",
      "index.html",
      "components.json",
      "src/modules/tabs/",
      "src/modules/header/",
      "src/modules/sidebar/",
      "src/modules/statusbar/",
      "src/modules/workspace/",
      "src/modules/command-palette/",
      "src/modules/shortcuts/",
      "src/components/ui/",
      "src/components/WindowControls.tsx",
      "src/styles/code-highlight.css",
      "src/styles/compositingBudget.test.ts",
      "src/styles/fonts.css",
      "src/styles/globals.css",
      "src/styles/motionBudget.test.ts",
      "src/styles/tokens.ts",
      "src/lib/external-link.test.ts",
      "src/lib/external-link.ts",
      "src/lib/fonts.test.ts",
      "src/lib/fonts.ts",
      "src/lib/homeRelativePath.test.ts",
      "src/lib/homeRelativePath.ts",
      "src/lib/launchDir.ts",
      "src/lib/platform.ts",
      "src/lib/shellQuote.test.ts",
      "src/lib/shellQuote.ts",
      "src/lib/useAssetGrant.test.ts",
      "src/lib/useAssetGrant.ts",
      "src/lib/usePresence.ts",
      "src/lib/useZoom.ts",
      "src/lib/utils.test.ts",
      "src/lib/utils.ts",
      "src-tauri/src/modules/app_menu.rs",
    ],
  },
  {
    id: "state-settings",
    title: "Persistence (Spaces), settings & theme",
    patterns: [
      "src/modules/spaces/",
      "src/modules/settings/",
      "src/modules/theme/",
      "src/settings/",
      "settings.html",
      "src-tauri/src/modules/workspace.rs",
    ],
  },
  {
    id: "agents",
    title: "CLI agents, hooks & control server",
    patterns: [
      "src/modules/agents/",
      "src/modules/control/",
      "src-tauri/src/modules/agent.rs",
      "src-tauri/src/modules/agent_events.rs",
      "src-tauri/src/modules/agent_json.rs",
      "src-tauri/src/modules/control.rs",
      "src-tauri/crates/",
      "scripts/build-cli.mjs",
      "public/notification.mp3",
    ],
  },
  {
    id: "ai",
    title: "Built-in AI (BYOK) subsystem",
    patterns: [
      "src/modules/ai/",
      "src/components/ai-elements/",
      "src-tauri/src/modules/ai_sessions.rs",
      "src-tauri/src/modules/net/",
      "src-tauri/src/modules/net.rs",
      "src-tauri/src/modules/secrets.rs",
    ],
  },
  {
    id: "ide-tools",
    title: "IDE-like tools (editor, explorer, git, LSP, markdown, preview)",
    patterns: [
      "src/modules/editor/",
      "src/modules/explorer/",
      "src/modules/git/",
      "src/modules/git-history/",
      "src/modules/source-control/",
      "src/modules/lsp/",
      "src/modules/markdown/",
      "src/modules/preview/",
      "src-tauri/src/modules/fs/",
      "src-tauri/src/modules/git/",
      "src-tauri/src/modules/lsp/",
      "src-tauri/tests/fs_search.rs",
      "src-tauri/tests/git_operations.rs",
    ],
  },
  {
    id: "build-identity",
    title: "Build, packaging, updater, tooling & product identity",
    patterns: [
      ".coderabbit.yaml",
      ".gitignore",
      ".size-limit.json",
      ".vscode/",
      "LICENSE",
      "biome.json",
      "flake.lock",
      "flake.nix",
      "nix/",
      "knip.json",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "tsconfig.node.json",
      "vite.config.ts",
      "terax-icon.png",
      "src/vite-env.d.ts",
      "src/modules/updater/",
      "src/bench/",
      "public/logo.png",
      "public/licenses/terax.txt",
      "scripts/app-lab/",
      "scripts/dist-graph.*",
      "scripts/eager-graph.*",
      "src-tauri/.gitignore",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
      "src-tauri/build.rs",
      "src-tauri/tauri.conf.json",
      "src-tauri/tauri.linux.conf.json",
      "src-tauri/tauri.windows.conf.json",
      "src-tauri/Info.plist",
      "src-tauri/entitlements.plist",
      "src-tauri/installer-hooks.nsh",
      "src-tauri/capabilities/",
      "src-tauri/icons/",
      "src-tauri/src/modules/bench.rs",
    ],
  },
];

// The lut proposal is analysed as its own area (requirements side), not as code.
export const PROPOSAL_AREA = {
  id: "proposal",
  title: "lut proposal: requirements, phases, invariants, tests",
  file: ".docs/proposal.md",
};

export function toMatcher(pattern) {
  if (pattern.endsWith("/")) return (p) => p.startsWith(pattern);
  if (pattern.includes("*")) {
    const re = new RegExp(
      "^" +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, "\u0000")
          .replace(/\*/g, "[^/]*")
          .replace(/\u0000/g, ".*") +
        "$",
    );
    return (p) => re.test(p);
  }
  return (p) => p === pattern;
}
