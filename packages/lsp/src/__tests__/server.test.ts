import { describe, expect, test } from "bun:test";
import {
  LSP_SERVERS,
  TypescriptServer,
  DenoServer,
  PyrightServer,
  GoplsServer,
  RustAnalyzerServer,
  getServerById,
  getServersForExtension,
} from "../server";

describe("LSP_SERVERS", () => {
  test("contains expected servers", () => {
    expect(LSP_SERVERS.length).toBeGreaterThan(0);

    const serverIds = LSP_SERVERS.map((s) => s.id);
    expect(serverIds).toContain("typescript");
    expect(serverIds).toContain("deno");
    expect(serverIds).toContain("pyright");
    expect(serverIds).toContain("gopls");
    expect(serverIds).toContain("rust-analyzer");
  });
});

describe("TypescriptServer", () => {
  test("has correct id", () => {
    expect(TypescriptServer.id).toBe("typescript");
  });

  test("supports TypeScript extensions", () => {
    expect(TypescriptServer.extensions).toContain(".ts");
    expect(TypescriptServer.extensions).toContain(".tsx");
    expect(TypescriptServer.extensions).toContain(".js");
    expect(TypescriptServer.extensions).toContain(".jsx");
  });

  test("has root function", () => {
    expect(typeof TypescriptServer.root).toBe("function");
  });

  test("has spawn function", () => {
    expect(typeof TypescriptServer.spawn).toBe("function");
  });
});

describe("DenoServer", () => {
  test("has correct id", () => {
    expect(DenoServer.id).toBe("deno");
  });

  test("supports TypeScript extensions", () => {
    expect(DenoServer.extensions).toContain(".ts");
    expect(DenoServer.extensions).toContain(".tsx");
    expect(DenoServer.extensions).toContain(".js");
  });
});

describe("PyrightServer", () => {
  test("has correct id", () => {
    expect(PyrightServer.id).toBe("pyright");
  });

  test("supports Python extensions", () => {
    expect(PyrightServer.extensions).toContain(".py");
    expect(PyrightServer.extensions).toContain(".pyi");
  });
});

describe("GoplsServer", () => {
  test("has correct id", () => {
    expect(GoplsServer.id).toBe("gopls");
  });

  test("supports Go extension", () => {
    expect(GoplsServer.extensions).toContain(".go");
  });
});

describe("RustAnalyzerServer", () => {
  test("has correct id", () => {
    expect(RustAnalyzerServer.id).toBe("rust-analyzer");
  });

  test("supports Rust extension", () => {
    expect(RustAnalyzerServer.extensions).toContain(".rs");
  });
});

describe("getServerById", () => {
  test("returns typescript server", () => {
    const server = getServerById("typescript");
    expect(server).toBeDefined();
    expect(server?.id).toBe("typescript");
  });

  test("returns undefined for unknown id", () => {
    const server = getServerById("unknown");
    expect(server).toBeUndefined();
  });
});

describe("getServersForExtension", () => {
  test("returns servers for .ts extension", () => {
    const servers = getServersForExtension(".ts");
    expect(servers.length).toBeGreaterThan(0);

    const serverIds = servers.map((s) => s.id);
    expect(serverIds).toContain("typescript");
  });

  test("returns servers for .py extension", () => {
    const servers = getServersForExtension(".py");
    expect(servers.length).toBeGreaterThan(0);

    const serverIds = servers.map((s) => s.id);
    expect(serverIds).toContain("pyright");
  });

  test("returns servers for .go extension", () => {
    const servers = getServersForExtension(".go");
    expect(servers.length).toBeGreaterThan(0);

    const serverIds = servers.map((s) => s.id);
    expect(serverIds).toContain("gopls");
  });

  test("returns empty array for unknown extension", () => {
    const servers = getServersForExtension(".unknown");
    expect(servers).toEqual([]);
  });
});
