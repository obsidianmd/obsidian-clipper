package com.obsidian.clipper

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.obsidian.clipper.databinding.ActivityMainBinding
import com.obsidian.clipper.storage.SettingsRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Main launcher activity - provides a landing page and quick actions.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        settingsRepository = SettingsRepository(this)

        setupUI()
        loadSettings()
    }

    override fun onResume() {
        super.onResume()
        updateObsidianStatus()
    }

    private fun setupUI() {
        binding.buttonSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        binding.buttonClipUrl.setOnClickListener {
            showUrlInputDialog()
        }

        binding.buttonInstallObsidian.setOnClickListener {
            ObsidianLauncher.openObsidianStore(this)
        }

        binding.buttonOpenObsidian.setOnClickListener {
            lifecycleScope.launch {
                val settings = settingsRepository.settingsFlow.first()
                if (settings.defaultVault.isNotBlank()) {
                    ObsidianLauncher.openVault(this@MainActivity, settings.defaultVault)
                } else if (settings.vaults.isNotEmpty() && settings.vaults.first().isNotBlank()) {
                    ObsidianLauncher.openVault(this@MainActivity, settings.vaults.first())
                } else {
                    // Just try to open Obsidian without a specific vault
                    val intent = packageManager.getLaunchIntentForPackage("md.obsidian")
                    if (intent != null) {
                        startActivity(intent)
                    }
                }
            }
        }
    }

    private fun loadSettings() {
        lifecycleScope.launch {
            val settings = settingsRepository.settingsFlow.first()
            binding.textVaultCount.text = "Vaults: ${settings.vaults.count { it.isNotBlank() }}"
            binding.textTemplateCount.text = "Templates: ${settings.templates.size}"
        }
    }

    private fun updateObsidianStatus() {
        val isInstalled = ObsidianLauncher.isObsidianInstalled(this)
        binding.textObsidianStatus.text = if (isInstalled) {
            "Obsidian is installed"
        } else {
            "Obsidian is not installed"
        }
        binding.buttonInstallObsidian.visibility = if (isInstalled) View.GONE else View.VISIBLE
        binding.buttonOpenObsidian.visibility = if (isInstalled) View.VISIBLE else View.GONE
    }

    private fun showUrlInputDialog() {
        val editText = android.widget.EditText(this).apply {
            hint = "Enter URL"
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_URI
            setPadding(48, 32, 48, 32)
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Clip URL")
            .setView(editText)
            .setPositiveButton("Clip") { _, _ ->
                val url = editText.text.toString().trim()
                if (url.isNotBlank()) {
                    val finalUrl = if (!url.startsWith("http://") && !url.startsWith("https://")) {
                        "https://$url"
                    } else {
                        url
                    }
                    val intent = Intent(this, ClipperActivity::class.java).apply {
                        putExtra(ClipperActivity.EXTRA_URL, finalUrl)
                    }
                    startActivity(intent)
                } else {
                    Toast.makeText(this, "Please enter a URL", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
