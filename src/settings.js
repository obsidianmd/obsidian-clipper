document.addEventListener('DOMContentLoaded', () => {
    // Default values
    const defaultFolderName = "Clippings/";
    const defaultTags = "clippings";

    const vaultInput = document.getElementById('vaultInput');
    const vaultList = document.getElementById('vaultList');
    const folderNameInput = document.getElementById('folderName');
    const tagsInput = document.getElementById('tags');
    let vaults = [];

    const templateSelect = document.getElementById('templateSelect');
    const newTemplateBtn = document.getElementById('newTemplateBtn');
    const editTemplateBtn = document.getElementById('editTemplateBtn');
    const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
    const templateEditor = document.getElementById('templateEditor');
    const templateEditorTitle = document.getElementById('templateEditorTitle');
    const templateName = document.getElementById('templateName');
    const templateFields = document.getElementById('templateFields');
    const addFieldBtn = document.getElementById('addFieldBtn');
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');

    let templates = [];
    let editingTemplateIndex = -1;

    // Load saved settings or use default values
    chrome.storage.sync.get(['vaults', 'folderName', 'tags'], (data) => {
        vaults = data.vaults || [];
        folderNameInput.value = data.folderName || defaultFolderName;
        tagsInput.value = data.tags || defaultTags;
        updateVaultList();
        templates = data.templates || [
            {
                name: 'Default',
                fields: [
                    { name: 'category', value: '"[[Clippings]]"' },
                    { name: 'author', value: '' },
                    { name: 'title', value: '' },
                    { name: 'source', value: '' },
                    { name: 'created', value: '' },
                    { name: 'published', value: '' },
                    { name: 'topics', value: '' },
                    { name: 'tags', value: '' }
                ]
            }
        ];
        updateTemplateSelect();
    });

    // Add vault name on Enter key press
    vaultInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const vaultName = vaultInput.value.trim();
            if (vaultName && !vaults.includes(vaultName)) {
                vaults.push(vaultName);
                updateVaultList();
                vaultInput.value = ''; // Clear the input field
                saveSettings(); // Auto-save after adding a vault
            }
        }
    });

    // Auto-save on folder name change
    folderNameInput.addEventListener('input', saveSettings);

    // Auto-save on tags change
    tagsInput.addEventListener('input', saveSettings);

    newTemplateBtn.addEventListener('click', () => {
        editingTemplateIndex = -1;
        templateEditorTitle.textContent = 'New Template';
        templateName.value = '';
        templateFields.innerHTML = '';
        templateEditor.style.display = 'block';
    });

    editTemplateBtn.addEventListener('click', () => {
        const selectedIndex = templateSelect.selectedIndex - 1;
        if (selectedIndex >= 0) {
            editingTemplateIndex = selectedIndex;
            const template = templates[selectedIndex];
            templateEditorTitle.textContent = 'Edit Template';
            templateName.value = template.name;
            templateFields.innerHTML = '';
            template.fields.forEach(field => addFieldToEditor(field.name, field.value));
            templateEditor.style.display = 'block';
        }
    });

    deleteTemplateBtn.addEventListener('click', () => {
        const selectedIndex = templateSelect.selectedIndex - 1;
        if (selectedIndex >= 0) {
            templates.splice(selectedIndex, 1);
            updateTemplateSelect();
            saveSettings();
        }
    });

    addFieldBtn.addEventListener('click', () => {
        addFieldToEditor();
    });

    saveTemplateBtn.addEventListener('click', () => {
        const name = templateName.value.trim();
        if (name) {
            const fields = Array.from(templateFields.children).map(field => ({
                name: field.querySelector('.field-name').value.trim(),
                value: field.querySelector('.field-value').value.trim()
            })).filter(field => field.name);

            if (editingTemplateIndex === -1) {
                templates.push({ name, fields });
            } else {
                templates[editingTemplateIndex] = { name, fields };
            }

            updateTemplateSelect();
            saveSettings();
            templateEditor.style.display = 'none';
        }
    });

    cancelTemplateBtn.addEventListener('click', () => {
        templateEditor.style.display = 'none';
    });

    function updateTemplateSelect() {
        templateSelect.innerHTML = '<option value="">Select a template</option>';
        templates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.name;
            option.textContent = template.name;
            templateSelect.appendChild(option);
        });
    }

    function addFieldToEditor(name = '', value = '') {
        const fieldDiv = document.createElement('div');
        fieldDiv.innerHTML = `
            <input type="text" class="field-name" placeholder="Field Name" value="${name}" />
            <input type="text" class="field-value" placeholder="Field Value" value="${value}" />
            <button type="button" class="remove-field">Remove</button>
        `;
        fieldDiv.querySelector('.remove-field').addEventListener('click', () => {
            templateFields.removeChild(fieldDiv);
        });
        templateFields.appendChild(fieldDiv);
    }

    function updateVaultList() {
        vaultList.innerHTML = '';
        vaults.forEach((vault, index) => {
            const li = document.createElement('li');
            li.textContent = vault;

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.style.marginLeft = '10px';
            removeButton.addEventListener('click', () => {
                vaults.splice(index, 1);
                updateVaultList();
                saveSettings(); // Auto-save after removing a vault
            });

            li.appendChild(removeButton);
            vaultList.appendChild(li);
        });
    }

    function saveSettings() {
        const folderName = folderNameInput.value;
        const tags = tagsInput.value;

        chrome.storage.sync.set({ vaults, folderName, tags, templates }, () => {
            console.log('Settings saved automatically.');
        });
    }
});