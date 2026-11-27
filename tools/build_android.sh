#!/usr/bin/env bash
# Build the signed AAB for Google Play (Pindou).
#
#   STAGE=release ./tools/build_android.sh   # signed bundleRelease AAB
#   STAGE=debug   ./tools/build_android.sh   # CI dry run: assembleDebug
#
# Signing values come from release.env (git-ignored) locally or from secrets
# on CI: KEYSTORE, KEYSTORE_PASS, KEYSTORE_USER (alias), KEY_PASS.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT/release.env" ]]; then
	# shellcheck disable=SC1091
	source "$ROOT/release.env"
fi
STAGE="${STAGE:-release}"
TARGET_SDK="${TARGET_SDK:-36}"
MIN_SDK="${MIN_SDK:-24}"
APP_ABI="${APP_ABI:-arm64-v8a}"
APP_NAME="${APP_NAME:-pindou}"
KEY_PASS="${KEY_PASS:-${KEYSTORE_PASS:-}}"

eval "$(python3 "$ROOT/tools/set_versions.py" get)"
VERSION="${VERSION:-$version}"
BUILD="${BUILD:-$build}"
BUILD_DIR="$ROOT/build/android"
PROJ_DIR="$BUILD_DIR/proj"
OUT_DIR="$ROOT/export/android"

find_cocos() {
	for candidate in \
		"${COCOS:-}" \
		"/Applications/Cocos/Creator/3.8.6/CocosCreator.app/Contents/MacOS/CocosCreator" \
		"$HOME/cocos-creator/CocosCreator.app/Contents/MacOS/CocosCreator"; do
		[[ -n "$candidate" && -x "$candidate" ]] && { echo "$candidate"; return; }
	done
}

CC_BIN="$(find_cocos || true)"
if [[ -z "$CC_BIN" ]]; then
	echo "Cocos Creator 3.8.6 not found. Set COCOS=/path/to/CocosCreator binary." >&2
	exit 1
fi

# Cocos 3.8.6 engine headers predate clang 17+ (Android NDK r28 clang); patch
# the installed editor's copy in place. Idempotent.
patch_engine_headers() {
	local header
	header="$(dirname "$(dirname "$CC_BIN")")/Resources/resources/3d/engine/native/cocos/core/event/EventTarget.h"
	if [[ -f "$header" ]] && grep -q -- '->template addEventListener(' "$header"; then
		sed -i.bak 's/->template addEventListener(/->addEventListener(/g' "$header" \
			&& rm -f "$header.bak"
		echo "patched engine header for new clang: $header"
	fi
}
patch_engine_headers

echo "== resolve Android SDK/NDK for Cocos"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ANDROID_NDK="${ANDROID_NDK:-$(find "$ANDROID_SDK/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | awk -F/ '$NF + 0 <= 27.99' | tail -1 || true)}"
if [[ -z "$ANDROID_NDK" ]]; then
	ANDROID_NDK="$(find "$ANDROID_SDK/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1 || true)"
	[[ -n "$ANDROID_NDK" ]] && echo "::warning::only NDK r28+ found; Cocos 3.8.x supports up to r27 — build may fail"
fi
if [[ ! -d "$ANDROID_SDK" ]]; then
	echo "Android SDK not found at $ANDROID_SDK (set ANDROID_HOME)" >&2
	exit 1
fi
if [[ -z "$ANDROID_NDK" ]]; then
	echo "No Android NDK under $ANDROID_SDK/ndk" >&2
	exit 1
fi
echo "sdk: $ANDROID_SDK"
echo "ndk: $ANDROID_NDK"

RESOLVED="$ROOT/.tmp/build-config-android.json"
mkdir -p "$ROOT/.tmp"
python3 - "$ROOT/tools/build-config-android.json" "$RESOLVED" \
	"$ANDROID_SDK" "$ANDROID_NDK" <<'PY'
import json, os, sys
src, dst, sdk, ndk = sys.argv[1:]
with open(src) as f:
    cfg = json.load(f)
android = cfg.setdefault('packages', {}).setdefault('android', {})
android['sdkPath'] = sdk
android['ndkPath'] = ndk
os.makedirs(os.path.dirname(dst), exist_ok=True)
with open(dst, 'w') as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
PY

