#!/usr/bin/env bash
# Stage A of TESTING.md: the API + real Drive half, no Chrome. Pretends to be the extension for a 5-byte "video".
# Usage: scripts/smoke.sh <api base> <EXTENSION_PASSWORD> <meet link of a class>
#   scripts/smoke.sh http://localhost:8080 "$PASSWORD" https://meet.google.com/abc-defg-hij
set -euo pipefail
api=${1:?api base}; pw=${2:?password}; meet=${3:?meet link}
auth=(-H "Authorization: Bearer $pw")
j() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "1. lessons the popup would show:"
curl -fsS "${auth[@]}" "$api/extension/sessions" -G --data-urlencode "meetUrl=$meet" | tee /dev/stderr | j "['suggestedId']" > /tmp/ext-suggested
sid=$(cat /tmp/ext-suggested); echo; echo "   suggested lesson: $sid"

echo "2. ask for an upload:"
now=$(python3 -c "import time;print(int(time.time()*1000))")
init=$(curl -fsS "${auth[@]}" -H 'Content-Type: application/json' "$api/extension/uploads" \
  -d "{\"meetUrl\":\"$meet\",\"sessionId\":\"$sid\",\"startedAt\":$now,\"size\":5,\"mimeType\":\"video/webm\"}")
echo "   $init"
url=$(echo "$init" | j "['uploadUrl']"); folder=$(echo "$init" | j "['folderId']")

echo "3. put 5 bytes straight to Drive:"
file=$(printf 'hello' | curl -fsS -X PUT -H 'Content-Range: bytes 0-4/5' --data-binary @- "$url" | j "['id']")
echo "   file id: $file"

echo "4. tell the API it is done:"
curl -fsS "${auth[@]}" -H 'Content-Type: application/json' "$api/extension/sessions/$sid/complete" \
  -d "{\"folderId\":\"$folder\",\"fileId\":\"$file\",\"durationSeconds\":60}"; echo
echo "OK. Now look in Drive for the folder https://drive.google.com/drive/folders/$folder and delete it."
