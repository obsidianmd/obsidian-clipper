package com.obsidian.clipper

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import com.obsidian.clipper.BuildConfig
import com.obsidian.clipper.storage.TemplateBehavior

/**
 * Handles launching Obsidian with the clipped content via URI scheme
 */
object ObsidianLauncher {

    private const val TAG = "ObsidianLauncher"
    private const val OBSIDIAN_PACKAGE = "md.obsidian"

    /**
     * Check if Obsidian is installed
     */
    fun isObsidianInstalled(context: Context): Boolean {
        return try {
            context.packageManager.getPackageInfo(OBSIDIAN_PACKAGE, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * Open Obsidian Play Store page for installation
     */
    fun openObsidianStore(context: Context) {
        try {
            context.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=$OBSIDIAN_PACKAGE")
                )
            )
        } catch (e: Exception) {
            // Fallback to browser
            context.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=$OBSIDIAN_PACKAGE")
                )
            )
        }
    }

    /**
     * Create a new note in Obsidian
     *
     * Uses the obsidian:// URI scheme with clipboard for content
     * to avoid URI length limitations
     */
    fun createNote(
        context: Context,
        vault: String,
        path: String,
        noteName: String,
        content: String,
        behavior: TemplateBehavior
    ): Boolean {
        return try {
            // Copy content to clipboard (Obsidian will read from clipboard with &clipboard flag)
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("obsidian-note", content))

            // Build URI
            val uri = buildObsidianUri(vault, path, noteName, behavior)
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Launching Obsidian with URI: $uri")
            }

            // Launch Obsidian
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch Obsidian", e)
            false
        }
    }

    /**
     * Build the obsidian:// URI
     */
    private fun buildObsidianUri(
        vault: String,
        path: String,
        noteName: String,
        behavior: TemplateBehavior
    ): String {
        return buildString {
            when (behavior) {
                TemplateBehavior.APPEND_DAILY, TemplateBehavior.PREPEND_DAILY -> {
                    // Use daily note endpoint
                    append("obsidian://daily?")
                }
                else -> {
                    // Use new note endpoint
                    append("obsidian://new?")

                    // File path
                    val fullPath = if (path.isNotBlank()) {
                        "$path/$noteName"
                    } else {
                        noteName
                    }
                    append("file=")
                    append(Uri.encode(fullPath))
                    append("&")
                }
            }

            // Add vault if specified
            if (vault.isNotBlank()) {
                append("vault=")
                append(Uri.encode(vault))
                append("&")
            }

            // Add behavior flags
            when (behavior) {
                TemplateBehavior.APPEND_SPECIFIC, TemplateBehavior.APPEND_DAILY -> {
                    append("append=true&")
                }
                TemplateBehavior.PREPEND_SPECIFIC, TemplateBehavior.PREPEND_DAILY -> {
                    append("prepend=true&")
                }
                TemplateBehavior.OVERWRITE -> {
                    append("overwrite=true&")
                }
                else -> {
                    // CREATE - no extra flag needed
                }
            }

            // Use clipboard for content
            append("clipboard")
        }
    }

    /**
     * Open a specific vault in Obsidian
     */
    fun openVault(context: Context, vault: String): Boolean {
        return try {
            val uri = "obsidian://open?vault=${Uri.encode(vault)}"
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open vault", e)
            false
        }
    }

    /**
     * Search in Obsidian
     */
    fun searchInObsidian(context: Context, vault: String, query: String): Boolean {
        return try {
            val uri = buildString {
                append("obsidian://search?")
                if (vault.isNotBlank()) {
                    append("vault=")
                    append(Uri.encode(vault))
                    append("&")
                }
                append("query=")
                append(Uri.encode(query))
            }
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to search in Obsidian", e)
            false
        }
    }
}
