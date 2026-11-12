#!/usr/bin/env bash
# Пересобирает APK из готового базового APK (манифест и ресурсы),
# подменяя код оболочки (MainActivity.java) и веб-файлы из репозитория.
# Использование: ANDROID_HOME=... android/build-apk.sh base.apk out.apk keystore.jks
set -euo pipefail
BASE=$1 OUT=$2 KEYSTORE=$3
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
JAR=$(ls "$ANDROID_HOME"/platforms/*/android.jar | sort -V | tail -1)
WORK=$(mktemp -d)
mkdir -p "$WORK/classes" "$WORK/dex" "$WORK/apk"
javac -encoding UTF-8 --release 8 -classpath "$JAR" -d "$WORK/classes" "$ROOT/android/MainActivity.java" 2>&1 | grep -v 'warning: \[options\]' || true
"$BT/d8" --release --min-api 33 --lib "$JAR" --output "$WORK/dex" $(find "$WORK/classes" -name '*.class')
(cd "$WORK/apk" && unzip -q "$BASE" && rm -rf META-INF)
cp "$WORK/dex/classes.dex" "$WORK/apk/classes.dex"
for f in index.html calendar.js comfort.js offline-core.js permissions.js voice.js sw.js manifest.json; do cp "$ROOT/$f" "$WORK/apk/assets/$f"; done
# resources.arsc должен храниться без сжатия (targetSdk 30+).
(cd "$WORK/apk" && rm -f "$WORK/u.apk" && zip -q -0 "$WORK/u.apk" resources.arsc && zip -q -r -9 "$WORK/u.apk" . -x resources.arsc)
"$BT/zipalign" -f -p 4 "$WORK/u.apk" "$WORK/a.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:${KS_PASS:-android}" --out "$OUT" "$WORK/a.apk"
"$BT/apksigner" verify "$OUT"
rm -rf "$WORK"
echo "OK: $OUT"
