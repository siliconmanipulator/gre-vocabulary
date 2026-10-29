# Validation

Checked on October 30, 2026, using the packaged source and a new evaluation APK.

| Check | Result |
|---|---|
| Native study engine, review, repetition, memory, motion, persistence, real-corpus quiz generation | 13,212 Java assertions passed |
| Native bundled content/source coverage | 4 Python tests passed |
| Web guided rules, complete application bundle, migration, sandbox separation | 48 checks passed |
| Web earlier learning flow and Android bridge compatibility | 28 checks passed |
| Android resources, Java compilation, DEX packaging | Passed |
| APK signatures, ZIP alignment, integrity, manifest metadata | Passed |
| Bundled APK content matches checked-in content asset | Passed |
| Requested Android permissions | None |

Machine-readable web summaries are in `web/qa/`. Android build metadata is in `docs/android-build.json`; the distributed APK fingerprint is in `downloads/SHA256SUMS`.

Web checks use an isolated Node VM with synthetic DOM/storage. They do not establish live browser visual quality. Java persistence checks use separate processes; they do not establish Android lifecycle behavior.

Android emulator/physical-device installation, native rendering, gestures, accessibility, installed/missing TTS, and lifecycle acceptance were not performed in this packaging pass. Historical development checks against private PDFs and earlier Git engines were not rerun and are not required by the portable evaluation suite.

The evaluation APK uses a new debug certificate. It is not a signed update for an earlier privately installed build. Use a fresh emulator for evaluation and preserve existing progress before changing installed apps.
