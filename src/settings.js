document.addEventListener('DOMContentLoaded', () => {
    // Default values
    const defaultFolderName = "Clippings/";
    const defaultTags = "clippings";

    // Load saved settings or use default values
    chrome.storage.sync.get(['vaultName', 'folderName', 'tags'], (data) => {
        document.getElementById('vaultName').value = data.vaultName || '';
        document.getElementById('folderName').value = data.folderName || defaultFolderName;
        document.getElementById('tags').value = data.tags || defaultTags;
    });

    // Save settings on form submission
    document.getElementById('settingsForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const vaultName = document.getElementById('vaultName').value;
        const folderName = document.getElementById('folderName').value;
        const tags = document.getElementById('tags').value;

        chrome.storage.sync.set({ vaultName, folderName, tags }, () => {
            alert('Settings saved!');
        });
    });
});