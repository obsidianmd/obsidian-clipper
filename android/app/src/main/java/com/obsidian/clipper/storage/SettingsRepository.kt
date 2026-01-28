package com.obsidian.clipper.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/**
 * Repository for app settings using DataStore
 */
class SettingsRepository(private val context: Context) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }

    companion object {
        private val SETTINGS_KEY = stringPreferencesKey("app_settings")
    }

    /**
     * Get settings as a Flow
     */
    val settingsFlow: Flow<AppSettings> = context.dataStore.data.map { preferences ->
        val settingsJson = preferences[SETTINGS_KEY]
        if (settingsJson != null) {
            try {
                json.decodeFromString<AppSettings>(settingsJson)
            } catch (e: Exception) {
                AppSettings()
            }
        } else {
            AppSettings()
        }
    }

    /**
     * Save settings
     */
    suspend fun saveSettings(settings: AppSettings) {
        context.dataStore.edit { preferences ->
            preferences[SETTINGS_KEY] = json.encodeToString(settings)
        }
    }

    /**
     * Update a specific setting
     */
    suspend fun updateVaults(vaults: List<String>) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(vaults = vaults))
        }
    }

    suspend fun updateDefaultVault(vault: String) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(defaultVault = vault))
        }
    }

    suspend fun updateDefaultTemplate(templateId: String) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(defaultTemplateId = templateId))
        }
    }

    suspend fun updateSilentMode(silent: Boolean) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(silentMode = silent))
        }
    }

    suspend fun updateAutoSave(autoSave: Boolean) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(autoSave = autoSave))
        }
    }

    suspend fun updateSilentSave(silentSave: Boolean) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(silentSave = silentSave))
        }
    }

    suspend fun updateDirectSave(directSave: Boolean) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(directSave = directSave))
        }
    }

    suspend fun updateVaultFolderUri(uri: String) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(vaultFolderUri = uri))
        }
    }

    suspend fun updateTemplates(templates: List<Template>) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(templates = templates))
        }
    }

    suspend fun addTemplate(template: Template) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            val newTemplates = current.templates + template
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(templates = newTemplates))
        }
    }

    suspend fun deleteTemplate(templateId: String) {
        context.dataStore.edit { preferences ->
            val current = getSettingsFromPreferences(preferences)
            val newTemplates = current.templates.filter { it.id != templateId }
            preferences[SETTINGS_KEY] = json.encodeToString(current.copy(templates = newTemplates))
        }
    }

    private fun getSettingsFromPreferences(preferences: Preferences): AppSettings {
        val settingsJson = preferences[SETTINGS_KEY]
        return if (settingsJson != null) {
            try {
                json.decodeFromString<AppSettings>(settingsJson)
            } catch (e: Exception) {
                AppSettings()
            }
        } else {
            AppSettings()
        }
    }
}
