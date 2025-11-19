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
            // Timeouts for safety (not fixed waits)
            dropdownTimeout: 1000,
            retryTimeout: 1000,
            saveWait: 0 // Instant save
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
    // STEALTH MODE UTILITIES
    // ============================================================================

    function injectStealthStyles() {
        const style = document.createElement('style');
        style.id = 'google-meet-stealth-style';
        style.textContent = `
            [role="menu"], [role="listbox"] {
                opacity: 0 !important;
                pointer-events: none !important;
                visibility: hidden !important;
            }
        `;
        document.head.appendChild(style);
    }

    function removeStealthStyles() {
        const style = document.getElementById('google-meet-stealth-style');
        if (style) {
            style.remove();
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

    function waitForElement(checkFn, timeout = 1000, interval = 10) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const check = async () => {
                try {
                    const result = await checkFn();
                    if (result) {
                        resolve(result);
                        return;
                    }
                } catch (e) {
                    // Ignore errors during check
                }

                if (Date.now() - startTime > timeout) {
                    resolve(null); // Resolve null instead of rejecting for cleaner flow control
                } else {
                    setTimeout(check, interval);
                }
            };

            check();
        });
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

    function isVisible(element) {
        return element.offsetParent !== null &&
            window.getComputedStyle(element).display !== 'none' &&
            window.getComputedStyle(element).visibility !== 'hidden';
    }

    function findVisibleSaveButton(dialog) {
        // Strategy 1: Text content "Save"
        const allButtons = dialog.querySelectorAll('button, div[role="button"]');
        for (const button of allButtons) {
            if (button.textContent.trim() === 'Save' && isVisible(button)) {
                return button;
            }
        }

        // Strategy 2: Selectors
        for (const selector of SELECTORS.saveButton) {
            const buttons = dialog.querySelectorAll(selector);
            for (const button of buttons) {
                if (isVisible(button)) {
                    return button;
                }
            }
        }

        return null;
    }

    function getVisualStyles(element) {
        const style = window.getComputedStyle(element);

        // 1. Robust Border Extraction
        // Shorthand 'border' often returns empty string in computed styles
        let border = style.border;
        if (!border || border === '') {
            if (style.borderStyle && style.borderStyle !== 'none') {
                border = `${style.borderWidth} ${style.borderStyle} ${style.borderColor}`;
            } else {
                border = 'none';
            }
        }

        // 2. Robust Text Color & Font Extraction
        // Text styles are often on a child <span> (common in Google Material buttons)
        let color = style.color;
        let fontFamily = style.fontFamily;
        let fontSize = style.fontSize;
        let fontWeight = style.fontWeight;
        let letterSpacing = style.letterSpacing;
        let textTransform = style.textTransform;

        // Find the deepest child that likely contains the text
        // This ensures we get the color of the text, not the button container
        const findTextWrapper = (el) => {
            if (el.children.length === 0 && el.textContent.trim().length > 0) return el;
            for (const child of el.children) {
                const found = findTextWrapper(child);
                if (found) return found;
            }
            return null;
        };

        const textWrapper = findTextWrapper(element);
        if (textWrapper) {
            const wrapperStyle = window.getComputedStyle(textWrapper);
            color = wrapperStyle.color;
            fontFamily = wrapperStyle.fontFamily;
            fontSize = wrapperStyle.fontSize;
            fontWeight = wrapperStyle.fontWeight;
            letterSpacing = wrapperStyle.letterSpacing;
            textTransform = wrapperStyle.textTransform;
        }

        return {
            backgroundColor: style.backgroundColor,
            height: style.height,
            padding: style.padding,
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            border: border,
            color: color,
            fontFamily: fontFamily,
            fontSize: fontSize,
            fontWeight: fontWeight,
            letterSpacing: letterSpacing,
            textTransform: textTransform,
            cursor: style.cursor,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
        };
    }

    function createRipple(event) {
        const button = event.currentTarget;
        const circle = document.createElement('span');
        const diameter = Math.max(button.clientWidth, button.clientHeight);
        const radius = diameter / 2;

        const rect = button.getBoundingClientRect();

        circle.style.width = circle.style.height = `${diameter}px`;
        circle.style.left = `${event.clientX - rect.left - radius}px`;
        circle.style.top = `${event.clientY - rect.top - radius}px`;
        circle.classList.add('google-meet-ripple');

        const ripple = button.getElementsByClassName('google-meet-ripple')[0];
        if (ripple) {
            ripple.remove();
        }

        button.appendChild(circle);
    }

    function createMeetButton(styles = {}) {
        const button = document.createElement('button');
        button.id = CONFIG.buttonId;
        button.className = 'google-meet-auto-add-button';
        button.textContent = CONFIG.buttonText;
        button.type = 'button';

        // Default fallbacks (Standard Google Blue)
        const defaults = {
            backgroundColor: '#0b57d0',
            color: 'white',
            border: 'none',
            borderRadius: '100px',
            padding: '0 24px',
            fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
            fontSize: '14px',
            fontWeight: '500',
            height: '36px',
            boxShadow: 'none'
        };

        const s = { ...defaults, ...styles };

        button.style.cssText = `
            background-color: ${s.backgroundColor};
            color: ${s.color};
            border: ${s.border};
            border-radius: ${s.borderRadius};
            padding: ${s.padding};
            font-family: ${s.fontFamily};
            font-size: ${s.fontSize};
            font-weight: ${s.fontWeight};
            letter-spacing: ${s.letterSpacing || 'normal'};
            text-transform: ${s.textTransform || 'none'};
            box-shadow: ${s.boxShadow};
            cursor: pointer;
            transition: background-color 0.2s, box-shadow 0.2s; /* Standard transitions */
            margin: 0 8px;
            white-space: nowrap;
            height: ${s.height};
            display: inline-flex;
            align-items: center;
            justify-content: center;
            position: relative; /* Required for ripple */
            overflow: hidden;   /* Required for ripple */
        `;

        // Material Ripple Effect
        button.addEventListener('mousedown', createRipple);

        button.addEventListener('click', handleMeetButtonClick);

        return button;
    }

    function addMeetButton(dialog) {
        if (dialog.querySelector(`#${CONFIG.buttonId}`)) {
            return false;
        }

        // Find the actual VISIBLE Save button to replace
        const saveBtn = findVisibleSaveButton(dialog);

        if (!saveBtn) {
            log('No visible Save button found - skipping');
            return false;
        }

        // Capture styles using robust extractor
        const computedStyles = getVisualStyles(saveBtn);
        log('Copied styles from visible Save button:', computedStyles);

        const button = createMeetButton(computedStyles);

        // Insert our button BEFORE the save button
        // We insert directly into the parent to maintain flex layout
        saveBtn.parentElement.insertBefore(button, saveBtn);

        // Force hide the original Save button
        const hideSaveButton = () => {
            saveBtn.classList.add('google-cal-save-hidden');
            saveBtn.style.display = 'none';
            saveBtn.style.visibility = 'hidden';
            saveBtn.setAttribute('aria-hidden', 'true');
        };

        hideSaveButton();

        // Monitor the Save button to ensure it stays hidden (some frameworks revert styles)
        const saveObserver = new MutationObserver(() => {
            if (saveBtn.style.display !== 'none') {
                hideSaveButton();
            }
        });
        saveObserver.observe(saveBtn, { attributes: true, attributeFilter: ['style', 'class'] });

        isButtonAdded = true;
        logSuccess('Button added successfully (replaced visible Save)');
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
            button.textContent = 'Working...';
            button.disabled = true;

            // Check if video conferencing is ALREADY added
            if (isVideoConferencingAlreadyAdded(dialog)) {
                log('Video conferencing already present - just saving');
                await clickSaveButton(dialog);
                return;
            }

            // ENABLE STEALTH MODE
            injectStealthStyles();

            // Step 1: Find and click video conferencing button
            const videoButton = findVideoConferencingButton(dialog);
            if (!videoButton) {
                throw new Error('Could not find video conferencing button');
            }

            // Click immediately
            videoButton.click();

            // Step 2: Rapidly wait for Google Meet option
            const meetOption = await waitForElement(
                () => findGoogleMeetOption(),
                CONFIG.timing.dropdownTimeout,
                10 // Check every 10ms
            );

            if (!meetOption) {
                throw new Error('Could not find Google Meet option');
            }

            // Click Meet option
            meetOption.click();
            log('Clicked Google Meet option');

            // Step 3: Wait for the Meet link to actually appear (Race condition fix)
            // We must ensure Google has processed the click before we save
            const meetAdded = await waitForElement(
                () => isVideoConferencingAlreadyAdded(dialog),
                CONFIG.timing.retryTimeout,
                10
            );

            if (!meetAdded) {
                throw new Error('Google Meet link failed to attach');
            }

            // Step 4: Save the event
            await clickSaveButton(dialog);

        } catch (error) {
            logError('Error adding Google Meet:', error);
            removeStealthStyles(); // Ensure we clean up on error
            showError(button, error.message);
        } finally {
            // Cleanup stealth styles (though dialog usually closes)
            setTimeout(removeStealthStyles, 100);
        }
    }

    async function clickSaveButton(dialog) {
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

        // Ensure it's clickable even if hidden
        saveButton.click();
        logSuccess('Event saved');

        // Reset button state
        const button = document.getElementById(CONFIG.buttonId);
        if (button) {
            button.textContent = '✓ Done!';
            // No timeout needed as dialog closes
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
