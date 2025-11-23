/**
 * Google Meet Auto-Add Extension - Popup Script
 * 
 * Handles the extension popup UI and "Force Check / Debug" button functionality.
 * Allows users to manually trigger button injection if the automatic detection fails.
 */
document.addEventListener('DOMContentLoaded', function () {
    const forceCheckBtn = document.getElementById('force-check-btn');
    const statusDiv = document.getElementById('status');

    forceCheckBtn.addEventListener('click', function () {
        statusDiv.textContent = 'Checking...';

        // query current active tab (requires "tabs" permission for reliability)
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) {
                statusDiv.textContent = 'No active tab found';
                statusDiv.style.color = '#d93025';
                return;
            }

            // Send message to content script
            try {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'force_check' }, function (response) {
                    if (chrome.runtime.lastError) {
                        // This usually means the content script isn't loaded 
                        // (e.g. wrong domain or extension updated but page not reloaded)
                        console.error(chrome.runtime.lastError);
                        statusDiv.textContent = 'Not available on this page';
                        statusDiv.style.color = '#d93025';
                    } else if (response) {
                        statusDiv.textContent = response.reason || 'Check completed';
                        statusDiv.style.color = response.buttonAdded ? '#137333' : '#e37400';
                    }
                });
            } catch (e) {
                statusDiv.textContent = 'Error: ' + e.message;
                statusDiv.style.color = '#d93025';
            }
        });
    });
});
