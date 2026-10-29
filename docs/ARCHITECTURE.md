# Architecture and build setup

## Native Android

`mobile/app/src/com/greascent/app/MainActivity.java` implements the Android Views UI. `StudyEngine.java` owns study state, quiz generation, review scheduling, and history. `SpringPhysics.java` and `SpringMotion.java` provide local motion behavior.

Study data is bundled in `mobile/app/assets/content.json`. The app stores progress privately on the device. It requests no Android permissions and has no network dependency. Android's installed text-to-speech service supplies pronunciation when a suitable local voice is available.

`mobile/content/` contains the supplied Markdown records and example provenance. `python mobile/scripts/import_content.py` regenerates the content asset and audit. Source field labels are preserved for compatibility; parser code uses Unicode escapes for non-English source keys. Generated examples remain identified in data and audits.

## Android toolchain

The existing build script runs Java, AAPT2, D8, zipalign, and apksigner directly. It uses installed tools and does not download dependencies.

Set `GRE_ANDROID_TOOLS` to a directory with this layout:

```text
toolchain/
  jdk-17/bin/             javac.exe, java.exe, keytool.exe
  build-tools-35/         aapt.exe, aapt2.exe, zipalign.exe, lib/d8.jar, lib/apksigner.jar
  android-35/android.jar
```

JDK/build-tools directory names may differ; the script discovers their executables. The Android packaging script currently expects Windows `.exe` tools. The Java engine test runner can also use `javac` on PATH.

```powershell
$env:GRE_ANDROID_TOOLS = 'C:\Android\gre-toolchain'
python mobile/scripts/build_apk.py
```

Output: `mobile/build/debug/GRE-Ascent-1.0.1-debug.apk`. A new local debug key is created under ignored `mobile/signing/`. Signing keys and downloaded toolchains are not included. A separately rebuilt APK may require a clean emulator installation because its signing certificate differs. Preserve existing progress before changing an installed app.

## Browser companion

`web/src/journey-core.js` handles guided learning rules. `learning.js` and `core.js` preserve earlier flows and migration. UI code is split across `app.js`, `journey.js`, `cards.js`, `rounds.js`, and the isolated sandbox module. CSS and the HTML shell live beside them.

`web/data/payload.json` is the complete study-data snapshot extracted from the existing app. The standard-library bundler combines that payload and the editable sources into `index.html` and `sandbox.html`. It does not scrape books or require the original private source locations. The existing reviewed commentary and source records are preserved as educational data.

Browser state remains local to its origin. Backups are manual. The sandbox uses separate keys and cannot replace real progress through the normal import gate. Native and web save formats are different.