echo "== Cocos CLI build -> Gradle project"
set +e
"$CC_BIN" --project "$ROOT" --build "configPath=$RESOLVED"
rc=$?
set -e
if [[ $rc != 36 && $rc != 0 ]]; then
	echo "Cocos CLI build failed with exit code $rc (36=ok, 32=bad params, 34=build error)" >&2
	exit 1
fi
python3 "$ROOT/tools/apply_custom_splash.py"
if [[ ! -d "$PROJ_DIR" ]]; then
	echo "No Gradle project at $PROJ_DIR" >&2
	exit 1
fi
echo "project: $PROJ_DIR"

GRADLE_PROPS="$PROJ_DIR/gradle.properties"
touch "$GRADLE_PROPS"
set_prop() {
	if grep -q "^$1=" "$GRADLE_PROPS"; then
		sed -i.bak "s|^$1=.*|$1=$2|" "$GRADLE_PROPS" && rm -f "$GRADLE_PROPS.bak"
	else
		printf '%s=%s\n' "$1" "$2" >> "$GRADLE_PROPS"
	fi
}

echo "== patch gradle.properties / manifest"
set_prop PROP_TARGET_SDK_VERSION "$TARGET_SDK"
set_prop PROP_MIN_SDK_VERSION "$MIN_SDK"
set_prop PROP_APP_ABI "$APP_ABI"
sed -i.bak "s/classpath 'com.android.tools.build:gradle:8.0.2'/classpath 'com.android.tools.build:gradle:8.13.0'/" \
	"$PROJ_DIR/build.gradle" && rm -f "$PROJ_DIR/build.gradle.bak"
echo "AGP: 8.13.0"

if [[ -f "$PROJ_DIR/gradle/wrapper/gradle-wrapper.properties" ]]; then
	sed -i.bak 's|gradle-8\.0\.2-bin.zip|gradle-8.13-bin.zip|' \
		"$PROJ_DIR/gradle/wrapper/gradle-wrapper.properties" \
		&& rm -f "$PROJ_DIR/gradle/wrapper/gradle-wrapper.properties.bak"
	echo "Gradle wrapper: 8.13"
fi

if [[ "$STAGE" == "release" ]]; then
	if [[ -z "${KEYSTORE:-}" || -z "${KEYSTORE_PASS:-}" || -z "${KEYSTORE_USER:-}" ]]; then
		echo "Signing not configured: set KEYSTORE / KEYSTORE_PASS / KEYSTORE_USER" >&2
		exit 1
	fi
	set_prop RELEASE_STORE_FILE "$KEYSTORE"
	set_prop RELEASE_STORE_PASSWORD "$KEYSTORE_PASS"
	set_prop RELEASE_KEY_ALIAS "$KEYSTORE_USER"
	set_prop RELEASE_KEY_PASSWORD "$KEY_PASS"
fi

NATIVE_DIR="$(sed -n 's/^NATIVE_DIR=//p' "$GRADLE_PROPS" | head -1)"
MAIN_MANIFEST=""
for candidate in "$NATIVE_DIR/app/AndroidManifest.xml" "$PROJ_DIR/app/AndroidManifest.xml"; do
	[[ -n "$candidate" && -f "$candidate" ]] && { MAIN_MANIFEST="$candidate"; break; }
done
if [[ -z "$MAIN_MANIFEST" ]]; then
	echo "app AndroidManifest.xml not found (NATIVE_DIR=$NATIVE_DIR)" >&2
	exit 1
fi

APP_GRADLE="$NATIVE_DIR/app/build.gradle"
if [[ ! -f "$APP_GRADLE" ]]; then
	echo "app/build.gradle not found at $APP_GRADLE" >&2
	exit 1
fi

NDK_VERSION="$(basename "$ANDROID_NDK")"
set_prop PROP_NDK_VERSION "$NDK_VERSION"
if ! grep -q "ndkVersion PROP_NDK_VERSION" "$APP_GRADLE"; then
	sed -i.bak "s|ndkPath PROP_NDK_PATH|ndkPath PROP_NDK_PATH\n    ndkVersion PROP_NDK_VERSION|" "$APP_GRADLE" \
		&& rm -f "$APP_GRADLE.bak" || true
fi
echo "app/build.gradle: ndkVersion $NDK_VERSION"

sed -i.bak "s/versionCode [0-9][0-9]*/versionCode $BUILD/" "$APP_GRADLE"
sed -i.bak "s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" "$APP_GRADLE"
rm -f "$APP_GRADLE.bak"
echo "app/build.gradle: version $VERSION ($BUILD)"

