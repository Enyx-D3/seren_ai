#!/bin/zsh
# CP001 acquisition: download all required Drive parts and auxiliary artifacts.
# Original Drive pieces are treated as immutable; downloads go to copies only.
set -u
cd "$(dirname "$0")"/../parts

# name|driveId  (IDs captured from the public folder listing 2026-10-26)
ITEMS=(
"Falcon-H1-Tiny-90M-Instruct.zip.part000|19tDXfJgjI6wtljUCByhkFqDWuiXLjjdv"
"Falcon-H1-Tiny-90M-Instruct.zip.part001|1O-eq1_TB4Q4q4Pa-6KJVj_PbpD1xchg2"
"Falcon-H1-Tiny-R-90M.zip.part000|1ufK5ssMAX_1W2Fc_c_Gq4ZgUg_5CCkr_"
"Falcon-H1-Tiny-R-90M.zip.part001|1By_3mVyoQ3MpBI0mACZ6bpV-RecW379q"
"Falcon-H1-Tiny-Coder-90M.zip.part000|1wwozDOBluJta4ave_OB9SMHi6Lh4P265"
"Falcon-H1-Tiny-Coder-90M.zip.part001|1kO28gSG3GRJPlHKyGWDmUvdPGYNaNcc9"
"Falcon-H1-Tiny-Tool-Calling-90M.zip.part000|1qaavJjwxiMrD9asakYcWMm2Gh5faDaEs"
"Falcon-H1-Tiny-Tool-Calling-90M.zip.part001|1V-2y_6ebqcn0tuBhP5GdWFRMW-amUBGG"
"Falcon-H1-Tiny-90M-Instruct-Q4_K_M.gguf|14eWEg9rni_4cMX8QMnZBlpWV6D5QPW66"
"Falcon-H1-Tiny-Coder-Q4_K_M.gguf|1mKBcqix1JilIk4L88-1gEVbtBq5QCU7W"
"Falcon-H1-Tiny-Tool-Calling-Q4_K_M.gguf|1yP1Fm2yWwo3SWxNcK_Ob4F9udz8CtmdM"
"Falcon-H1R-Tiny-90M-Q4_K_M.gguf|1TW4hR4ngM_81xAPWLvB9-oQnuhuhZaqP"
"HF_SMALL_AI_MODEL_ZOO_MANIFEST_2026-09-06.md|1AepJbw3IE8Rm3FuUkgpXkWaB8Tz4c829"
"SMALL_AI_ZOO_REPAIR_AUDIT_RUN2.md|1siilqLp2SefGyklB2UWFHg66zioYzb2U"
)

for item in $ITEMS; do
  name="${item%%|*}"; id="${item##*|}"
  if [ -s "$name" ]; then echo "SKIP $name (exists)"; continue; fi
  echo "GET $name ($id)"
  curl -sL --fail --max-time 3600 \
    "https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t" -o "$name.tmp" \
    && mv "$name.tmp" "$name" \
    && echo "OK  $name $(wc -c < "$name") bytes" \
    || echo "FAIL $name"
done
echo "=== sha256 (parts + artifacts) ==="
shasum -a 256 Falcon-H1* HF_SMALL* SMALL* 2>/dev/null | tee SHA256SUMS_ACQUIRED.txt
echo "DONE_CP001_ACQUISITION"
