#!/usr/bin/env bash
set -e

VERSION_NAME="${1:-1.7.0}"
VERSION_CODE="${2:-7}"
RELEASE_NOTES="${3:-NEXORA v1.7.0 Production Release: Default CURRENT TIMETABLE (Class In-Charge: Diksha Mam) with instant OLD TIMETABLE switcher, 1-page A4 landscape PDF & Print export, Android APK native PDF download bridge, and Node.js production server ESM startup fix.}"

echo "=== Building Genuine NEXORA Android Release APK v${VERSION_NAME} (code ${VERSION_CODE}) ==="

ANDROID_JAR="/usr/lib/android-sdk/platforms/android-23/android.jar"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Ensure directories
rm -rf android/build
mkdir -p android/build/gen android/build/obj android/build/bin public/downloads android/keystore

# 0. Build production web bundle and sync into android/assets/www
echo "0. Building production web assets for standalone APK packaging..."
npm run build

rm -rf android/assets
mkdir -p android/assets/www
cp -r dist/* android/assets/www/
rm -f android/assets/www/downloads/*.apk android/assets/www/downloads/*.idsig

# Update AndroidManifest.xml version attributes dynamically
cat <<EOF > android/AndroidManifest.xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.theabhinavschool.nexora"
    android:versionCode="${VERSION_CODE}"
    android:versionName="${VERSION_NAME}">

    <uses-sdk
        android:minSdkVersion="21"
        android:targetSdkVersion="33" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">

        <activity
            android:name="com.theabhinavschool.nexora.MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize"
            android:exported="true"
            android:label="@string/app_name"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
EOF

# Update MainActivity.java with current version string
sed -i "s/public static final String APP_VERSION = .*/public static final String APP_VERSION = \"${VERSION_NAME}\";/" android/src/com/theabhinavschool/nexora/MainActivity.java
sed -i "s/public static final int VERSION_CODE = .*/public static final int VERSION_CODE = ${VERSION_CODE};/" android/src/com/theabhinavschool/nexora/MainActivity.java

if command -v aapt >/dev/null 2>&1 && command -v apksigner >/dev/null 2>&1 && [ -f "$ANDROID_JAR" ]; then
  echo "1. Generating R.java with AAPT..."
  aapt package -m -J android/build/gen \
    -M android/AndroidManifest.xml \
    -S android/res \
    -I "$ANDROID_JAR"

  echo "2. Compiling Java sources with javac (Java 8 bytecode target)..."
  javac -source 8 -target 8 \
    -bootclasspath "$ANDROID_JAR" \
    -cp "$ANDROID_JAR" \
    -d android/build/obj \
    android/build/gen/com/theabhinavschool/nexora/R.java \
    android/src/com/theabhinavschool/nexora/MainActivity.java

  echo "3. Compiling classes to classes.dex using dalvik-exchange..."
  dalvik-exchange --dex --output=android/build/bin/classes.dex android/build/obj

  echo "4. Packaging APK resources and standalone web bundle with AAPT..."
  aapt package -f \
    -M android/AndroidManifest.xml \
    -S android/res \
    -A android/assets \
    -I "$ANDROID_JAR" \
    -F android/build/bin/nexora-unaligned.apk

  echo "5. Adding classes.dex to APK root..."
  cd android/build/bin
  aapt add -f nexora-unaligned.apk classes.dex
  cd "$PROJECT_ROOT"

  echo "6. Aligning APK with zipalign (4-byte boundary)..."
  zipalign -v -p 4 android/build/bin/nexora-unaligned.apk android/build/bin/nexora-aligned.apk

  KEYSTORE="android/keystore/nexora-release.jks"
  KEYSTORE_PASS="nexora2026securekey"

  echo "7. Signing release APK with apksigner (v1 + v2 + v3 scheme)..."
  TARGET_APK="public/downloads/nexora-v${VERSION_NAME}.apk"
  LATEST_APK="public/downloads/nexora-release.apk"

  apksigner sign \
    --ks "$KEYSTORE" \
    --ks-pass "pass:$KEYSTORE_PASS" \
    --ks-key-alias nexora \
    --key-pass "pass:$KEYSTORE_PASS" \
    --out "$TARGET_APK" \
    android/build/bin/nexora-aligned.apk

  cp "$TARGET_APK" "$LATEST_APK"
  apksigner verify --verbose "$TARGET_APK"

  APK_SIZE=$(ls -lh "$TARGET_APK" | awk '{print $5}')
  APK_SHA256=$(sha256sum "$TARGET_APK" | awk '{print $1}')
  RELEASE_DATE=$(date -I)

  cat <<EOF > public/downloads/release-info.json
{
  "version": "${VERSION_NAME}",
  "versionCode": ${VERSION_CODE},
  "releaseDate": "${RELEASE_DATE}",
  "minSupportedVersion": "1.0.0",
  "apkUrl": "/downloads/nexora-release.apk",
  "versionedApkUrl": "/downloads/nexora-v${VERSION_NAME}.apk",
  "apkSize": "$APK_SIZE",
  "sha256": "$APK_SHA256",
  "packageName": "com.theabhinavschool.nexora",
  "appName": "NEXORA",
  "releaseNotes": "${RELEASE_NOTES}",
  "platform": "android"
}
EOF
  cp public/downloads/release-info.json android/assets/www/downloads/release-info.json 2>/dev/null || true
else
  echo "1. Packaging, 4-byte aligning, and signing APK (v1 + v2 + v3 RSA-2048) via scripts/package-and-sign-apk.mjs..."
  node scripts/package-and-sign-apk.mjs "${VERSION_NAME}" "${VERSION_CODE}" "${RELEASE_NOTES}"
fi

