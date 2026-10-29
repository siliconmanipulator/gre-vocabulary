# Evaluation guide

## Web: five-minute check

1. Open `web/index.html` in a modern desktop browser. Select Continue and browse the first learning block.
2. Reveal a card, navigate between words, and try pronunciation. Audio depends on installed local voices.
3. Continue to meaning/spelling practice. Enter one wrong answer, inspect feedback, then reload and confirm the session resumes.
4. Inspect Library, Practice, Journey, and theme settings. Export a backup before clearing browser storage.
5. Open `web/sandbox.html` to inspect sample screens without changing the normal study save.

If local-file storage is restricted, run `python -m http.server 8000 --directory web` from the repository root and open `http://localhost:8000`. A file URL and a localhost URL have separate saves.

## Android

Use a disposable Android emulator with API 26 or later; API 35 is preferred. Download the APK from `downloads/` and drag it onto the running emulator, or use `adb -s EMULATOR_SERIAL install downloads/GRE-Ascent-1.0.1-debug.apk` with the selected emulator serial.

Check Today, the 15-word learning block, meaning/spelling feedback, Previous mistakes after qualifying errors, Library, and Practice. Close and reopen the app to check saved progress. Switch themes and test local pronunciation. Home, Back, and app switching must remain available. No lock or alarm setup is present.

The supplied APK is a debug evaluation build, not a Play Store production release. This packaging pass does not claim Android runtime acceptance.

## Automated checks

Run the commands in the README. Web tests use an isolated Node VM and synthetic storage. Mobile Java tests cover scheduling, progress, mistakes, retention, spring physics, real-content quiz options, and state reloading in fresh Java processes. Python tests check bundled source consistency. None of these tests install an APK or access personal learning progress.
