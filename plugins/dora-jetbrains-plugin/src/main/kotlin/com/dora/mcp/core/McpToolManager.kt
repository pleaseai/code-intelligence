/*
 * Copyright 2024 JetBrains s.r.o. and contributors.
 * Copyright 2024 Dora contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Based on JetBrains MCP Server Plugin
 * https://github.com/JetBrains/mcp-server-plugin
 */
package com.dora.mcp.core

import com.dora.mcp.tools.FindReferencesTool
import com.dora.mcp.tools.FindSymbolTool
import com.dora.mcp.tools.GetSymbolsOverviewTool

/**
 * Manager for MCP tools.
 * Provides access to all registered tools.
 */
object McpToolManager {

    /**
     * Get all available MCP tools.
     */
    fun getAllTools(): List<AbstractMcpTool<*>> = listOf(
        FindSymbolTool(),
        FindReferencesTool(),
        GetSymbolsOverviewTool(),
    )

    /**
     * Find a tool by name.
     */
    fun findTool(name: String): AbstractMcpTool<*>? =
        getAllTools().find { it.name == name }
}
