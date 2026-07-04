/**
 * Cloud storage DOM templates, extracted from `src/settings.html`.
 *
 * The cloud settings section and the cloud editor modal are injected into
 * the settings page at runtime by `register-settings.ts`, so `settings.html`
 * no longer needs to ship the cloud markup.
 */

/**
 * The `#cloud-section` settings panel. Mirrors the structure that was
 * originally hard-coded in `settings.html`. Must be inserted inside
 * `#content` (after the reader section is a reasonable default).
 */
export const cloudSettingsSectionTemplate = `
<div id="cloud-section" class="settings-section">
	<div class="settings-section-header">
		<h2 data-i18n="cloudSettings">Cloud Storage</h2>
	</div>
	<form id="cloud-settings-form">
		<div class="setting-group">
			<div class="setting-items">
				<div class="setting-item mod-horizontal">
					<div class="setting-item-info">
						<label for="cloud-active-target" data-i18n="cloudActiveTarget">Active cloud target</label>
						<div class="setting-item-description" data-i18n="cloudActiveTargetDescription">
							Select the cloud storage target to use for saving notes.
						</div>
					</div>
					<div class="setting-item-control">
						<select id="cloud-active-target" class="dropdown">
						</select>
					</div>
				</div>
			</div>
		</div>
		<div class="setting-group">
			<div class="setting-item setting-item-heading">
				<h3 data-i18n="cloudTargets">Cloud Targets</h3>
			</div>
			<div class="setting-items">
				<div class="cloud-target-list-container">
					<div id="cloud-target-list"></div>
					<div class="add-btn">
						<a id="add-cloud-target-btn" data-i18n="cloudAddTarget">+ Add cloud target</a>
					</div>
				</div>
			</div>
		</div>
	</form>
</div>
`;

/**
 * The `#cloud-modal` editor modal. Mirrors the structure that was originally
 * hard-coded in `settings.html`. Must be appended to `body` (alongside the
 * other modal containers).
 */
export const cloudModalTemplate = `
<div id="cloud-modal" class="modal-container">
	<div class="modal-bg"></div>
	<div class="modal">
		<div class="modal-header">
			<div class="modal-title" data-i18n="cloudEditorTitle">Cloud Target Editor</div>
		</div>
		<div class="modal-content">
			<form id="cloud-editor-form">
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-type" data-i18n="cloudType">Type</label>
						<div class="setting-item-description" data-i18n="cloudTypeDescription">Select the cloud storage type.</div>
					</div>
					<div class="setting-item-control">
						<select id="cloud-type" name="type" class="dropdown">
						</select>
					</div>
				</div>
				<div class="setting-item">
					<div class="setting-item-info">
						<label for="cloud-name" data-i18n="cloudLabelName">Name</label>
						<div class="setting-item-description" data-i18n="cloudNameDescription">Display name for this cloud target.</div>
					</div>
					<div class="setting-item-control">
						<input type="text" id="cloud-name" name="name" placeholder="My Cloud Storage" required>
					</div>
				</div>
				<div id="cloud-type-fields"></div>
			</form>
		</div>
		<div class="modal-button-container">
			<button class="cloud-test-btn" data-i18n="cloudTest">Test connection</button>
			<button class="cloud-cancel-btn" data-i18n="cancel">Cancel</button>
			<button class="cloud-save-btn mod-cta" data-i18n="save">Save</button>
		</div>
	</div>
</div>
`;

/**
 * Sidebar nav item for the cloud section. Injected before the `reader` nav
 * item to mirror the original ordering in `settings.html`.
 */
export const cloudSidebarNavItemTemplate = `
<li data-section="cloud"><div class="nav-item-icon"><i data-lucide="cloud"></i></div><span data-i18n="cloud">Cloud</span></li>
`;
