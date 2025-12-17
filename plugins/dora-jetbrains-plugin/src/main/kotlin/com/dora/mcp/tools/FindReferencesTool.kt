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
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiManager
import com.intellij.psi.PsiNamedElement
import com.intellij.psi.PsiRecursiveElementVisitor
import com.intellij.psi.search.searches.ReferencesSearch
import kotlinx.serialization.Serializable

@Serializable
data class FindReferencesArgs(
    val symbolName: String,
    val filePath: String,
    val maxResults: Int = 100
)

/**
 * Find all references to a symbol in the codebase.
 * Uses IntelliJ's ReferencesSearch for accurate reference finding.
 */
class FindReferencesTool : AbstractMcpTool<FindReferencesArgs>(FindReferencesArgs.serializer()) {
    override val name: String = "find_references"

    override val description: String = """
        Find all references to a symbol in the codebase.

        Parameters:
        - symbolName: Name of the symbol to find references for
        - filePath: Path to the file containing the symbol (relative to project root)
        - maxResults: Maximum number of references to return (default: 100)

        Returns a JSON array of references with:
        - path: File path where the reference is found
        - line: Line number
        - column: Column number
        - context: Surrounding code context
    """.trimIndent()

    override fun handle(project: Project, args: FindReferencesArgs): Response {
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

                // Find the symbol in the file
                val symbol = findSymbolInFile(psiFile, args.symbolName)
                    ?: return@runReadAction Response(error = "Symbol '${args.symbolName}' not found in file")

                // Search for references
                val references = ReferencesSearch.search(symbol).findAll()
                val results = mutableListOf<Map<String, Any?>>()

                for (reference in references.take(args.maxResults)) {
                    val element = reference.element
                    val refFile = element.containingFile ?: continue
                    val refVirtualFile = refFile.virtualFile ?: continue
                    val document = refFile.viewProvider.document ?: continue

                    val textRange = element.textRange
                    val line = document.getLineNumber(textRange.startOffset) + 1
                    val column = textRange.startOffset - document.getLineStartOffset(line - 1) + 1

                    val relativePath = refVirtualFile.path.removePrefix(projectPath).removePrefix("/")

                    // Get context (the line containing the reference)
                    val lineStart = document.getLineStartOffset(line - 1)
                    val lineEnd = document.getLineEndOffset(line - 1)
                    val context = document.getText(TextRange(lineStart, lineEnd)).trim()

                    results.add(mapOf(
                        "path" to relativePath,
                        "line" to line,
                        "column" to column,
                        "context" to context.take(200)
                    ))
                }

                Response(formatJsonArray(results))
            } catch (e: Exception) {
                Response(error = "Error finding references: ${e.message}")
            }
        }
    }

    private fun findSymbolInFile(psiFile: com.intellij.psi.PsiFile, symbolName: String): PsiElement? {
        var foundElement: PsiElement? = null

        psiFile.accept(object : PsiRecursiveElementVisitor() {
            override fun visitElement(element: PsiElement) {
                if (foundElement != null) return

                if (element is PsiNamedElement && element.name == symbolName) {
                    foundElement = element
                    return
                }
                super.visitElement(element)
            }
        })

        return foundElement
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
