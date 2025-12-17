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
import com.intellij.ide.structureView.StructureViewTreeElement
import com.intellij.ide.structureView.TreeBasedStructureViewBuilder
import com.intellij.lang.LanguageStructureViewBuilder
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiNamedElement
import kotlinx.serialization.Serializable

@Serializable
data class GetSymbolsOverviewArgs(
    val filePath: String,
    val depth: Int = 1
)

/**
 * Get an overview of top-level symbols in a file.
 * Uses IntelliJ's StructureView for accurate symbol extraction.
 */
class GetSymbolsOverviewTool : AbstractMcpTool<GetSymbolsOverviewArgs>(GetSymbolsOverviewArgs.serializer()) {
    override val name: String = "get_symbols_overview"

    override val description: String = """
        Get an overview of symbols (classes, methods, functions) in a file.

        Parameters:
        - filePath: Path to the file (relative to project root)
        - depth: How deep to traverse nested symbols (default: 1, 0 = top-level only)

        Returns a JSON array of symbols with:
        - name: Symbol name
        - kind: Symbol type (class, method, function, etc.)
        - line: Line number where the symbol is defined
        - children: Nested symbols (if depth > 0)
    """.trimIndent()

    override fun handle(project: Project, args: GetSymbolsOverviewArgs): Response {
        return runReadAction {
            try {
                val projectPath = project.basePath
                    ?: return@runReadAction Response(error = "Cannot find project path")

                val absolutePath = if (args.filePath.startsWith("/")) {
                    args.filePath
                } else {
                    "$projectPath/${args.filePath}"
                }

                val virtualFile = LocalFileSystem.getInstance().findFileByPath(absolutePath)
                    ?: return@runReadAction Response(error = "File not found: ${args.filePath}")

                val psiFile = PsiManager.getInstance(project).findFile(virtualFile)
                    ?: return@runReadAction Response(error = "Cannot parse file: ${args.filePath}")

                val document = psiFile.viewProvider.document
                    ?: return@runReadAction Response(error = "Cannot get document for file")

                // Get structure view
                @Suppress("DEPRECATION")
                val builder = LanguageStructureViewBuilder.INSTANCE.getStructureViewBuilder(psiFile)

                val symbols = if (builder is TreeBasedStructureViewBuilder) {
                    val model = builder.createStructureViewModel(null)
                    val root = model.root
                    extractSymbols(root, document, 0, args.depth)
                } else {
                    // Fallback: simple PSI-based extraction
                    extractSymbolsFromPsi(psiFile, document, args.depth)
                }

                Response(formatJsonArray(symbols))
            } catch (e: Exception) {
                Response(error = "Error getting symbols overview: ${e.message}")
            }
        }
    }

    private fun extractSymbols(
        element: StructureViewTreeElement,
        document: Document,
        currentDepth: Int,
        maxDepth: Int
    ): List<Map<String, Any?>> {
        val results = mutableListOf<Map<String, Any?>>()

        for (child in element.children) {
            if (child is StructureViewTreeElement) {
                val psiElement = child.value as? PsiElement ?: continue
                val name = child.presentation.presentableText ?: continue

                val textRange = psiElement.textRange
                val line = document.getLineNumber(textRange.startOffset) + 1

                val symbolInfo = mutableMapOf<String, Any?>(
                    "name" to name,
                    "kind" to getSymbolKind(psiElement),
                    "line" to line
                )

                // Add children if within depth limit
                if (currentDepth < maxDepth) {
                    val children = extractSymbols(child, document, currentDepth + 1, maxDepth)
                    if (children.isNotEmpty()) {
                        symbolInfo["children"] = children
                    }
                }

                results.add(symbolInfo)
            }
        }

        return results
    }

    private fun extractSymbolsFromPsi(
        psiFile: PsiFile,
        document: Document,
        maxDepth: Int
    ): List<Map<String, Any?>> {
        val results = mutableListOf<Map<String, Any?>>()

        for (child in psiFile.children) {
            if (child is PsiNamedElement) {
                val name = child.name ?: continue
                val textRange = child.textRange
                val line = document.getLineNumber(textRange.startOffset) + 1

                val symbolInfo = mutableMapOf<String, Any?>(
                    "name" to name,
                    "kind" to getSymbolKind(child),
                    "line" to line
                )

                // Add children for classes/objects
                if (maxDepth > 0) {
                    val children = extractChildSymbols(child, document, 0, maxDepth)
                    if (children.isNotEmpty()) {
                        symbolInfo["children"] = children
                    }
                }

                results.add(symbolInfo)
            }
        }

        return results
    }

    private fun extractChildSymbols(
        element: PsiElement,
        document: Document,
        currentDepth: Int,
        maxDepth: Int
    ): List<Map<String, Any?>> {
        if (currentDepth >= maxDepth) return emptyList()

        val results = mutableListOf<Map<String, Any?>>()

        for (child in element.children) {
            if (child is PsiNamedElement) {
                val name = child.name ?: continue
                val textRange = child.textRange
                val line = document.getLineNumber(textRange.startOffset) + 1

                val symbolInfo = mutableMapOf<String, Any?>(
                    "name" to name,
                    "kind" to getSymbolKind(child),
                    "line" to line
                )

                val nestedChildren = extractChildSymbols(child, document, currentDepth + 1, maxDepth)
                if (nestedChildren.isNotEmpty()) {
                    symbolInfo["children"] = nestedChildren
                }

                results.add(symbolInfo)
            }
        }

        return results
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
            className.contains("Constructor") -> "constructor"
            else -> "symbol"
        }
    }

    private fun formatJsonArray(items: List<Map<String, Any?>>): String {
        if (items.isEmpty()) return "[]"
        return items.joinToString(",\n", prefix = "[\n", postfix = "\n]") { item ->
            formatJsonObject(item, "  ")
        }
    }

    private fun formatJsonObject(map: Map<String, Any?>, indent: String): String {
        val entries = map.entries.joinToString(",\n") { (key, value) ->
            "$indent  \"$key\": ${formatJsonValue(value, "$indent  ")}"
        }
        return "{\n$entries\n$indent}"
    }

    private fun formatJsonValue(value: Any?, indent: String): String {
        return when (value) {
            null -> "null"
            is String -> "\"${escapeJson(value)}\""
            is Number -> value.toString()
            is Boolean -> value.toString()
            is Map<*, *> -> {
                @Suppress("UNCHECKED_CAST")
                formatJsonObject(value as Map<String, Any?>, indent)
            }
            is List<*> -> {
                if (value.isEmpty()) "[]"
                else value.joinToString(",\n", "[\n", "\n$indent]") {
                    "$indent  ${formatJsonValue(it, "$indent  ")}"
                }
            }
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
