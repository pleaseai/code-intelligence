/**
 * JetBrains Plugin API Types
 */

/**
 * Symbol location in source file
 */
export interface SymbolLocation {
  start_line: number;
  end_line: number;
  start_column: number;
  end_column: number;
}

/**
 * Symbol information returned by the JetBrains plugin
 */
export interface SymbolInfo {
  name: string;
  name_path: string;
  kind: string;
  relative_path: string;
  location?: SymbolLocation;
  body?: string;
  children?: SymbolInfo[];
}

/**
 * Request for POST /findSymbol
 */
export interface FindSymbolRequest {
  namePath: string;
  relativePath?: string | null;
  includeBody: boolean;
  depth: number;
  includeLocation: boolean;
  searchDeps: boolean;
}

/**
 * Response from POST /findSymbol
 */
export interface FindSymbolResponse {
  symbols: SymbolInfo[];
}

/**
 * Request for POST /findReferences
 */
export interface FindReferencesRequest {
  namePath: string;
  relativePath: string;
}

/**
 * Response from POST /findReferences
 */
export interface FindReferencesResponse {
  symbols: SymbolInfo[];
}

/**
 * Request for POST /getSymbolsOverview
 */
export interface GetSymbolsOverviewRequest {
  relativePath: string;
}

/**
 * Response from POST /getSymbolsOverview
 */
export interface GetSymbolsOverviewResponse {
  symbols: SymbolInfo[];
}
