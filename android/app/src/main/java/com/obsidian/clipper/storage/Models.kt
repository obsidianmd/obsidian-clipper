package com.obsidian.clipper.storage

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Template behavior options matching the web extension
 */
enum class TemplateBehavior {
    CREATE,
    APPEND_SPECIFIC,
    APPEND_DAILY,
    PREPEND_SPECIFIC,
    PREPEND_DAILY,
    OVERWRITE
}

/**
 * Template property for frontmatter
 */
@Serializable
data class TemplateProperty(
    val id: String? = null,
    val name: String,
    val value: String,
    val type: String? = null
)

/**
 * Template definition matching the web extension format
 */
@Serializable
data class Template(
    val id: String,
    val name: String,
    val behavior: String = "create",
    val noteNameFormat: String = "{{title}}",
    val path: String = "",
    val noteContentFormat: String = "{{content}}",
    val properties: List<TemplateProperty> = emptyList(),
    val triggers: List<String>? = null,
    val vault: String? = null,
    val context: String? = null
) {
    fun getBehaviorEnum(): TemplateBehavior {
        return when (behavior) {
            "create" -> TemplateBehavior.CREATE
            "append-specific" -> TemplateBehavior.APPEND_SPECIFIC
            "append-daily" -> TemplateBehavior.APPEND_DAILY
            "prepend-specific" -> TemplateBehavior.PREPEND_SPECIFIC
            "prepend-daily" -> TemplateBehavior.PREPEND_DAILY
            "overwrite" -> TemplateBehavior.OVERWRITE
            else -> TemplateBehavior.CREATE
        }
    }

    companion object {
        val DEFAULT = Template(
            id = "default",
            name = "Default",
            behavior = "create",
            noteNameFormat = "{{title}}",
            path = "Clippings",
            noteContentFormat = """
---
source: "{{url}}"
author:
{{author|wikilink_list}}
published: {{published}}
created: {{date}}
description: "{{description}}"
tags:
  - clippings
categories:
  - "[[Clippings]]"
---
# {{title}}

{{content}}
            """.trimIndent(),
            properties = emptyList()
        )
    }
}

/**
 * Extracted content from a web page
 */
@Serializable
data class ExtractedContent(
    val title: String = "",
    val author: String = "",
    val content: String = "",
    val contentMarkdown: String = "",
    val description: String = "",
    val url: String = "",
    val domain: String = "",
    val favicon: String = "",
    val image: String = "",
    val published: String = "",
    val site: String = "",
    val wordCount: Int = 0,
    val schemaOrgData: JsonElement? = null,
    val metaTags: List<MetaTag> = emptyList()
)

@Serializable
data class MetaTag(
    val name: String? = null,
    val property: String? = null,
    val content: String? = null
)

/**
 * Selection content
 */
@Serializable
data class SelectionContent(
    val html: String,
    val markdown: String
)

/**
 * App settings
 */
@Serializable
data class AppSettings(
    val vaults: List<String> = listOf(""),
    val defaultVault: String = "",
    val defaultTemplateId: String = "default",
    val silentMode: Boolean = false,
    val autoSave: Boolean = false,       // Skip preview, save immediately
    val silentSave: Boolean = false,     // Don't open Obsidian after saving
    val directSave: Boolean = false,     // Write directly to vault folder instead of using Obsidian URI
    val vaultFolderUri: String = "",     // SAF URI for direct vault folder access
    val templates: List<Template> = listOf(Template.DEFAULT)
)
