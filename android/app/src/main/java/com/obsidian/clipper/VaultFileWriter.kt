package com.obsidian.clipper

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import com.obsidian.clipper.BuildConfig

/**
 * Writes notes directly to the Obsidian vault folder using Storage Access Framework.
 * This allows saving without opening Obsidian.
 */
class VaultFileWriter(private val context: Context) {

    companion object {
        private const val TAG = "VaultFileWriter"
    }

    /**
     * Write a note directly to the vault folder
     *
     * @param vaultUri The SAF URI for the vault root folder (from folder picker)
     * @param path The subfolder path within the vault (e.g., "Clippings")
     * @param noteName The note filename (without .md extension)
     * @param content The markdown content to write
     * @return true if successful, false otherwise
     */
    fun writeNote(
        vaultUri: Uri,
        path: String,
        noteName: String,
        content: String
    ): Boolean {
        return try {
            // Get the vault root
            val vaultRoot = DocumentFile.fromTreeUri(context, vaultUri)
            if (vaultRoot == null || !vaultRoot.exists()) {
                Log.e(TAG, "Vault folder not accessible")
                return false
            }

            // Navigate to or create the target folder
            val targetFolder = getOrCreateFolder(vaultRoot, path)
            if (targetFolder == null) {
                Log.e(TAG, "Failed to access or create folder: $path")
                return false
            }

            // Sanitize filename and add extension
            val fileName = sanitizeFileName(noteName) + ".md"

            // Check if file already exists
            var existingFile = targetFolder.findFile(fileName)

            if (existingFile != null && existingFile.exists()) {
                // Overwrite existing file
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Overwriting existing file: $fileName")
                }
                context.contentResolver.openOutputStream(existingFile.uri, "wt")?.use { outputStream ->
                    outputStream.write(content.toByteArray(Charsets.UTF_8))
                }
            } else {
                // Create new file
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Creating new file: $fileName")
                }
                val newFile = targetFolder.createFile("text/markdown", fileName)
                if (newFile == null) {
                    Log.e(TAG, "Failed to create file: $fileName")
                    return false
                }
                context.contentResolver.openOutputStream(newFile.uri)?.use { outputStream ->
                    outputStream.write(content.toByteArray(Charsets.UTF_8))
                }
            }

            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Successfully wrote note: $path/$fileName")
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write note", e)
            false
        }
    }

    /**
     * Navigate to or create a folder path within the vault
     */
    private fun getOrCreateFolder(root: DocumentFile, path: String): DocumentFile? {
        if (path.isBlank()) {
            return root
        }

        var current = root
        val parts = path.split("/").filter { it.isNotBlank() }

        for (part in parts) {
            val existing = current.findFile(part)
            current = if (existing != null && existing.isDirectory) {
                existing
            } else {
                // Create the folder
                current.createDirectory(part) ?: return null
            }
        }

        return current
    }

    /**
     * Sanitize filename for filesystem compatibility
     */
    private fun sanitizeFileName(name: String): String {
        // Remove or replace characters that are invalid in filenames
        return name
            .replace(Regex("[<>:\"/\\\\|?*]"), "-")
            .replace(Regex("\\s+"), " ")
            .trim()
            .take(200) // Limit length
    }

    /**
     * Check if we have persistent access to the vault folder
     */
    fun hasVaultAccess(vaultUri: Uri): Boolean {
        return try {
            val vaultRoot = DocumentFile.fromTreeUri(context, vaultUri)
            vaultRoot != null && vaultRoot.exists() && vaultRoot.canWrite()
        } catch (e: Exception) {
            Log.e(TAG, "Error checking vault access", e)
            false
        }
    }
}
