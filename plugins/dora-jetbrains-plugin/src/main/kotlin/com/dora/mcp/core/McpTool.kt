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
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Based on JetBrains MCP Server Plugin
 * https://github.com/JetBrains/mcp-server-plugin
 */
package com.dora.mcp.core

import com.intellij.openapi.project.Project
import kotlinx.serialization.KSerializer
import kotlin.reflect.KClass

/**
 * Interface for MCP tools that can be invoked by AI clients.
 */
interface McpTool<Args : Any> {
    /** Tool name (used in API calls) */
    val name: String

    /** Tool description (shown to AI clients) */
    val description: String

    /**
     * Execute the tool with given arguments.
     * @param project The current IntelliJ project
     * @param args Tool-specific arguments
     * @return Response with status or error
     */
    fun handle(project: Project, args: Args): Response
}

/**
 * Abstract base class for MCP tools with kotlinx.serialization support.
 */
abstract class AbstractMcpTool<Args : Any>(
    val serializer: KSerializer<Args>
) : McpTool<Args> {

    /**
     * Get the KClass of the Args type parameter.
     */
    val argKlass: KClass<Args> by lazy {
        val supertype = this::class.supertypes.find {
            it.classifier == AbstractMcpTool::class
        } ?: error("Cannot find AbstractMcpTool supertype")

        val typeArgument = supertype.arguments.first().type
            ?: error("Cannot find type argument for AbstractMcpTool")

        @Suppress("UNCHECKED_CAST")
        typeArgument.classifier as KClass<Args>
    }
}
