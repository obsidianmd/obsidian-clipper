package com.obsidian.clipper

import com.obsidian.clipper.storage.ExtractedContent
import com.obsidian.clipper.storage.Template
import com.obsidian.clipper.storage.TemplateProperty
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Template engine for processing templates with variable substitution.
 * This is a simplified port of the web extension's template system.
 */
class TemplateEngine {

    companion object {
        private val VARIABLE_PATTERN = Regex("""\{\{([^}]+)\}\}""")
        private val FILTER_PATTERN = Regex("""^([^|]+)(?:\|(.+))?$""")
    }

    /**
     * Apply a template to extracted content
     */
    fun apply(template: Template, content: ExtractedContent): ProcessedTemplate {
        val variables = buildVariables(content)

        val noteName = processString(template.noteNameFormat, variables)
        val noteContent = processString(template.noteContentFormat, variables)
        val path = processString(template.path, variables)
        val properties = processProperties(template.properties, variables)

        return ProcessedTemplate(
            noteName = sanitizeFileName(noteName),
            noteContent = noteContent,
            path = path,
            properties = properties,
            behavior = template.getBehaviorEnum(),
            vault = template.vault ?: ""
        )
    }

    /**
     * Build variables map from extracted content
     */
    private fun buildVariables(content: ExtractedContent): Map<String, String> {
        val now = Date()
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US).apply {
            timeZone = TimeZone.getDefault()
        }
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

        return mapOf(
            "title" to content.title,
            "author" to content.author,
            "content" to content.contentMarkdown,
            "contentHtml" to content.content,
            "description" to content.description,
            "url" to content.url,
            "domain" to content.domain,
            "favicon" to content.favicon,
            "image" to content.image,
            "published" to content.published,
            "site" to content.site,
            "words" to content.wordCount.toString(),
            "date" to isoFormat.format(now),
            "time" to isoFormat.format(now),
            "date:YYYY-MM-DD" to dateFormat.format(now),
            "time:HH:mm:ss" to timeFormat.format(now),
            "noteName" to content.title
        )
    }

    /**
     * Process a string, replacing variables
     */
    private fun processString(template: String, variables: Map<String, String>): String {
        return VARIABLE_PATTERN.replace(template) { matchResult ->
            val fullMatch = matchResult.groupValues[1]
            processVariable(fullMatch, variables)
        }
    }

    /**
     * Process a single variable with optional filters
     */
    private fun processVariable(variable: String, variables: Map<String, String>): String {
        val filterMatch = FILTER_PATTERN.find(variable)
        if (filterMatch == null) {
            return variables[variable] ?: ""
        }

        val varName = filterMatch.groupValues[1].trim()
        val filtersStr = filterMatch.groupValues.getOrNull(2)?.trim()

        var value = variables[varName] ?: ""

        if (filtersStr != null && filtersStr.isNotEmpty()) {
            val filters = filtersStr.split("|").map { it.trim() }
            for (filter in filters) {
                value = applyFilter(value, filter)
            }
        }

        return value
    }

    /**
     * Apply a filter to a value
     */
    private fun applyFilter(value: String, filter: String): String {
        // Parse filter name and parameter
        val parenIndex = filter.indexOf('(')
        val filterName: String
        val param: String?

        if (parenIndex != -1) {
            filterName = filter.substring(0, parenIndex).trim()
            val endParen = filter.lastIndexOf(')')
            param = if (endParen > parenIndex) {
                filter.substring(parenIndex + 1, endParen).trim().removeSurrounding("\"").removeSurrounding("'")
            } else null
        } else {
            filterName = filter.trim()
            param = null
        }

        return when (filterName) {
            "lower", "lowercase" -> value.lowercase()
            "upper", "uppercase" -> value.uppercase()
            "capitalize" -> value.replaceFirstChar { it.uppercase() }
            "trim" -> value.trim()
            "slugify" -> slugify(value)
            "replace" -> {
                if (param != null) {
                    val parts = param.split(",", limit = 2)
                    if (parts.size == 2) {
                        value.replace(parts[0].trim(), parts[1].trim())
                    } else value
                } else value
            }
            "date" -> {
                // Format date - for simplicity, just return the value
                // A full implementation would parse and reformat dates
                value
            }
            "slice" -> {
                if (param != null) {
                    val parts = param.split(",").map { it.trim().toIntOrNull() }
                    when {
                        parts.size == 1 && parts[0] != null -> value.take(parts[0]!!)
                        parts.size == 2 && parts[0] != null && parts[1] != null -> {
                            val start = if (parts[0]!! < 0) maxOf(0, value.length + parts[0]!!) else parts[0]!!
                            val end = if (parts[1]!! < 0) maxOf(0, value.length + parts[1]!!) else minOf(parts[1]!!, value.length)
                            if (start < end) value.substring(start, end) else ""
                        }
                        else -> value
                    }
                } else value
            }
            "split" -> {
                // Return first element when split
                if (param != null) {
                    value.split(param).firstOrNull() ?: value
                } else value
            }
            "wikilink" -> "[[$value]]"
            "wikilink_list", "wikilinkList" -> {
                // Split by comma, clean up, and wrap each item in wikilinks
                // Returns YAML list format for frontmatter compatibility
                val items = value.split(",")
                    .map {
                        // Clean up author names - remove email-like suffixes like " <>" or " <email@example.com>"
                        it.trim().replace(Regex("\\s*<[^>]*>\\s*$"), "").trim()
                    }
                    .filter { it.isNotBlank() }

                if (items.size == 1) {
                    // Single item - just wrap in wikilink
                    "\"[[${items[0]}]]\""
                } else {
                    // Multiple items - format as YAML list
                    items.joinToString("\n") { "  - \"[[$it]]\"" }
                }
            }
            "blockquote" -> value.lines().joinToString("\n") { "> $it" }
            "list" -> value.lines().joinToString("\n") { "- $it" }
            else -> value
        }
    }

    /**
     * Convert string to URL-friendly slug
     */
    private fun slugify(text: String): String {
        return text.lowercase()
            .replace(Regex("[^a-z0-9\\s-]"), "")
            .replace(Regex("\\s+"), "-")
            .replace(Regex("-+"), "-")
            .trim('-')
    }

    /**
     * Process template properties
     */
    private fun processProperties(
        properties: List<TemplateProperty>,
        variables: Map<String, String>
    ): List<ProcessedProperty> {
        return properties.map { prop ->
            ProcessedProperty(
                name = processString(prop.name, variables),
                value = processString(prop.value, variables),
                type = prop.type ?: "text"
            )
        }
    }

    /**
     * Sanitize a file name for use across platforms
     */
    private fun sanitizeFileName(fileName: String): String {
        return fileName
            // Remove Obsidian-specific characters
            .replace(Regex("[#|\\^\\[\\]]"), "")
            // Remove characters not allowed in Android file names
            .replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1F]"), "")
            // Remove leading periods
            .replace(Regex("^\\.+"), "")
            .trim()
            .take(245) // Leave room for extension
            .ifEmpty { "Untitled" }
    }
}

/**
 * Result of applying a template
 */
data class ProcessedTemplate(
    val noteName: String,
    val noteContent: String,
    val path: String,
    val properties: List<ProcessedProperty>,
    val behavior: com.obsidian.clipper.storage.TemplateBehavior,
    val vault: String
)

/**
 * Processed property
 */
data class ProcessedProperty(
    val name: String,
    val value: String,
    val type: String
)
