/**
 * HTTP client for JetBrains plugin communication
 */

import { ApiError, ConnectionError, TimeoutError } from "../errors";
import { transformResponse } from "./response-transformer";
import type {
  FindSymbolRequest,
  FindSymbolResponse,
  FindReferencesRequest,
  FindReferencesResponse,
  GetSymbolsOverviewRequest,
  GetSymbolsOverviewResponse,
} from "../types/api";

export class JetBrainsClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(port: number, timeout: number = 30000) {
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.timeout = timeout;
  }

  /**
   * Makes an HTTP request to the JetBrains plugin service
   */
  private async request<T>(
    method: "GET" | "POST",
    endpoint: string,
    data?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
      };

      if (method === "POST" && data) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const text = await response.text();
        throw new ApiError(
          `API request failed with status ${response.status}: ${text}`,
          response.status
        );
      }

      const json = await response.json();
      return transformResponse<T>(json);
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TimeoutError(url, this.timeout);
      }

      throw new ConnectionError(
        `Failed to connect to JetBrains service at ${url}`,
        error
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Gets the project root path from the IDE
   */
  async getProjectRoot(): Promise<string> {
    const response = await this.request<{ project_root: string }>(
      "GET",
      "/status"
    );
    return response.project_root;
  }

  /**
   * Finds symbols by name path pattern
   */
  async findSymbol(params: {
    namePath: string;
    relativePath?: string | null;
    includeBody: boolean;
    depth: number;
    includeLocation: boolean;
    searchDeps: boolean;
  }): Promise<FindSymbolResponse> {
    const request: FindSymbolRequest = {
      namePath: params.namePath,
      relativePath: params.relativePath ?? null,
      includeBody: params.includeBody,
      depth: params.depth,
      includeLocation: params.includeLocation,
      searchDeps: params.searchDeps,
    };
    return this.request<FindSymbolResponse>("POST", "/findSymbol", request);
  }

  /**
   * Finds references to a symbol
   */
  async findReferences(params: {
    namePath: string;
    relativePath: string;
  }): Promise<FindReferencesResponse> {
    const request: FindReferencesRequest = {
      namePath: params.namePath,
      relativePath: params.relativePath,
    };
    return this.request<FindReferencesResponse>(
      "POST",
      "/findReferences",
      request
    );
  }

  /**
   * Gets an overview of top-level symbols in a file
   */
  async getSymbolsOverview(params: {
    relativePath: string;
  }): Promise<GetSymbolsOverviewResponse> {
    const request: GetSymbolsOverviewRequest = {
      relativePath: params.relativePath,
    };
    return this.request<GetSymbolsOverviewResponse>(
      "POST",
      "/getSymbolsOverview",
      request
    );
  }
}
