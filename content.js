// Google Meet Auto-Add Extension
// Automatically adds Google Meet links to Google Calendar events

(function () {
    'use strict';

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const CONFIG = {
        debug: false, // Set to false for production
        extensionName: 'Google Meet Auto-Add',
        buttonId: 'google-meet-auto-add-btn',
        buttonText: 'Make it a Google Meet',
        timing: {
            dropdownWait: 400,    // Wait for dropdown to open
            retryWait: 200,       // Wait between retries
            saveWait: 500         // Wait before clicking save
        }
    };

    // ============================================================================
    // LOGGING UTILITIES
    // ============================================================================

    function log(message, data = null) {
        if (CONFIG.debug) {
            console.log(`[${CONFIG.extensionName}]`, message, data || '');
        }
    }

    function logError(message, error = null) {
        console.error(`[${CONFIG.extensionName}] ERROR:`, message, error || '');
    }

    function logSuccess(message) {
        if (CONFIG.debug) {
            console.log(`[${CONFIG.extensionName}] SUCCESS:`, message);
        }
    }

    // ============================================================================
    // SELECTORS
    // ============================================================================

    const SELECTORS = {
        eventDialog: [
            '[role="dialog"]',
            '.VfPpkd-dgl2Hf-ppHlrf-sM5MNb'
        ],
        saveButton: [
            '[data-action-id="save"]',
            'button[aria-label*="Save"]'
        ],
        googleMeetOption: [
            '[role="menuitem"]',
            '[role="option"]',
            'li'
        ]
    };

    // ============================================================================
    // STATE
    // ============================================================================

    let observer = null;
    let isButtonAdded = false;

    // ============================================================================
    // MESSAGE LISTENER
    // ============================================================================

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'force_check') {
            log('Force check triggered');
            sendResponse(performForceCheck());
        }
        return true;
    });

    function performForceCheck() {
        const dialog = findEventDialog(document.body);
        if (!dialog) {
            return { status: 'checked', dialogFound: false, reason: 'No event dialog found' };
        }

        const existingButton = dialog.querySelector(`#${CONFIG.buttonId}`);
        if (existingButton) {
            existingButton.remove();
            isButtonAdded = false;
        }

        if (isVideoConferencingAlreadyAdded(dialog)) {
            return { status: 'checked', dialogFound: true, reason: 'Video conferencing already active' };
        }

        const added = addMeetButton(dialog);
        return {
            status: 'checked',
            dialogFound: true,
            buttonAdded: added,
            reason: added ? 'Button added' : 'Could not add button'
        };
    }

    // ============================================================================
    // DOM UTILITIES
    // ============================================================================

    function findElementWithFallbacks(selectors, context = document) {
        if (typeof selectors === 'string') selectors = [selectors];

        for (const selector of selectors) {
            try {
                const element = context.querySelector(selector);
                if (element) return element;
            } catch (error) {
                log(`Invalid selector: ${selector}`);
            }
        }
        return null;
    }

    function findEventDialog(element) {
        let dialog = null;

        if (element.querySelector) {
            dialog = findElementWithFallbacks(SELECTORS.eventDialog, element);
        }

        if (!dialog && element.matches) {
            for (const selector of SELECTORS.eventDialog) {
                if (element.matches(selector)) {
                    dialog = element;
                    break;
                }
            }
        }

        if (dialog) {
            const style = window.getComputedStyle(dialog);
            if (style.display === 'none' || style.visibility === 'hidden') {
                return null;
            }
        }

        return dialog;
    }

    function waitFor(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================================================
    // CLICK UTILITIES
    // ============================================================================

    async function robustClick(element) {
        if (!element) return false;

        try {
            const events = ['mousedown', 'mouseup', 'click'].map(type =>
                new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
            );

            element.dispatchEvent(events[0]);
            await waitFor(50);
            element.dispatchEvent(events[1]);
            await waitFor(50);
            element.dispatchEvent(events[2]);

            log('Clicked element via MouseEvent');
            return true;
        } catch (error) {
            logError('Error in robustClick:', error);
            return false;
        }
    }

    // ============================================================================
    // VIDEO CONFERENCING DETECTION
    // ============================================================================

    function isVideoConferencingAlreadyAdded(dialog) {
        const meetLinks = dialog.querySelectorAll('[href*="meet.google.com"]');
        for (const link of meetLinks) {
            const href = link.getAttribute('href');
            if (href && !href.includes('abc-defg-hij') && !href.includes('placeholder')) {
                return true;
            }
        }

        const videoSection = dialog.querySelector('[data-field="conferenceData"]');
        if (videoSection) {
            const text = videoSection.textContent.toLowerCase();
            if (text.includes('meet') && !text.includes('abc-defg-hij')) {
                return true;
            }
        }

        return false;
    }

    function findVideoConferencingButton(dialog) {
        const candidates = dialog.querySelectorAll('button, div[role="button"], [jsaction]');

        for (const candidate of candidates) {
            const text = (candidate.textContent || '').trim().replace(/\s+/g, ' ').toLowerCase();
            const ariaLabel = (candidate.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').toLowerCase();

            if (text === 'add video conferencing' ||
                text === 'add google meet video conferencing' ||
                ariaLabel === 'add video conferencing' ||
                ariaLabel === 'add google meet video conferencing') {
                log('Found video conferencing button');
                return candidate;
            }
        }

        return null;
    }

    async function findGoogleMeetOption() {
        const menuItems = document.querySelectorAll('[role="menuitem"], [role="option"], li');

        for (const item of menuItems) {
            if (item.offsetParent === null) continue;

            const text = (item.textContent || '').toLowerCase();
            const ariaLabel = (item.getAttribute('aria-label') || '').toLowerCase();

            if (text.includes('google meet') || ariaLabel.includes('google meet')) {
                log('Found Google Meet option');
                return item;
            }
        }
        return null;
    }

    // ============================================================================
    // BUTTON MANAGEMENT
    // ============================================================================

    function findButtonContainer(dialog) {
        // Strategy 1: Find Save button by text
        const allButtons = dialog.querySelectorAll('button, div[role="button"]');
        for (const button of allButtons) {
            if (button.textContent.trim() === 'Save') {
                return button.parentElement;
            }
        }

        // Strategy 2: Find Save button by selector
        const saveButton = findElementWithFallbacks(SELECTORS.saveButton, dialog);
        if (saveButton) {
            return saveButton.parentElement;
        }

        // Strategy 3: Create container if this is a full dialog
        if (dialog.getAttribute('role') === 'dialog') {
            const container = document.createElement('div');
            container.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding: 16px;';
            dialog.appendChild(container);
            return container;
        }

        return null;
    }

    function createMeetButton() {
        const button = document.createElement('button');
        button.id = CONFIG.buttonId;
        button.className = 'google-meet-auto-add-button';
        button.textContent = CONFIG.buttonText;
        button.type = 'button';

        button.style.cssText = `
            background-color: #1a73e8;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 16px;
            font-family: 'Google Sans', Roboto, Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
            margin: 0 8px;
            white-space: nowrap;
        `;

        button.addEventListener('mouseenter', () => button.style.backgroundColor = '#1557b0');
        button.addEventListener('mouseleave', () => button.style.backgroundColor = '#1a73e8');
        button.addEventListener('click', handleMeetButtonClick);

        return button;
    }

    function addMeetButton(dialog) {
        // Only add to full edit dialogs (must have Save button)
        const saveButton = findElementWithFallbacks(SELECTORS.saveButton, dialog);
        if (!saveButton) {
            const allButtons = dialog.querySelectorAll('button, div[role="button"]');
            let foundSave = false;
            for (const btn of allButtons) {
                if (btn.textContent.trim() === 'Save') {
                    foundSave = true;
                    break;
                }
            }
            if (!foundSave) {
                log('No Save button - skipping (likely preview card)');
                return false;
            }
        }

        if (dialog.querySelector(`#${CONFIG.buttonId}`)) {
            return false;
        }

        if (isVideoConferencingAlreadyAdded(dialog)) {
            log('Video conferencing already added');
            return false;
        }

        const button = createMeetButton();
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; align-items: center; flex-shrink: 0;';
        wrapper.appendChild(button);

        const container = findButtonContainer(dialog);
        if (!container) {
            logError('Could not find button container');
            return false;
        }

        const saveBtn = findElementWithFallbacks(SELECTORS.saveButton, dialog);
        if (saveBtn && container.contains(saveBtn)) {
            container.insertBefore(wrapper, saveBtn);
        } else {
            container.appendChild(wrapper);
        }

        isButtonAdded = true;
        logSuccess('Button added successfully');
        return true;
    }

    // ============================================================================
    // CLICK HANDLER
    // ============================================================================

    async function handleMeetButtonClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const button = event.target;
        const dialog = button.closest('[role="dialog"]') || button.closest('.VfPpkd-dgl2Hf-ppHlrf-sM5MNb');

        if (!dialog) {
            showError(button, 'Could not find event dialog');
            return;
        }

        try {
            button.textContent = 'Adding Meet...';
            button.disabled = true;

            // Step 1: Find and click video conferencing button
            const videoButton = findVideoConferencingButton(dialog);
            if (!videoButton) {
                throw new Error('Could not find video conferencing button');
            }

            await robustClick(videoButton);
            await waitFor(CONFIG.timing.dropdownWait);

            // Check if we accidentally opened the "Browse rooms" dialog
            const roomDialog = document.querySelector('[role="dialog"][aria-label*="room"], [role="dialog"][aria-label*="Room"]');
            if (roomDialog && roomDialog.offsetParent !== null) {
                throw new Error('Opened wrong dialog (rooms)');
            }

            // Step 2: Find and click Google Meet option
            let meetOption = null;
            for (let i = 0; i < 3; i++) {
                meetOption = await findGoogleMeetOption();
                if (meetOption) break;
                await waitFor(CONFIG.timing.retryWait);
            }

            if (!meetOption) {
                throw new Error('Could not find Google Meet option');
            }

            meetOption.click();
            log('Clicked Google Meet option');

            // Step 3: Save the event
            button.textContent = 'Saving...';
            await waitFor(CONFIG.timing.saveWait);

            let saveButton = findElementWithFallbacks(SELECTORS.saveButton, dialog);
            if (!saveButton) {
                const allButtons = dialog.querySelectorAll('button, div[role="button"]');
                for (const btn of allButtons) {
                    if (btn.textContent.trim() === 'Save') {
                        saveButton = btn;
                        break;
                    }
                }
            }

            if (!saveButton) {
                throw new Error('Could not find Save button');
            }

            saveButton.click();
            logSuccess('Event saved with Google Meet');

            button.textContent = '✓ Done!';
            setTimeout(() => {
                button.textContent = CONFIG.buttonText;
                button.disabled = false;
            }, 1500);

        } catch (error) {
            logError('Error adding Google Meet:', error);
            showError(button, error.message);
        }
    }

    function showError(button, message) {
        button.textContent = 'Error';
        button.title = message;
        button.disabled = false;

        setTimeout(() => {
            button.textContent = CONFIG.buttonText;
            button.title = '';
        }, 3000);
    }

    // ============================================================================
    // OBSERVER
    // ============================================================================

    function checkForEventDialog(element) {
        const dialog = findEventDialog(element);
        if (dialog && (!isButtonAdded || !dialog.querySelector(`#${CONFIG.buttonId}`))) {
            addMeetButton(dialog);
        }
    }

    function startObserver() {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldCheck = true;
                }
            });

            if (shouldCheck) {
                checkForEventDialog(document.body);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        checkForEventDialog(document.body);
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    function init() {
        if (!window.location.hostname.includes('calendar.google.com')) {
            return;
        }

        log('Extension initialized');
        startObserver();

        // Listen for dialog close events
        document.addEventListener('click', (event) => {
            if (event.target.matches('[aria-label*="Close"], [data-action-id="cancel"]')) {
                isButtonAdded = false;
            }
        });
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
