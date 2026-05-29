document.getElementById('password-change-form').addEventListener('submit', function(e) {
    e.preventDefault(); // Pause the form submission

    const newPassword = document.getElementById('new-password').value;
    const updateBtn = document.getElementById('update-btn');

    updateBtn.innerText = "Wrapping Key...";
    updateBtn.disabled = true;

    // Grab the active, raw sync key that is currently powering the app in memory
    const rawSyncKey = sessionStorage.getItem('tsync_active_key');

    if (!rawSyncKey) {
        alert("Fatal Error: Could not find active sync key in memory. Please log out and log back in.");
        updateBtn.innerText = "Update Password & Key";
        updateBtn.disabled = false;
        return;
    }

    // Lock the existing Sync Key with the NEW password
    const newWrappedKey = wrapSyncKey(rawSyncKey, newPassword);

    // Put the locked package into the hidden field
    document.getElementById('new-encrypted-sync-key').value = newWrappedKey;

    // Release the pause and submit to Python!
    this.submit();
});