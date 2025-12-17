import { describe, expect, test } from "bun:test";
import {
  LSPManager,
  formatDiagnostic,
  SymbolKind,
  getLanguageId,
  LANGUAGE_EXTENSIONS,
} from "../index";
import type { Diagnostic } from "vscode-languageserver-types";

describe("LSPManager", () => {
  test("creates manager with project path", () => {
    const manager = new LSPManager("/test/project");
    expect(manager).toBeDefined();
  });

  test("creates disabled manager", () => {
    const manager = new LSPManager("/test/project", { enabled: false });
    expect(manager).toBeDefined();
  });

  test("returns empty status when no clients connected", async () => {
    const manager = new LSPManager("/test/project");
    const status = await manager.status();
    expect(status).toEqual([]);
  });

  test("returns empty diagnostics when no clients connected", async () => {
    const manager = new LSPManager("/test/project");
    const diagnostics = await manager.diagnostics();
    expect(diagnostics).toEqual({});
  });

  test("shuts down cleanly with no clients", async () => {
    const manager = new LSPManager("/test/project");
    await manager.shutdown();
    // Should not throw
  });
});

describe("formatDiagnostic", () => {
  test("formats error diagnostic", () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 10 },
      },
      message: "Test error message",
      severity: 1,
    };

    const result = formatDiagnostic(diagnostic);
    expect(result).toBe("ERROR [1:6] Test error message");
  });

  test("formats warning diagnostic", () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 4, character: 0 },
        end: { line: 4, character: 10 },
      },
      message: "Test warning",
      severity: 2,
    };

    const result = formatDiagnostic(diagnostic);
    expect(result).toBe("WARN [5:1] Test warning");
  });

  test("formats info diagnostic", () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 9, character: 3 },
        end: { line: 9, character: 8 },
      },
      message: "Test info",
      severity: 3,
    };

    const result = formatDiagnostic(diagnostic);
    expect(result).toBe("INFO [10:4] Test info");
  });

  test("formats hint diagnostic", () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      message: "Test hint",
      severity: 4,
    };

    const result = formatDiagnostic(diagnostic);
    expect(result).toBe("HINT [1:1] Test hint");
  });

  test("defaults to ERROR when severity not specified", () => {
    const diagnostic: Diagnostic = {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      },
      message: "No severity",
    };

    const result = formatDiagnostic(diagnostic);
    expect(result).toBe("ERROR [1:1] No severity");
  });
});

describe("SymbolKind", () => {
  test("has correct enum values", () => {
    expect(SymbolKind.File).toBe(1);
    expect(SymbolKind.Module).toBe(2);
    expect(SymbolKind.Class).toBe(5);
    expect(SymbolKind.Method).toBe(6);
    expect(SymbolKind.Function).toBe(12);
    expect(SymbolKind.Variable).toBe(13);
  });
});

describe("getLanguageId", () => {
  test("returns correct language for TypeScript", () => {
    expect(getLanguageId(".ts")).toBe("typescript");
  });

  test("returns correct language for TypeScript React", () => {
    expect(getLanguageId(".tsx")).toBe("typescriptreact");
  });

  test("returns correct language for JavaScript", () => {
    expect(getLanguageId(".js")).toBe("javascript");
  });

  test("returns correct language for Python", () => {
    expect(getLanguageId(".py")).toBe("python");
  });

  test("returns correct language for Go", () => {
    expect(getLanguageId(".go")).toBe("go");
  });

  test("returns correct language for Rust", () => {
    expect(getLanguageId(".rs")).toBe("rust");
  });

  test("returns plaintext for unknown extensions", () => {
    expect(getLanguageId(".unknown")).toBe("plaintext");
  });
});

describe("LANGUAGE_EXTENSIONS", () => {
  test("contains common languages", () => {
    expect(LANGUAGE_EXTENSIONS[".ts"]).toBe("typescript");
    expect(LANGUAGE_EXTENSIONS[".js"]).toBe("javascript");
    expect(LANGUAGE_EXTENSIONS[".py"]).toBe("python");
    expect(LANGUAGE_EXTENSIONS[".go"]).toBe("go");
    expect(LANGUAGE_EXTENSIONS[".rs"]).toBe("rust");
    expect(LANGUAGE_EXTENSIONS[".java"]).toBe("java");
    expect(LANGUAGE_EXTENSIONS[".kt"]).toBe("kotlin");
  });

  test("contains web languages", () => {
    expect(LANGUAGE_EXTENSIONS[".html"]).toBe("html");
    expect(LANGUAGE_EXTENSIONS[".css"]).toBe("css");
    expect(LANGUAGE_EXTENSIONS[".vue"]).toBe("vue");
    expect(LANGUAGE_EXTENSIONS[".svelte"]).toBe("svelte");
  });

  test("contains config files", () => {
    expect(LANGUAGE_EXTENSIONS[".json"]).toBe("json");
    expect(LANGUAGE_EXTENSIONS[".yaml"]).toBe("yaml");
    expect(LANGUAGE_EXTENSIONS[".yml"]).toBe("yaml");
  });
});
