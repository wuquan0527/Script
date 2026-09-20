#!/bin/sh
# 重新打包 AI Relay Usage.scripting（使用 python3 zipfile，环境无 zip 命令）
# 用法: sh /var/minis/workspace/ai-usage/build.sh
set -e
BASE=/var/minis/workspace/ai-usage
python3 - "$BASE" <<'EOF'
import os, sys, zipfile
base = sys.argv[1]
src = os.path.join(base, "relay")
out_dir = os.path.join(base, "dist")
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, "AI Relay Usage.scripting")

files = []
for root, dirs, names in os.walk(src):
    dirs[:] = [d for d in dirs if not d.startswith(".")]
    for n in sorted(names):
        if n.startswith("."):
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
