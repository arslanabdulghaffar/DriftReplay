# Local browser review

Date: 2026-10-10. Target: http://127.0.0.1:4173. Browser: Codex in-app browser.
This records actual manual browser-tool observations; it is not an automated accessibility certification.

- Opened the built static overview and inspected a real rendered screenshot.
- Navigated through the MercuryPay fixture explorer, evidence definitions, and phase status pages.
- Confirmed synthetic/Phase 1 labels, planned capability boundaries, and runtime NOT RUN wording.
- Fixture explorer exposes imported contracts, business case, oracle, mapping and manifest.
- At a 1280 × 900 viewport, the overview had one main landmark, one h1, and document scroll width 1265 within width 1280.
- At 390 × 844, document scroll width was 375 within width 390. Code blocks scroll within their containers.
- Keyboard activation of the Skip to content link focused MAIN#main-content.
- One early narrow-width pointer attempt on Phase status did not navigate and waitForURL timed out. Keyboard Enter worked. No console warnings/errors were returned.
- Updated the mobile navigation to a two-column grid at widths <=440px. Rebuilt and repeated six HTTP smoke checks successfully.
- After reloading the final build at 390px, all four navigation links were within x=16..359, each 44px high. Evidence and Phase status pointer clicks navigated successfully.
- Final console warning/error query returned an empty list.
- Reset the temporary viewport, returned to Overview, and inspected another real screenshot. Left the local preview tab open as a deliverable.

Screenshots were inspected in the conversation, not exported as image files. The in-app browser's
viewport override produced scaled/cropped screenshot presentation, so viewport containment measurements
came from the page DOM. Dark theme was visually inspected. Light theme CSS was source-reviewed;
no separate rendered light-theme, full screen-reader, automated contrast, or cross-browser audit is claimed.
