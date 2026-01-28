package com.obsidian.clipper

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.documentfile.provider.DocumentFile
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import android.view.LayoutInflater
import android.view.ViewGroup
import android.widget.TextView
import com.obsidian.clipper.databinding.ActivitySettingsBinding
import com.obsidian.clipper.storage.AppSettings
import com.obsidian.clipper.storage.SettingsRepository
import com.obsidian.clipper.storage.Template
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.UUID

/**
 * Settings activity for managing vaults, templates, and preferences.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private lateinit var settingsRepository: SettingsRepository
    private var currentSettings: AppSettings? = null

    private val vaultAdapter = VaultAdapter(
        onDelete = { vault -> deleteVault(vault) },
        onSetDefault = { vault -> setDefaultVault(vault) }
    )

    private val templateAdapter = TemplateAdapter(
        onDelete = { template -> deleteTemplate(template) },
        onSetDefault = { template -> setDefaultTemplate(template) }
    )

    // Folder picker for direct vault access
    private val folderPickerLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri != null) {
            // Take persistent permission
            val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            contentResolver.takePersistableUriPermission(uri, takeFlags)

            // Save the URI
            lifecycleScope.launch {
                settingsRepository.updateVaultFolderUri(uri.toString())
            }

            // Update UI
            updateVaultFolderDisplay(uri)
            Toast.makeText(this, "Vault folder selected", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Settings"

        settingsRepository = SettingsRepository(this)

        setupUI()
        observeSettings()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun setupUI() {
        // Vaults RecyclerView
        binding.recyclerVaults.layoutManager = LinearLayoutManager(this)
        binding.recyclerVaults.adapter = vaultAdapter

        // Templates RecyclerView
        binding.recyclerTemplates.layoutManager = LinearLayoutManager(this)
        binding.recyclerTemplates.adapter = templateAdapter

        // Add vault button
        binding.buttonAddVault.setOnClickListener {
            showAddVaultDialog()
        }

        // Add template button
        binding.buttonAddTemplate.setOnClickListener {
            showAddTemplateDialog()
        }

        // Silent mode switch (legacy, keep for compatibility)
        binding.switchSilentMode.setOnCheckedChangeListener { _, isChecked ->
            lifecycleScope.launch {
                settingsRepository.updateSilentMode(isChecked)
            }
        }

        // Auto-save switch
        binding.switchAutoSave.setOnCheckedChangeListener { _, isChecked ->
            lifecycleScope.launch {
                settingsRepository.updateAutoSave(isChecked)
            }
        }

        // Silent save switch
        binding.switchSilentSave.setOnCheckedChangeListener { _, isChecked ->
            lifecycleScope.launch {
                settingsRepository.updateSilentSave(isChecked)
            }
        }

        // Direct save switch
        binding.switchDirectSave.setOnCheckedChangeListener { _, isChecked ->
            lifecycleScope.launch {
                settingsRepository.updateDirectSave(isChecked)
            }
            // Show/hide folder selection
            binding.layoutVaultFolder.visibility = if (isChecked) View.VISIBLE else View.GONE
        }

        // Vault folder selection button
        binding.buttonSelectVaultFolder.setOnClickListener {
            folderPickerLauncher.launch(null)
        }
    }

    private fun observeSettings() {
        lifecycleScope.launch {
            settingsRepository.settingsFlow.collectLatest { settings ->
                currentSettings = settings
                updateUI(settings)
            }
        }
    }

    private fun updateUI(settings: AppSettings) {
        // Update vaults
        val vaults = settings.vaults.filter { it.isNotBlank() }
        vaultAdapter.submitList(vaults, settings.defaultVault)

        // Update templates
        templateAdapter.submitList(settings.templates, settings.defaultTemplateId)

        // Update silent mode
        binding.switchSilentMode.isChecked = settings.silentMode

        // Update auto-save
        binding.switchAutoSave.isChecked = settings.autoSave

        // Update silent save
        binding.switchSilentSave.isChecked = settings.silentSave

        // Update direct save
        binding.switchDirectSave.isChecked = settings.directSave
        binding.layoutVaultFolder.visibility = if (settings.directSave) View.VISIBLE else View.GONE

        // Update vault folder display
        if (settings.vaultFolderUri.isNotBlank()) {
            try {
                updateVaultFolderDisplay(Uri.parse(settings.vaultFolderUri))
            } catch (e: Exception) {
                binding.textVaultFolderPath.text = "No folder selected"
            }
        } else {
            binding.textVaultFolderPath.text = "No folder selected"
        }
    }

    private fun updateVaultFolderDisplay(uri: Uri) {
        val docFile = DocumentFile.fromTreeUri(this, uri)
        binding.textVaultFolderPath.text = docFile?.name ?: uri.lastPathSegment ?: "Selected"
    }

    private fun showAddVaultDialog() {
        val editText = EditText(this).apply {
            hint = "Vault name"
            setPadding(48, 32, 48, 32)
        }

        AlertDialog.Builder(this)
            .setTitle("Add Vault")
            .setMessage("Enter the exact name of your Obsidian vault")
            .setView(editText)
            .setPositiveButton("Add") { _, _ ->
                val vaultName = editText.text.toString().trim()
                if (vaultName.isNotBlank()) {
                    addVault(vaultName)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun addVault(vaultName: String) {
        lifecycleScope.launch {
            val current = currentSettings ?: return@launch
            val newVaults = (current.vaults + vaultName).distinct().filter { it.isNotBlank() }
            settingsRepository.updateVaults(newVaults)

            // Set as default if it's the first vault
            if (current.defaultVault.isBlank()) {
                settingsRepository.updateDefaultVault(vaultName)
            }

            Toast.makeText(this@SettingsActivity, "Vault added", Toast.LENGTH_SHORT).show()
        }
    }

    private fun deleteVault(vault: String) {
        AlertDialog.Builder(this)
            .setTitle("Delete Vault")
            .setMessage("Remove \"$vault\" from the list?")
            .setPositiveButton("Delete") { _, _ ->
                lifecycleScope.launch {
                    val current = currentSettings ?: return@launch
                    val newVaults = current.vaults.filter { it != vault }
                    settingsRepository.updateVaults(newVaults)

                    // Clear default if it was the deleted vault
                    if (current.defaultVault == vault) {
                        settingsRepository.updateDefaultVault(newVaults.firstOrNull() ?: "")
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun setDefaultVault(vault: String) {
        lifecycleScope.launch {
            settingsRepository.updateDefaultVault(vault)
            Toast.makeText(this@SettingsActivity, "Default vault set", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showAddTemplateDialog() {
        val editText = EditText(this).apply {
            hint = "Template name"
            setPadding(48, 32, 48, 32)
        }

        AlertDialog.Builder(this)
            .setTitle("Add Template")
            .setMessage("This will create a basic template. Edit the JSON in settings for advanced customization.")
            .setView(editText)
            .setPositiveButton("Add") { _, _ ->
                val name = editText.text.toString().trim()
                if (name.isNotBlank()) {
                    addTemplate(name)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun addTemplate(name: String) {
        lifecycleScope.launch {
            val template = Template(
                id = UUID.randomUUID().toString(),
                name = name,
                behavior = "create",
                noteNameFormat = "{{title}}",
                path = "Clippings",
                noteContentFormat = Template.DEFAULT.noteContentFormat
            )
            settingsRepository.addTemplate(template)
            Toast.makeText(this@SettingsActivity, "Template added", Toast.LENGTH_SHORT).show()
        }
    }

    private fun deleteTemplate(template: Template) {
        if (template.id == "default") {
            Toast.makeText(this, "Cannot delete the default template", Toast.LENGTH_SHORT).show()
            return
        }

        AlertDialog.Builder(this)
            .setTitle("Delete Template")
            .setMessage("Delete \"${template.name}\"?")
            .setPositiveButton("Delete") { _, _ ->
                lifecycleScope.launch {
                    settingsRepository.deleteTemplate(template.id)

                    // Reset default if deleted
                    val current = currentSettings
                    if (current?.defaultTemplateId == template.id) {
                        settingsRepository.updateDefaultTemplate("default")
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun setDefaultTemplate(template: Template) {
        lifecycleScope.launch {
            settingsRepository.updateDefaultTemplate(template.id)
            Toast.makeText(this@SettingsActivity, "Default template set", Toast.LENGTH_SHORT).show()
        }
    }
}

/**
 * Adapter for vault list
 */
