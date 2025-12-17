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

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.BufferExposingByteArrayOutputStream
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpMethod
import io.netty.handler.codec.http.QueryStringDecoder
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import org.jetbrains.ide.RestService
import java.nio.charset.StandardCharsets
import kotlin.reflect.full.primaryConstructor

/**
 * HTTP REST service for MCP tool invocation.
 * Exposes tools at /api/dora/{tool_name}
 */
class McpService : RestService() {
    private val serviceName = "dora"
    private val log = logger<McpService>()

    private val json = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
    }

    override fun getServiceName(): String = serviceName

    override fun getMaxRequestsPerMinute(): Int = Int.MAX_VALUE

    override fun execute(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): String? {
        val path = urlDecoder.path().split(serviceName).last().trimStart('/')
        val project = getLastFocusedOrOpenedProject() ?: return null
        val tools = McpToolManager.getAllTools()

        when (path) {
            "list_tools" -> handleListTools(tools, request, context)
            else -> handleToolExecution(path, tools, request, context, project)
        }
        return null
    }

    private fun handleListTools(
        tools: List<AbstractMcpTool<*>>,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ) {
        val toolsList = tools.map { tool ->
            ToolInfo(
                name = tool.name,
                description = tool.description,
                inputSchema = schemaFromDataClass(tool.argKlass)
            )
        }
        sendJson(toolsList, request, context)
    }

    private fun handleToolExecution(
        path: String,
        tools: List<AbstractMcpTool<*>>,
        request: FullHttpRequest,
        context: ChannelHandlerContext,
        project: Project
    ) {
        val tool = tools.find { it.name == path } ?: run {
            sendJson(Response(error = "Unknown tool: $path"), request, context)
            return
        }

        val args = try {
            parseArgs(request, tool.serializer)
        } catch (e: Throwable) {
            log.warn("Failed to parse arguments for tool $path", e)
            sendJson(Response(error = e.message), request, context)
            return
        }

        val result = try {
            toolHandle(tool, project, args)
        } catch (e: Throwable) {
            log.warn("Failed to execute tool $path", e)
            Response(error = "Failed to execute tool $path: ${e.message}")
        }
        sendJson(result, request, context)
    }

    @Suppress("UNCHECKED_CAST")
    private fun sendJson(data: Any, request: FullHttpRequest, context: ChannelHandlerContext) {
        val jsonString = when (data) {
            is List<*> -> json.encodeToString(
                ListSerializer(ToolInfo.serializer()),
                data as List<ToolInfo>
            )
            is Response -> json.encodeToString(Response.serializer(), data)
            else -> throw IllegalArgumentException("Unsupported type for serialization")
        }
        val outputStream = BufferExposingByteArrayOutputStream()
        outputStream.write(jsonString.toByteArray(StandardCharsets.UTF_8))
        send(outputStream, request, context)
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> parseArgs(request: FullHttpRequest, serializer: kotlinx.serialization.KSerializer<T>): T {
        val body = request.content().toString(StandardCharsets.UTF_8)
        if (body.isEmpty()) {
            return NoArgs as T
        }
        return json.decodeFromString(serializer, body)
    }

    private fun <Args : Any> toolHandle(tool: McpTool<Args>, project: Project, args: Any): Response {
        @Suppress("UNCHECKED_CAST")
        return tool.handle(project, args as Args)
    }

    override fun isMethodSupported(method: HttpMethod): Boolean =
        method === HttpMethod.GET || method === HttpMethod.POST

    private fun schemaFromDataClass(kClass: kotlin.reflect.KClass<*>): JsonSchemaObject {
        if (kClass == NoArgs::class) return JsonSchemaObject(type = "object")

        val constructor = kClass.primaryConstructor
            ?: error("Class ${kClass.simpleName} must have a primary constructor")

        val properties = constructor.parameters.mapNotNull { param ->
            param.name?.let { name ->
                name to when (param.type.classifier) {
                    String::class -> PropertySchema("string")
                    Int::class, Long::class, Double::class, Float::class -> PropertySchema("number")
                    Boolean::class -> PropertySchema("boolean")
                    List::class -> PropertySchema("array")
                    else -> PropertySchema("object")
                }
            }
        }.toMap()

        val required = constructor.parameters
            .filter { !it.type.isMarkedNullable && !it.isOptional }
            .mapNotNull { it.name }

        return JsonSchemaObject(
            type = "object",
            properties = properties,
            required = required
        )
    }
}
