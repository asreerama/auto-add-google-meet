# Privacy Policy for Google Meet Auto-Add

**Last Updated: November 2025**

This Privacy Policy describes how the **Google Meet Auto-Add** browser extension ("we", "us", or "our") handles your information.

## 1. Data Collection and Usage

**We do not collect, store, or transmit any of your personal data.**

*   **No Remote Servers:** This extension operates entirely locally on your device. It does not communicate with any external servers, analytics services, or third-party trackers.
*   **No Account Required:** You do not need to create an account or sign in to use this extension.
*   **Google Calendar Data:** The extension interacts with the Google Calendar page solely to inject the "Make it a Google Meet" button and automate clicks on the page. It does not read, save, or export your calendar event details, meeting titles, attendees, or descriptions.

## 2. Permissions

We require specific permissions to function:

*   **`activeTab` & `tabs`**: Used to detect when you are on `calendar.google.com` and to allow the "Force Check / Debug" popup button to communicate with the calendar tab. We do not read your browsing history.
*   **`scripting`**: Used to inject the button code into the Google Calendar page securely.
*   **`host_permissions` (`https://calendar.google.com/*`)**: Ensures the extension *only* runs on Google Calendar and nowhere else.

## 3. Data Security

Since we do not collect any data, there is no data store for us to secure. Your calendar data remains strictly between your browser and Google's servers, governed by Google's own privacy policy.

## 4. Changes to This Policy

We may update this Privacy Policy from time to time. If we make material changes (e.g., if we introduce a feature that requires data collection), we will notify users through the extension update notes.

## 5. Contact Us

If you have any questions about this Privacy Policy, please contact us via our GitHub repository:
[https://github.com/asreerama/auto-add-google-meet](https://github.com/asreerama/auto-add-google-meet)

