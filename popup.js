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

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (!tabs[0]) return;

            // Check if we are on Google Calendar
            if (!tabs[0].url.includes('calendar.google.com')) {
                statusDiv.textContent = 'Not on Google Calendar';
                statusDiv.style.color = '#d93025';
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'force_check' }, function (response) {
                if (chrome.runtime.lastError) {
                    statusDiv.textContent = 'Error: Refresh page';
                    statusDiv.style.color = '#d93025';
                } else if (response) {
                    statusDiv.textContent = response.reason || 'Check completed';
                    statusDiv.style.color = response.buttonAdded ? '#137333' : '#e37400';
                }
            });
        });
    });
});