class VaultAdapter(
    private val onDelete: (String) -> Unit,
    private val onSetDefault: (String) -> Unit
) : RecyclerView.Adapter<VaultAdapter.ViewHolder>() {

    private var vaults: List<String> = emptyList()
    private var defaultVault: String = ""

    fun submitList(newVaults: List<String>, newDefault: String) {
        vaults = newVaults
        defaultVault = newDefault
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(android.R.layout.simple_list_item_2, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val vault = vaults[position]
        holder.bind(vault, vault == defaultVault)
    }

    override fun getItemCount() = vaults.size

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val text1: TextView = view.findViewById(android.R.id.text1)
        private val text2: TextView = view.findViewById(android.R.id.text2)

        fun bind(vault: String, isDefault: Boolean) {
            text1.text = vault
            text2.text = if (isDefault) "Default" else "Tap to set as default"

            itemView.setOnClickListener {
                if (!isDefault) {
                    onSetDefault(vault)
                }
            }

            itemView.setOnLongClickListener {
                onDelete(vault)
                true
            }
        }
    }
}

/**
 * Adapter for template list
 */
class TemplateAdapter(
    private val onDelete: (Template) -> Unit,
    private val onSetDefault: (Template) -> Unit
) : RecyclerView.Adapter<TemplateAdapter.ViewHolder>() {

    private var templates: List<Template> = emptyList()
    private var defaultId: String = ""

    fun submitList(newTemplates: List<Template>, newDefaultId: String) {
        templates = newTemplates
        defaultId = newDefaultId
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(android.R.layout.simple_list_item_2, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val template = templates[position]
        holder.bind(template, template.id == defaultId)
    }

    override fun getItemCount() = templates.size

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        private val text1: TextView = view.findViewById(android.R.id.text1)
        private val text2: TextView = view.findViewById(android.R.id.text2)

        fun bind(template: Template, isDefault: Boolean) {
            text1.text = template.name
            text2.text = if (isDefault) "Default" else "Tap to set as default, hold to delete"

            itemView.setOnClickListener {
                if (!isDefault) {
                    onSetDefault(template)
                }
            }

            itemView.setOnLongClickListener {
                onDelete(template)
                true
            }
        }
    }
}
