#!/usr/bin/env python3
"""Small, dependency-free guardrail for Mumi公众号正文片段."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

FORBIDDEN_TAGS = {"style", "script", "div", "link"}
FORBIDDEN_ATTRS = {"class", "id"}


class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.errors = []
        self.warnings = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        self.stack.append(tag)
        if tag in FORBIDDEN_TAGS:
            self.errors.append(f"forbidden tag: <{tag}>")
        for key, value in attrs:
            if key.lower() in FORBIDDEN_ATTRS:
                self.errors.append(f"forbidden attribute: {key}")
            if key.lower() == "style" and value:
                if re.search(r"position\s*:\s*(fixed|absolute|sticky)|display\s*:\s*grid|@media|@keyframes", value, re.I):
                    self.errors.append("forbidden style rule")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.stack:
            self.stack.pop()

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.stack:
            self.stack.pop()

    def handle_data(self, data):
        if any(tag in {"code", "pre"} for tag in self.stack):
            return
        if re.search(r"(?<![A-Za-z0-9_])[,.!?;:](?![A-Za-z0-9_])", data):
            self.warnings.append("ASCII punctuation found in visible prose")


def main():
    if len(sys.argv) != 2:
        print("usage: validate_mumi_gzh.py FILE.html")
        return 2
    path = Path(sys.argv[1])
    html = path.read_text(encoding="utf-8")
    check = Checker()
    check.feed(html)
    if not re.search(r'<span\s+leaf\s*=', html, re.I):
        check.errors.append("no <span leaf=...> text wrappers found")
    if "<html" in html.lower() or "<body" in html.lower():
        check.warnings.append("output should be a clean section fragment")
    for item in check.errors:
        print(f"ERROR: {item}")
    for item in check.warnings:
        print(f"WARNING: {item}")
    if check.errors or check.warnings:
        return 1
    print("Mumi公众号 HTML: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
