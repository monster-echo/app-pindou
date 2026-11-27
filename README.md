# 趣味拼豆工坊 · Pindou

Pindou is a color-by-number game built with Cocos Creator 3.8.6. This repository contains the current Cocos Creator application and store-release automation.

## Build and release

- App Store Connect: tagged releases build a signed iOS IPA, upload it to TestFlight, and wait for Apple build processing.
- Google Play: tagged releases build a signed Android App Bundle, upload it to the internal testing track, and save a production draft.
- A tag must match `release/version.json`, for example `v1.0.1`.
- Before each store upload, increase `build` in `release/version.json`; store build numbers must be unique and increasing.
- GitHub Actions → `release` → Run workflow with `dry_run=true` builds unsigned validation artifacts without signing or uploading to stores.

The workflow uses the repository's existing Android, Apple, and Google Play Actions secrets. Android secret labels retain their historical names; their values are not stored in this repository. Never commit signing keys, passwords, certificates, or service-account JSON files.

App Store Connect upload is to TestFlight; it does not submit an App Store version for review. Google Play upload places the build on internal testing and leaves production as a draft.
