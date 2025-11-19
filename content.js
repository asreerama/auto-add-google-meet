/**
 * Google Meet Auto-Add Chrome Extension - Content Script
 * 
 * Automatically adds Google Meet video conferencing links to Google Calendar events with one click.
 * 
 * @version 1.0.0
 * @author asreerama
 * @repository https://github.com/asreerama/auto-add-google-meet
 * @license MIT
 * 
 * KEY FEATURES:
 * - "Chameleon Mode": Dynamically copies styles from native Google Calendar buttons
 * - "Turbo Mode": Instant execution with hidden dropdown menu (0ms delays)
 * - "Direct Add Heuristic": Intelligently detects single-provider accounts
 * - Material Design 3: Native ripple effects and state layers
 * - Persistent styling with MutationObservers to resist Google's re-renders
 * 
 * ARCHITECTURE:
 * 1. MutationObserver watches for event dialog creation
 * 2. When dialog detected, injects custom "Make it a Google Meet" button
 * 3. Button click triggers automated flow: find video button → click → add Meet → save
 * 4. Native "Save" button is styled as secondary to promote the custom button
 * 
 * BROWSER COMPATIBILITY:
 * - Chrome/Edge (Manifest V3)
 * - Only runs on calendar.google.com
 */

(function () {
    'use strict';

    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    const CONFIG = {
        debug: false, // Set to false for production
        debugAlerts: true, // ENABLED for active debugging phase
        extensionName: 'Google Meet Auto-Add',
        buttonId: 'google-meet-auto-add-btn',
        buttonText: 'Make it a Google Meet',
        colors: {
            // Google Material Design blue palette
            primary: '#0b57d0',          // Primary blue from Google Calendar
            primaryHover: 'rgba(11, 87, 208, 0.04)',  // 4% overlay for hover state
            success: '#137333',          // Green for success state
            error: '#d93025'             // Red for error state
        },
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
            backgroundColor: CONFIG.colors.primary,
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

        // Insert our button AFTER the save button (Zoom-like style)
        // We insert directly into the parent to maintain flex layout
        if (saveBtn.nextSibling) {
            saveBtn.parentElement.insertBefore(button, saveBtn.nextSibling);
        } else {
            saveBtn.parentElement.appendChild(button);
        }

        // Demote the Save button to Secondary style (match "More options")
        styleSaveButtonAsSecondary(saveBtn, dialog);

        isButtonAdded = true;
        logSuccess('Button added successfully (placed after Save)');
        return true;
    }

    function findMoreOptionsButton(dialog) {
        const allButtons = dialog.querySelectorAll('button, div[role="button"]');
        for (const button of allButtons) {
            if (button.textContent.trim().toLowerCase() === 'more options') {
                return button;
            }
        }
        return null;
    }

    function styleSaveButtonAsSecondary(saveBtn, dialog) {
        const moreOptionsBtn = findMoreOptionsButton(dialog);

        if (moreOptionsBtn) {
            log('Found "More options" button - copying classes for exact match');

            // STRATEGY: Copy the exact CSS classes from "More options"
            // This ensures we get the exact same font, color, hover state, ripple, and shape.
            // Google's framework uses classes like 'VfPpkd-LgbsSe' for styling.

            const targetClass = moreOptionsBtn.className;

            // Use our robust extractor to get the REAL text color (often hidden in a child span)
            const targetColor = getVisualStyles(moreOptionsBtn).color;

            const applyClasses = () => {
                // 1. Copy the class (Container style, hover, shape)
                if (saveBtn.className !== targetClass) {
                    saveBtn.className = targetClass;
                    saveBtn.style.cssText = ''; // Clear inline styles to let class win
                }

                // 2. CRITICAL: Force children to use the correct text color
                // The original Save button's internal spans have hardcoded white text classes/styles
                // We must override them to match the "More options" blue color
                const children = saveBtn.querySelectorAll('*');
                children.forEach(child => {
                    // We use the computed color from "More options" to be exact
                    child.style.setProperty('color', targetColor, 'important');
                });

                // Also force the button itself just in case
                saveBtn.style.setProperty('color', targetColor, 'important');
            };

            applyClasses();

            // PERSISTENCE: Watch for class reversions AND child changes
            const observer = new MutationObserver((mutations) => {
                let needsReapply = false;
                for (const mutation of mutations) {
                    // Check if class changed
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (saveBtn.className !== targetClass) {
                            needsReapply = true;
                        }
                    }
                    // Check if children changed (re-render)
                    if (mutation.type === 'childList' || mutation.type === 'subtree') {
                        needsReapply = true;
                    }
                }
                if (needsReapply) {
                    applyClasses();
                }
            });

            observer.observe(saveBtn, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeFilter: ['class', 'style']
            });

            return; // Exit early, we are done
        }

        // FALLBACK: If "More options" is not found, use manual styling (Legacy)
        log('Could not find "More options" button - using manual fallback styles');

        let secondaryStyles = {
            backgroundColor: 'transparent',
            color: CONFIG.colors.primary,
            border: 'none',
            padding: '0 24px',
            borderRadius: '4px',
            fontWeight: '500',
            boxShadow: 'none',
            textTransform: 'none',
            letterSpacing: 'normal',
            minWidth: 'auto'
        };


        const applyStyles = () => {
            // We use !important to ensure we override Google's default primary button classes
            saveBtn.style.setProperty('background-color', secondaryStyles.backgroundColor, 'important');
            saveBtn.style.setProperty('color', secondaryStyles.color, 'important');
            saveBtn.style.setProperty('border', secondaryStyles.border, 'important');
            saveBtn.style.setProperty('padding', secondaryStyles.padding, 'important');
            saveBtn.style.setProperty('border-radius', secondaryStyles.borderRadius, 'important');
            saveBtn.style.setProperty('font-weight', secondaryStyles.fontWeight, 'important');
            saveBtn.style.setProperty('font-size', secondaryStyles.fontSize, 'important');
            saveBtn.style.setProperty('font-family', secondaryStyles.fontFamily, 'important');
            saveBtn.style.setProperty('box-shadow', 'none', 'important'); // Force flat
            saveBtn.style.setProperty('text-transform', secondaryStyles.textTransform, 'important');
            saveBtn.style.setProperty('letter-spacing', secondaryStyles.letterSpacing, 'important');
            saveBtn.style.setProperty('min-width', secondaryStyles.minWidth || 'auto', 'important');

            // CRITICAL FIX: Force text color on ALL children (spans, divs)
            // The original Save button has white text on internal spans that overrides the button color
            const children = saveBtn.querySelectorAll('*');
            children.forEach(child => {
                child.style.setProperty('color', secondaryStyles.color, 'important');
            });
        };

        // Apply immediately
        applyStyles();

        // PERSISTENCE: Google's framework often re-renders buttons, wiping inline styles.
        // We must watch for changes and re-apply our secondary styling.
        const observer = new MutationObserver((mutations) => {
            let needsReapply = false;
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' &&
                    (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                    // Check if our critical styles are missing
                    if (saveBtn.style.backgroundColor !== secondaryStyles.backgroundColor) {
                        needsReapply = true;
                        break;
                    }
                }
                // Also check if children lost their color
                if (mutation.type === 'childList' || mutation.type === 'subtree') {
                    needsReapply = true;
                    break;
                }
            }
            if (needsReapply) {
                applyStyles();
            }
        });

        observer.observe(saveBtn, {
            attributes: true,
            childList: true, // Watch for internal re-renders
            subtree: true,   // Watch deep
            attributeFilter: ['style', 'class']
        });

        // Add hover effect for secondary button
        saveBtn.addEventListener('mouseenter', () => {
            // If transparent, add a subtle blue tint (standard Google behavior)
            if (secondaryStyles.backgroundColor === 'transparent' ||
                secondaryStyles.backgroundColor === 'rgba(0, 0, 0, 0)' ||
                secondaryStyles.backgroundColor === '') {
                saveBtn.style.setProperty('background-color', CONFIG.colors.primaryHover, 'important');
            } else {
                saveBtn.style.filter = 'brightness(0.95)';
            }
        });
        saveBtn.addEventListener('mouseleave', () => {
            saveBtn.style.setProperty('background-color', secondaryStyles.backgroundColor, 'important');
            saveBtn.style.filter = 'none';
        });
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

            // HEURISTIC: Check if this is a "Direct Add" button
            // If the button text explicitly mentions "Google Meet", it's likely a direct add
            // and will NOT open a dropdown menu.
            const buttonText = (videoButton.textContent || '').toLowerCase();
            const isDirectAdd = buttonText.includes('google meet');

            // Click immediately
            videoButton.click();

            if (isDirectAdd) {
                log('Direct "Add Google Meet" button detected - skipping menu search');
                // We expect the link to appear directly.
                // We fall through to Step 3 (Wait for link)
            } else {
                // Generic "Add video conferencing" button.
                // It MIGHT be a direct add (single provider) OR a menu.

                // OPTIMISTIC CHECK: Did clicking the button ALREADY add the meeting?
                const immediateSuccess = await waitForElement(
                    () => isVideoConferencingAlreadyAdded(dialog),
                    100, // Reduced to 100ms for maximum snappiness
                    50
                );

                if (immediateSuccess) {
                    log('Single provider detected - Meet added immediately');
                    // Skip the menu logic!
                } else {
                    // Standard Flow: It opened a menu, so we need to find and click "Google Meet"

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
                }
            }

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
            debugAlert(`CAUGHT ERROR in handleMeetButtonClick:\n\n${error.message}\n\nStack:\n${error.stack}`);
            showError(button, error.message);
        } finally {
            // Cleanup stealth styles (though dialog usually closes)
            setTimeout(removeStealthStyles, 100);
        }
    }


    // ============================================================================
    // DEBUGGING
    // ============================================================================

    function debugAlert(message) {
        if (CONFIG.debugAlerts) {
            // Use a timeout to ensure it renders after UI updates
            setTimeout(() => {
                alert(`[Google Meet Auto-Add DEBUG]\n\n${message}`);
            }, 10);
        }
    }

    async function clickSaveButton(dialog) {
        // DEBUG: Check dialog state
        const isDialogConnected = dialog.isConnected;
        const dialogHTML = dialog.innerHTML.substring(0, 100) + '...';

        if (!isDialogConnected) {
            debugAlert(`CRITICAL ERROR: The dialog reference is STALE (not connected to DOM).\n\nThis confirms the "Ghost Dialog" theory.\nWe need to re-fetch the dialog.`);
        }

        let saveButton = findElementWithFallbacks(SELECTORS.saveButton, dialog);

        // Detailed search logging
        let debugInfo = `Searching for Save button...\nDialog Connected: ${isDialogConnected}\n`;

        if (!saveButton) {
            const allButtons = dialog.querySelectorAll('button, div[role="button"]');
            debugInfo += `Found ${allButtons.length} total buttons in dialog:\n`;

            for (const btn of allButtons) {
                const text = btn.textContent.trim();
                const visible = isVisible(btn);
                debugInfo += `- "${text}" (Visible: ${visible})\n`;

                if (text === 'Save') {
                    saveButton = btn;
                    debugInfo += `  -> MATCHED "Save" by text!\n`;
                    break;
                }
            }
        } else {
            debugInfo += `Found Save button by selector!\n`;
        }

        if (!saveButton) {
            debugAlert(`FAILURE: Could not find Save button.\n\n${debugInfo}`);
            throw new Error('Could not find Save button');
        }

        if (!isVisible(saveButton)) {
            debugAlert(`WARNING: Found Save button but it is HIDDEN.\n\n${debugInfo}\nAttempting to click anyway...`);
        }

        // Click the save button (works even if hidden)
        saveButton.click();
        logSuccess('Event saved');

        // debugAlert(`SUCCESS: Clicked Save button!\n\n${debugInfo}`);

        // Update button state to show success
        const button = document.getElementById(CONFIG.buttonId);
        if (button) {
            button.textContent = '✓ Done!';
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
