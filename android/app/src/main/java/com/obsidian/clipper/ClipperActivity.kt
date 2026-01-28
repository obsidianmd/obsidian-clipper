package com.obsidian.clipper

import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import com.obsidian.clipper.BuildConfig
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.obsidian.clipper.databinding.ActivityClipperBinding
import com.obsidian.clipper.storage.AppSettings
import com.obsidian.clipper.storage.ExtractedContent
import com.obsidian.clipper.storage.SettingsRepository
import com.obsidian.clipper.storage.Template
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Main clipper activity that handles content extraction and saving.
 */
class ClipperActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "ClipperActivity"
        const val EXTRA_URL = "extra_url"
    }

    private lateinit var binding: ActivityClipperBinding
    private lateinit var settingsRepository: SettingsRepository
    private lateinit var webViewExtractor: WebViewExtractor
    private lateinit var templateEngine: TemplateEngine
    private lateinit var vaultFileWriter: VaultFileWriter

    private var extractedContent: ExtractedContent? = null
    private var currentSettings: AppSettings? = null
    private var selectedTemplate: Template? = null
    private var processedTemplate: ProcessedTemplate? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityClipperBinding.inflate(layoutInflater)
        setContentView(binding.root)

        settingsRepository = SettingsRepository(this)
        webViewExtractor = WebViewExtractor(this)
        templateEngine = TemplateEngine()
        vaultFileWriter = VaultFileWriter(this)

        setupUI()

        val url = intent.getStringExtra(EXTRA_URL)
        if (url != null) {
            startExtraction(url)
        } else {
            showError("No URL provided")
        }
    }

    private fun setupUI() {
        binding.buttonSave.setOnClickListener {
            saveToObsidian()
        }

        binding.buttonCancel.setOnClickListener {
            finish()
        }

        binding.spinnerTemplate.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val templates = currentSettings?.templates ?: return
                if (position < templates.size) {
                    selectedTemplate = templates[position]
                    updatePreview()
                }
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        binding.spinnerVault.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                updatePreview()
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun startExtraction(url: String) {
        showLoading(true)
        binding.textUrl.text = url

        lifecycleScope.launch {
            try {
                // Load settings
                currentSettings = settingsRepository.settingsFlow.first()
                setupSpinners()

                // Extract content (must run on Main thread for WebView)
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Starting extraction for: $url")
                }
                extractedContent = webViewExtractor.extract(url)
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Extraction complete: ${extractedContent?.title}")
                }

                // Update UI
                updatePreview()
                showLoading(false)

                // If auto-save is enabled, save immediately
                if (currentSettings?.autoSave == true) {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Auto-save enabled, saving immediately")
                    }
                    saveToObsidian()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Extraction failed", e)
                showError("Failed to extract content: ${e.message}")
            }
        }
    }

    private fun setupSpinners() {
        val settings = currentSettings ?: return

        // Setup template spinner
        val templateNames = settings.templates.map { it.name }
        val templateAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, templateNames)
        templateAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spinnerTemplate.adapter = templateAdapter

        // Select default template
        val defaultIndex = settings.templates.indexOfFirst { it.id == settings.defaultTemplateId }
        if (defaultIndex >= 0) {
            binding.spinnerTemplate.setSelection(defaultIndex)
            selectedTemplate = settings.templates[defaultIndex]
        } else if (settings.templates.isNotEmpty()) {
            selectedTemplate = settings.templates[0]
        }

        // Setup vault spinner
        val vaults = settings.vaults.filter { it.isNotBlank() }.ifEmpty { listOf("") }
        val vaultAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, vaults)
        vaultAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        binding.spinnerVault.adapter = vaultAdapter

        // Select default vault
        val defaultVaultIndex = vaults.indexOf(settings.defaultVault)
        if (defaultVaultIndex >= 0) {
            binding.spinnerVault.setSelection(defaultVaultIndex)
        }
    }

    private fun updatePreview() {
        val content = extractedContent ?: return
        val template = selectedTemplate ?: return

        processedTemplate = templateEngine.apply(template, content)
        val processed = processedTemplate ?: return

        binding.textTitle.text = processed.noteName
        binding.textPreview.text = processed.noteContent
        binding.textPath.text = if (processed.path.isNotBlank()) {
            "Path: ${processed.path}"
        } else {
            "Path: (root)"
        }
    }

    private fun saveToObsidian() {
        val processed = processedTemplate
        if (processed == null) {
            Toast.makeText(this, "No content to save", Toast.LENGTH_SHORT).show()
            return
        }

        val settings = currentSettings

        // Check if direct save is enabled
        if (settings?.directSave == true && settings.vaultFolderUri.isNotBlank()) {
            saveDirectlyToVault(processed)
            return
        }

        // Check if Obsidian is installed
        if (!ObsidianLauncher.isObsidianInstalled(this)) {
            Toast.makeText(this, "Obsidian is not installed", Toast.LENGTH_LONG).show()
            ObsidianLauncher.openObsidianStore(this)
            return
        }

        // Get selected vault
        val selectedVault = binding.spinnerVault.selectedItem?.toString() ?: ""

        // Launch Obsidian
        val success = ObsidianLauncher.createNote(
            context = this,
            vault = selectedVault.ifBlank { processed.vault },
            path = processed.path,
            noteName = processed.noteName,
            content = processed.noteContent,
            behavior = processed.behavior
        )

        if (success) {
            // Check if silent save is enabled
            val silentSave = currentSettings?.silentSave == true
            if (silentSave) {
                Toast.makeText(this, "Saved to Obsidian", Toast.LENGTH_SHORT).show()
            }
            finish()
        } else {
            Toast.makeText(this, "Failed to open Obsidian", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveDirectlyToVault(processed: ProcessedTemplate) {
        val vaultUri = currentSettings?.vaultFolderUri ?: return

        lifecycleScope.launch {
            val success = withContext(Dispatchers.IO) {
                vaultFileWriter.writeNote(
                    vaultUri = Uri.parse(vaultUri),
                    path = processed.path,
                    noteName = processed.noteName,
                    content = processed.noteContent
                )
            }

            if (success) {
                Toast.makeText(this@ClipperActivity, "Saved to vault", Toast.LENGTH_SHORT).show()
                finish()
            } else {
                Toast.makeText(this@ClipperActivity, "Failed to save file", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showLoading(loading: Boolean) {
        binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        binding.layoutContent.visibility = if (loading) View.GONE else View.VISIBLE
        binding.buttonSave.isEnabled = !loading
    }

    private fun showError(message: String) {
        showLoading(false)
        binding.textPreview.text = "Error: $message"
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}
