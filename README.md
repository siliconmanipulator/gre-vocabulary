# GRE Vocabulary

An offline GRE vocabulary project with a native Android app and a browser companion. It combines flashcards, meaning and spelling quizzes, spaced review, and local progress tracking.

**This repository contains the mobile V1 study experience without device locking, kiosk mode, DND controls, or alarms.** The Android evaluation build is version 1.0.1, based on the preserved V1 source (`26c528e`), with an English interface label correction. The original V1 remains unchanged in the development repository.

## Try it

- **Web:** download this repository, open [`web/index.html`](web/index.html), and select **Continue**. No server, account, package installation, or API key is required.
- **Explore safely:** open [`web/sandbox.html`](web/sandbox.html). Its sample progress is separate from normal study progress.
- **Android:** download [`GRE-Ascent-1.0.1-debug.apk`](downloads/GRE-Ascent-1.0.1-debug.apk) using GitHub's **Download raw file** button. Requires Android 8.0 / API 26 or later. See [testing instructions](docs/TESTING.md).

## Features

- 959 vocabulary items with English definitions, Bengali meanings, word relationships, memory aids, and examples.
- Flashcards, pronunciation through available local voices, meaning MCQs, and typed spelling recall.
- Saved study sessions, mistake history, review scheduling, and separate new-learning progress.
- Native mobile: 22 study days, 64 blocks, 354 supplied practice questions, Previous mistakes, and long-term retention reviews.
- Web: guided 15-word sessions, 128 reviewed original practice questions, backup import/export, and an isolated preview mode.
- Dark/light themes and study time tracking. Core study works offline.

## Two implementations

| | Native mobile | Web companion |
|---|---|---|
| Application | GRE Ascent | Vocab Sprint |
| Stack | Java, Android Views, Python build tools | HTML, CSS, JavaScript, Python bundler |
| Storage | Private serialized study state | Browser local storage and JSON backups |
| Practice bank | 354 supplied questions | 128 reviewed original questions; legacy adaptations are separate |
| Progress transfer | No web import bridge | Manual browser backup import/export |

These are separate implementations with different scheduling and question selection. Feature parity and cross-platform save compatibility are not claimed.

## Build and verify

Requires Python 3, Node.js 20+ for web checks, and JDK 17 for mobile logic tests. The Android build also requires Android platform 35 and build-tools 35.0.0. No npm or pip dependencies are needed for the commands below.

```sh
python web/scripts/build.py
node web/scripts/verify_guided.cjs
node web/scripts/verify_learning.cjs
python -m unittest discover -s mobile/tests -p "test_*.py"
python mobile/scripts/test.py
python mobile/scripts/build_apk.py
```

Configure `GRE_ANDROID_TOOLS` before building the APK. See [architecture and build setup](docs/ARCHITECTURE.md).

## Repository layout

```text
mobile/       Native source, bundled study content, build scripts, engine tests
web/          Editable browser source, study payload, standalone HTML, tests
downloads/    Installable evaluation APK and SHA-256 checksum
docs/         Architecture, evaluation steps, validation, and project changes
```

## Status and ownership

Current checks cover Java study logic, fresh-process persistence, compiled web behavior, and APK integrity. Android emulator/device installation, native rendering, TTS, and lifecycle acceptance remain unverified. See [validation](docs/VALIDATION.md).

This is a personal, AI-assisted project. This packaging pass does not establish that earlier development used Claude Code. Product code and supplied study content have separate ownership; see [content notice](CONTENT_NOTICE.md). No third-party affiliation is implied.
