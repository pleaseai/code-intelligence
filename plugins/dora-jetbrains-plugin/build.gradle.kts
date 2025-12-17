plugins {
    id("org.jetbrains.intellij.platform") version "2.2.0"
    kotlin("jvm") version "1.9.24"
    kotlin("plugin.serialization") version "1.9.24"
}

group = "com.dora"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.2")
    }

    // Kotlinx serialization (compileOnly to avoid conflicts with IDE bundled version)
    compileOnly("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
}

intellijPlatform {
    pluginConfiguration {
        id = "com.dora.mcp"
        name = "Dora MCP Server"
        version = project.version.toString()
        description = """
            MCP server for AI-powered code navigation.
            - find_symbol: Find symbols by name pattern
            - find_references: Find references to a symbol
            - get_symbols_overview: Get file's top-level symbols
        """.trimIndent()

        ideaVersion {
            sinceBuild.set("242")
            untilBuild.set("253.*")
        }
    }
}

kotlin {
    jvmToolchain(17)
}

tasks {
    buildSearchableOptions {
        enabled = false
    }
}
