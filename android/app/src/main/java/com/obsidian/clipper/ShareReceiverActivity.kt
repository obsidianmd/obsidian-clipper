package com.obsidian.clipper

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.util.Patterns
import android.widget.Toast
import com.obsidian.clipper.BuildConfig
import androidx.appcompat.app.AppCompatActivity

/**
 * Activity that receives shared content from other apps.
 * This is the entry point when a user shares a URL to the clipper.
 */
class ShareReceiverActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "ShareReceiverActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "ShareReceiverActivity created with action: ${intent?.action}")
        }

        when (intent?.action) {
            Intent.ACTION_SEND -> handleSendIntent()
            Intent.ACTION_VIEW -> handleViewIntent()
            else -> {
                if (BuildConfig.DEBUG) {
                    Log.w(TAG, "Unknown action: ${intent?.action}")
                }
                finish()
            }
        }
    }

    private fun handleSendIntent() {
        if (intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Received shared text: $sharedText")
            }

            if (sharedText != null) {
                val url = extractUrl(sharedText)
                if (url != null) {
                    launchClipper(url)
                } else {
                    Toast.makeText(this, "No URL found in shared content", Toast.LENGTH_SHORT).show()
                    finish()
                }
            } else {
                Toast.makeText(this, "No content received", Toast.LENGTH_SHORT).show()
                finish()
            }
        } else {
            Toast.makeText(this, "Unsupported content type", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    private fun handleViewIntent() {
        val url = intent.data?.toString()
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Received VIEW intent with URL: $url")
        }

        if (url != null && isValidUrl(url)) {
            launchClipper(url)
        } else {
            Toast.makeText(this, "Invalid URL", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    /**
     * Extract a URL from text that may contain additional content
     */
    private fun extractUrl(text: String): String? {
        // First check if the entire text is a URL
        if (isValidUrl(text.trim())) {
            return text.trim()
        }

        // Try to find a URL in the text
        val matcher = Patterns.WEB_URL.matcher(text)
        if (matcher.find()) {
            val url = matcher.group()
            // Ensure it has a scheme
            return if (url.startsWith("http://") || url.startsWith("https://")) {
                url
            } else {
                "https://$url"
            }
        }

        return null
    }

    /**
     * Validate a URL
     */
    private fun isValidUrl(url: String): Boolean {
        return try {
            Patterns.WEB_URL.matcher(url).matches() &&
                    (url.startsWith("http://") || url.startsWith("https://"))
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Launch the ClipperActivity with the URL
     */
    private fun launchClipper(url: String) {
        val intent = Intent(this, ClipperActivity::class.java).apply {
            putExtra(ClipperActivity.EXTRA_URL, url)
        }
        startActivity(intent)
        finish()
    }
}