if grep -q 'android:screenOrientation=' "$MAIN_MANIFEST"; then
	sed -i.bak 's/android:screenOrientation="[^"]*"/android:screenOrientation="portrait"/' \
		"$MAIN_MANIFEST" && rm -f "$MAIN_MANIFEST.bak"
	echo "manifest: portrait locked"
else
	sed -i.bak "s|android:label=\"[^\"]*\"|&\n            android:screenOrientation=\"portrait\"|" "$MAIN_MANIFEST" \
		&& rm -f "$MAIN_MANIFEST.bak" && echo "manifest: portrait attribute added"
fi

# Force-remove BILLING injected by libcocos2dx when app has no IAP
if ! grep -q 'xmlns:tools=' "$MAIN_MANIFEST"; then
	sed -i.bak 's|<manifest |<manifest xmlns:tools="http://schemas.android.com/tools" |' \
		"$MAIN_MANIFEST" && rm -f "$MAIN_MANIFEST.bak"
fi
if ! grep -q 'com.android.vending.BILLING" tools:node="remove"' "$MAIN_MANIFEST"; then
	sed -i.bak '/com.android.vending.BILLING/d' "$MAIN_MANIFEST" && rm -f "$MAIN_MANIFEST.bak"
	sed -i.bak 's|<application|    <uses-permission android:name="com.android.vending.BILLING" tools:node="remove" />\n    <application|' \
		"$MAIN_MANIFEST" && rm -f "$MAIN_MANIFEST.bak"
	echo "manifest: BILLING force-removed (tools:node=remove)"
fi

GRADLE="$PROJ_DIR/gradlew"
if [[ ! -x "$GRADLE" ]]; then
	GRADLE="gradle"
	echo "no gradlew wrapper in $PROJ_DIR, using system gradle"
fi

for candidate in \
	/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
	/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
	if [[ -x "$candidate/bin/java" ]]; then
		export JAVA_HOME="$candidate"
		break
	fi
done
echo "JAVA_HOME: ${JAVA_HOME:-<ambient>}"

echo "== gradle $STAGE build"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
if [[ "$STAGE" == "debug" ]]; then
	(cd "$PROJ_DIR" && "$GRADLE" assembleDebug --no-daemon)
	APK="$(find "$PROJ_DIR" -path '*/outputs/apk/debug/*.apk' -print -quit)"
	if [[ -z "$APK" ]]; then
		echo "assembleDebug produced no APK" >&2
		exit 1
	fi
	cp "$APK" "$OUT_DIR/$APP_NAME-debug.apk"
	echo "Debug APK: $OUT_DIR/$APP_NAME-debug.apk"
	exit 0
fi

(cd "$PROJ_DIR" && "$GRADLE" bundleRelease --no-daemon \
	-Pandroid.injected.version.code="$BUILD" \
	-Pandroid.injected.version.name="$VERSION" \
	-Pandroid.injected.signing.store.file="$KEYSTORE" \
	-Pandroid.injected.signing.store.password="$KEYSTORE_PASS" \
	-Pandroid.injected.signing.key.alias="$KEYSTORE_USER" \
	-Pandroid.injected.signing.key.password="$KEY_PASS")

AAB="$(find "$PROJ_DIR" -path '*/outputs/bundle/release/*.aab' -print -quit)"
if [[ -z "$AAB" ]]; then
	echo "bundleRelease produced no AAB" >&2
	exit 1
fi
cp "$AAB" "$OUT_DIR/$APP_NAME-release.aab"

echo "== verify versionCode"
AAPT2="$(find "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/nonexistent}}" \
	-build-tools -name aapt2 -type f -print 2>/dev/null | sort -V | tail -1 || true)"
if [[ -n "$AAPT2" ]]; then
	CODE="$("$AAPT2" dump badging "$OUT_DIR/$APP_NAME-release.aab" 2>/dev/null \
		| head -1 | sed -n 's/.*versionCode=.\([0-9]*\).*/\1/p')"
	if [[ "$CODE" == "$BUILD" ]]; then
		echo "versionCode $CODE matches build $BUILD"
	else
		echo "versionCode mismatch: AAB says '$CODE', expected '$BUILD'" >&2
		exit 1
	fi
else
	echo "::warning::aapt2 not found; skipped the versionCode check"
fi

echo "Signed AAB: $OUT_DIR/$APP_NAME-release.aab (version $VERSION build $BUILD)"
