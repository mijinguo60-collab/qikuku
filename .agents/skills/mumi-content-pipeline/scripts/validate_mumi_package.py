#!/usr/bin/env python3
"""Validate the portable Mumi skill package without network access."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = [
    "mumi-content-pipeline/SKILL.md",
    "mumi-topic-research/SKILL.md",
    "mumi-writer/SKILL.md",
    "mumi-copy-review/SKILL.md",
    "mumi-penguin-visuals/SKILL.md",
    "mumi-penguin-visuals/references/penguin-ip.md",
    "mumi-gzh-design/SKILL.md",
    "mumi-gzh-design/scripts/validate_mumi_gzh.py",
    "mumi-voice-video/references/audio-video-stack.md",
    "assets/penguin/penguin-stack-base.jpg",
    "assets/penguin/penguin-stack-yellow-coat.jpg",
]

errors = []
for rel in REQUIRED:
    if not (ROOT / rel).exists():
        errors.append(f"missing: {rel}")

for path in ROOT.glob("mumi-*/SKILL.md"):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n") or "\nname:" not in text or "\ndescription:" not in text:
        errors.append(f"invalid frontmatter: {path.relative_to(ROOT)}")
    if "TODO" in text or "PLACEHOLDER" in text:
        errors.append(f"unfinished placeholder: {path.relative_to(ROOT)}")

if errors:
    print("Mumi package validation: FAIL")
    print("\n".join(errors))
    sys.exit(1)

print(f"Mumi package validation: PASS ({len(REQUIRED)} required paths)")
