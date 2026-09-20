#!/bin/sh
# 重新打包 AI Relay Usage.scripting
# 用法（在仓库根目录执行）：sh source/build.sh
set -e
BASE="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$BASE" <<'EOF'
import os, sys, zipfile
base = sys.argv[1]
src = os.path.join(base, "source")
out_dir = os.path.join(base, "dist")
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, "AI Relay Usage.scripting")

files = []
for root, dirs, names in os.walk(src):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for n in sorted(names):
        if n.startswith(".") or n == "build.sh":
            continue
        full = os.path.join(root, n)
        files.append((full, os.path.relpath(full, src)))

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for full, rel in files:
        z.write(full, rel)

print("已生成:", out)
print("条目数:", len(files))
with zipfile.ZipFile(out) as z:
    bad = z.testzip()
    print("完整性:", "OK" if bad is None else f"损坏 {bad}")
EOF
