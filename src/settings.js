document.addEventListener('DOMContentLoaded', () => {
    // Default values
    const defaultFolderName = "Clippings/";
    const defaultTags = "clippings";

    const vaultInput = document.getElementById('vaultInput');
    const vaultList = document.getElementById('vaultList');
    const folderNameInput = document.getElementById('folderName');
    const tagsInput = document.getElementById('tags');
    let vaults = [];

    // Load saved settings or use default values
    chrome.storage.sync.get(['vaults', 'folderName', 'tags'], (data) => {
        vaults = data.vaults || [];
        folderNameInput.value = data.folderName || defaultFolderName;
        tagsInput.value = data.tags || defaultTags;
        updateVaultList();
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

        chrome.storage.sync.set({ vaults, folderName, tags }, () => {
            console.log('Settings saved automatically.');
        });
    }
});