package com.obsidian.clipper

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.obsidian.clipper.BuildConfig
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.obsidian.clipper.storage.ExtractedContent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Handles content extraction from web pages using a WebView
 * and the injected JavaScript bundle (Defuddle + Turndown)
 */
class WebViewExtractor(private val context: Context) {

    companion object {
        private const val TAG = "WebViewExtractor"
        private const val EXTRACTION_TIMEOUT_MS = 30000L
    }

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    private var webView: WebView? = null
    private var clipperBundle: String? = null

    /**
     * Load the JavaScript bundle from assets
     */
    private fun loadBundle(): String {
        if (clipperBundle == null) {
            clipperBundle = context.assets.open("clipper-bundle.js")
                .bufferedReader()
                .use { it.readText() }
        }
        return clipperBundle!!
    }

    /**
     * Extract content from a URL
     * Must be called from main thread or will switch to main thread internally
     */
    @SuppressLint("SetJavaScriptEnabled")
    suspend fun extract(url: String): ExtractedContent = withContext(Dispatchers.Main) {
        suspendCancellableCoroutine { continuation ->
            val extractionDeferred = CompletableDeferred<ExtractedContent>()

            // Create WebView on main thread
            val webViewInstance = WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.loadsImagesAutomatically = false // Faster loading
                settings.blockNetworkImage = true // Don't load images initially

                addJavascriptInterface(
                    ExtractionBridge { result ->
                        try {
                            if (BuildConfig.DEBUG) {
                                Log.d(TAG, "Received extraction result: ${result.take(500)}...")
                            }
                            val content = json.decodeFromString<ExtractedContent>(result)
                            extractionDeferred.complete(content)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to parse extraction result", e)
                            extractionDeferred.completeExceptionally(e)
                        }
                    },
                    "AndroidBridge"
                )

                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                        if (BuildConfig.DEBUG) {
                            Log.d(TAG, "Page started loading: $url")
                        }
                    }

                    override fun onPageFinished(view: WebView?, loadedUrl: String?) {
                        super.onPageFinished(view, loadedUrl)
                        if (BuildConfig.DEBUG) {
                            Log.d(TAG, "Page finished loading: $loadedUrl")
                        }
                        injectAndExtract(view)
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        super.onReceivedError(view, request, error)
                        // Only fail on main frame errors
                        if (request?.isForMainFrame == true) {
                            Log.e(TAG, "WebView error: ${error?.description}")
                            extractionDeferred.completeExceptionally(
                                Exception("Failed to load page: ${error?.description}")
                            )
                        }
                    }
                }
            }

            webView = webViewInstance

            // Start loading
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Loading URL: $url")
            }
            webViewInstance.loadUrl(url)

            // Handle the deferred result
            extractionDeferred.invokeOnCompletion { throwable ->
                if (throwable != null) {
                    continuation.resumeWithException(throwable)
                } else {
                    continuation.resume(extractionDeferred.getCompleted())
                }
                cleanup()
            }

            continuation.invokeOnCancellation {
                Log.d(TAG, "Extraction cancelled")
                cleanup()
            }
        }
    }

    /**
     * Inject the JS bundle and run extraction
     */
    private fun injectAndExtract(webView: WebView?) {
        if (webView == null) return

        try {
            val bundle = loadBundle()
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Injecting bundle (${bundle.length} chars)")
            }

            // Inject the bundle
            webView.evaluateJavascript(bundle) {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Bundle injected, waiting before extraction...")
                }

                // Wait for page content to fully render (SPAs need time to hydrate)
                mainHandler.postDelayed({
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Delay complete, running extraction...")
                    }

                    val extractionScript = """
                        (function() {
                            try {
                                if (typeof window.ObsidianClipper === 'undefined') {
                                    AndroidBridge.onExtracted(JSON.stringify({
                                        error: 'ObsidianClipper not loaded'
                                    }));
                                    return;
                                }
                                const result = window.ObsidianClipper.extract();
                                AndroidBridge.onExtracted(JSON.stringify(result));
                            } catch (e) {
                                AndroidBridge.onExtracted(JSON.stringify({
                                    error: e.message,
                                    title: document.title || '',
                                    url: document.URL || '',
                                    content: '',
                                    contentMarkdown: ''
                                }));
                            }
                        })();
                    """.trimIndent()

                    webView?.evaluateJavascript(extractionScript, null)
                }, 2000) // 2 second delay for SPA content to render
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to inject bundle", e)
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    /**
     * Clean up resources - must be called on main thread
     */
    private fun cleanup() {
        mainHandler.post {
            webView?.apply {
                stopLoading()
                removeJavascriptInterface("AndroidBridge")
                destroy()
            }
            webView = null
        }
    }

    /**
     * JavaScript interface for receiving extraction results
     */
    inner class ExtractionBridge(private val callback: (String) -> Unit) {
        @JavascriptInterface
        fun onExtracted(json: String) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "onExtracted called")
            }
            // Post to main thread since JS callback comes on JavaBridge thread
            mainHandler.post {
                callback(json)
            }
        }
    }
}
