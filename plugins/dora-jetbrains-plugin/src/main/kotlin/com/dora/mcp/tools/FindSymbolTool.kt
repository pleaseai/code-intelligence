/*
 * Copyright 2024 Dora contributors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
package com.dora.mcp.tools

import com.dora.mcp.core.AbstractMcpTool
import com.dora.mcp.core.Response
import com.intellij.ide.util.gotoByName.GotoSymbolModel2
import com.intellij.navigation.NavigationItem
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiNamedElement
import kotlinx.serialization.Serializable

@Serializable
data class FindSymbolArgs(
    val pattern: String,
    val maxResults: Int = 50,
    val includeBody: Boolean = false
)

/**
 * Find symbols by name pattern across the codebase.
 * Uses IntelliJ's GotoSymbolModel for efficient symbol search.
 */
class FindSymbolTool : AbstractMcpTool<FindSymbolArgs>(FindSymbolArgs.serializer()) {
    override val name: String = "find_symbol"

    override val description: String = """
        Find symbols (classes, methods, functions, variables) by name pattern.

        Parameters:
        - pattern: Name pattern to search for (supports wildcards like * and ?)
        - maxResults: Maximum number of results to return (default: 50)
        - includeBody: Whether to include source code of the symbol (default: false)

        Returns a JSON array of matching symbols with:
        - name: Symbol name
        - kind: Symbol type (class, method, function, etc.)
        - path: File path relative to project
        - location: Line and column information
        - body: Source code (if includeBody is true)
    """.trimIndent()

    override fun handle(project: Project, args: FindSymbolArgs): Response {
        return runReadAction {
            try {
                @Suppress("DEPRECATION")
                val model = GotoSymbolModel2(project)
                val names = model.getNames(false)

                val matchingNames = names.filter { name ->
                    matchesPattern(name, args.pattern)
                }.take(args.maxResults)

                val results = mutableListOf<Map<String, Any?>>()

                for (name in matchingNames) {
                    val elements = model.getElementsByName(name, false, name)
                    for (element in elements) {
                        if (element is NavigationItem && element is PsiElement) {
                            val symbolInfo = extractSymbolInfo(project, element, args.includeBody)
                            if (symbolInfo != null) {
                                results.add(symbolInfo)
                                if (results.size >= args.maxResults) break
                            }
                        }
                    }
                    if (results.size >= args.maxResults) break
                }

                Response(formatJsonArray(results))
            } catch (e: Exception) {
                Response(error = "Error searching symbols: ${e.message}")
            }
        }
    }

    private fun matchesPattern(name: String, pattern: String): Boolean {
        if (pattern.contains("*") || pattern.contains("?")) {
            val regex = pattern
                .replace(".", "\\.")
                .replace("*", ".*")
                .replace("?", ".")
                .toRegex(RegexOption.IGNORE_CASE)
            return regex.matches(name)
        }
        return name.contains(pattern, ignoreCase = true)
    }

    private fun extractSymbolInfo(
        project: Project,
        element: PsiElement,
        includeBody: Boolean
    ): Map<String, Any?>? {
        val file = element.containingFile ?: return null
        val virtualFile = file.virtualFile ?: return null
        val document = file.viewProvider.document ?: return null

        val projectPath = project.basePath ?: return null
        val relativePath = virtualFile.path.removePrefix(projectPath).removePrefix("/")

        val textRange = element.textRange
        val startLine = document.getLineNumber(textRange.startOffset) + 1
        val startColumn = textRange.startOffset - document.getLineStartOffset(startLine - 1) + 1

        val name = (element as? PsiNamedElement)?.name ?: element.text.take(50)
        val kind = getSymbolKind(element)

        val result = mutableMapOf<String, Any?>(
            "name" to name,
            "kind" to kind,
            "path" to relativePath,
            "location" to mapOf(
                "line" to startLine,
                "column" to startColumn
            )
        )

        if (includeBody) {
            result["body"] = element.text.take(2000)
        }

        return result
    }

    private fun getSymbolKind(element: PsiElement): String {
        val className = element.javaClass.simpleName
        return when {
            className.contains("Class") -> "class"
            className.contains("Method") -> "method"
            className.contains("Function") -> "function"
            className.contains("Field") -> "field"
            className.contains("Property") -> "property"
            className.contains("Variable") -> "variable"
            className.contains("Interface") -> "interface"
            className.contains("Enum") -> "enum"
            className.contains("Object") -> "object"
            else -> "symbol"
        }
    }

    private fun formatJsonArray(items: List<Map<String, Any?>>): String {
        if (items.isEmpty()) return "[]"
        return items.joinToString(",\n", prefix = "[\n", postfix = "\n]") { item ->
            formatJsonObject(item)
        }
    }

    private fun formatJsonObject(map: Map<String, Any?>): String {
        val entries = map.entries.joinToString(", ") { (key, value) ->
            "\"$key\": ${formatJsonValue(value)}"
        }
        return "  {$entries}"
    }

    private fun formatJsonValue(value: Any?): String {
        return when (value) {
            null -> "null"
            is String -> "\"${escapeJson(value)}\""
            is Number -> value.toString()
            is Boolean -> value.toString()
            is Map<*, *> -> {
                val entries = value.entries.joinToString(", ") { (k, v) ->
                    "\"$k\": ${formatJsonValue(v)}"
                }
                "{$entries}"
            }
            is List<*> -> value.joinToString(", ", "[", "]") { formatJsonValue(it) }
            else -> "\"${escapeJson(value.toString())}\""
        }
    }

    private fun escapeJson(s: String): String {
        return s.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    }
}
