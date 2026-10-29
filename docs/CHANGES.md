# Repository preparation

Prepared on October 30, 2026.

- Exported native GRE Ascent from the preserved V1 commit `26c528e` instead of the later focus/alarm branch.
- Changed the flashcard helper label to English and incremented the evaluation build to 1.0.1 / versionCode 7. Original V1 artifacts were preserved.
- Rebuilt and verified a fresh debug APK using a separate local evaluation signing key.
- Included the existing Vocab Sprint web implementation as a separate companion. Extracted its study payload and added a portable bundler, avoiding old backups and private source paths.
- Changed non-English interface actions and search hints to English. Preserved supplied definitions, Bengali meanings, mnemonics, questions, and educational commentary.
- Added portable Java/Python checks, retained meaningful web regression tests, and documented actual validation limits.
- Excluded signing material, toolchains, build caches, personal study saves, unrelated projects, obsolete candidates, and development chat/task logs.

The learning algorithms, UI, and content banks were already implemented in the existing projects. This pass packages and documents that work; it does not claim a new implementation of every feature.
