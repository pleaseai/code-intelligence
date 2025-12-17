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

import kotlinx.serialization.Serializable

/**
 * Empty arguments placeholder for tools with no parameters.
 */
@Serializable
object NoArgs

/**
 * Response from MCP tool execution.
 * @param status Success message/result
 * @param error Error message if failed
 */
@Serializable
data class Response(
    val status: String? = null,
    val error: String? = null
)

/**
 * Tool information sent to MCP clients.
 */
@Serializable
data class ToolInfo(
    val name: String,
    val description: String,
    val inputSchema: JsonSchemaObject
)

/**
 * JSON Schema object for tool input parameters.
 */
@Serializable
data class JsonSchemaObject(
    val type: String,
    val properties: Map<String, PropertySchema> = emptyMap(),
    val required: List<String> = emptyList(),
    val items: PropertySchema? = null
)

/**
 * JSON Schema property definition.
 */
@Serializable
data class PropertySchema(
    val type: String
)
