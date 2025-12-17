/**
 * LSP Server definitions
 * Based on opencode reference implementation
 */

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import fs from "fs/promises";

export interface LSPServerHandle {
  process: ChildProcessWithoutNullStreams;
  initialization?: Record<string, unknown>;
}

type RootFunction = (
  file: string,
  projectPath: string
) => Promise<string | undefined>;

export interface LSPServerInfo {
  id: string;
  extensions: string[];
  root: RootFunction;
  spawn(root: string): Promise<LSPServerHandle | undefined>;
}

/**
 * Find nearest directory containing one of the target files
 */
function nearestRoot(
  includePatterns: string[],
  excludePatterns?: string[]
): RootFunction {
  return async (file, projectPath) => {
    let current = path.dirname(file);

    // Check exclusions first
    if (excludePatterns) {
      let checkDir = current;
      while (checkDir.startsWith(projectPath) || checkDir === projectPath) {
        for (const pattern of excludePatterns) {
          const target = path.join(checkDir, pattern);
          try {
            await fs.access(target);
            return undefined; // Excluded
          } catch {
            // Not found, continue
          }
        }
        const parent = path.dirname(checkDir);
        if (parent === checkDir) break;
        checkDir = parent;
      }
    }

    // Find nearest matching file
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of includePatterns) {
        const target = path.join(current, pattern);
        try {
          await fs.access(target);
          return current;
        } catch {
          // Not found, continue
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return projectPath;
  };
}

/**
 * TypeScript Language Server
 */
export const TypescriptServer: LSPServerInfo = {
  id: "typescript",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  root: nearestRoot(
    [
      "package-lock.json",
      "bun.lockb",
      "bun.lock",
      "pnpm-lock.yaml",
      "yarn.lock",
    ],
    ["deno.json", "deno.jsonc"]
  ),
  async spawn(root) {
    const tsserver = Bun.which("typescript-language-server");
    if (!tsserver) {
      // Try via bunx
      const proc = spawn("bunx", ["typescript-language-server", "--stdio"], {
        cwd: root,
        env: { ...process.env, BUN_BE_BUN: "1" },
      });
      return { process: proc };
    }

    const proc = spawn(tsserver, ["--stdio"], {
      cwd: root,
      env: { ...process.env, BUN_BE_BUN: "1" },
    });
    return { process: proc };
  },
};

/**
 * Deno Language Server
 */
export const DenoServer: LSPServerInfo = {
  id: "deno",
  extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
  root: async (file, projectPath) => {
    let current = path.dirname(file);
    while (current.startsWith(projectPath) || current === projectPath) {
      for (const pattern of ["deno.json", "deno.jsonc"]) {
        const target = path.join(current, pattern);
        try {
          await fs.access(target);
          return current;
        } catch {
          // Not found
        }
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  },
  async spawn(root) {
    const deno = Bun.which("deno");
    if (!deno) return undefined;

    const proc = spawn(deno, ["lsp"], {
      cwd: root,
    });
    return { process: proc };
  },
};

/**
 * Python Language Server (Pyright)
 */
export const PyrightServer: LSPServerInfo = {
  id: "pyright",
  extensions: [".py", ".pyi"],
  root: nearestRoot([
    "pyproject.toml",
    "setup.py",
    "requirements.txt",
    "pyrightconfig.json",
  ]),
  async spawn(root) {
    const pyright = Bun.which("pyright-langserver");
    if (!pyright) {
      // Try via bunx/npx
      const proc = spawn("bunx", ["pyright-langserver", "--stdio"], {
        cwd: root,
      });
      return { process: proc };
    }

    const proc = spawn(pyright, ["--stdio"], {
      cwd: root,
    });
    return { process: proc };
  },
};

/**
 * Go Language Server (gopls)
 */
export const GoplsServer: LSPServerInfo = {
  id: "gopls",
  extensions: [".go"],
  root: async (file, projectPath) => {
    // Check for go.work first
    const workRoot = await nearestRoot(["go.work"])(file, projectPath);
    if (workRoot) return workRoot;
    return nearestRoot(["go.mod", "go.sum"])(file, projectPath);
  },
  async spawn(root) {
    const gopls = Bun.which("gopls");
    if (!gopls) return undefined;

    const proc = spawn(gopls, ["serve"], {
      cwd: root,
    });
    return { process: proc };
  },
};

/**
 * Rust Analyzer
 */
export const RustAnalyzerServer: LSPServerInfo = {
  id: "rust-analyzer",
  extensions: [".rs"],
  root: nearestRoot(["Cargo.toml", "Cargo.lock"]),
  async spawn(root) {
    const rustAnalyzer = Bun.which("rust-analyzer");
    if (!rustAnalyzer) return undefined;

    const proc = spawn(rustAnalyzer, [], {
      cwd: root,
    });
    return { process: proc };
  },
};

/**
 * All available LSP servers
 */
export const LSP_SERVERS: LSPServerInfo[] = [
  DenoServer, // Deno first, higher priority for Deno projects
  TypescriptServer,
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
];

/**
 * Get server info by ID
 */
export function getServerById(id: string): LSPServerInfo | undefined {
  return LSP_SERVERS.find((s) => s.id === id);
}

/**
 * Get servers that support a file extension
 */
export function getServersForExtension(extension: string): LSPServerInfo[] {
  return LSP_SERVERS.filter((s) => s.extensions.includes(extension));
}
