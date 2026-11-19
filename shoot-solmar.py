#!/usr/bin/env python3
"""Play-test Solmar Bay in headless Chromium and capture its 4 screenshots.

Reads shots.json, opens each ?shot= scene at 1280x720, forces the module to
evaluate with a dynamic import (chrome-headless-shell does not always run a
static module script on its own), waits for window.__solmarReady, then
screenshots it as JPEG into screenshots/. Prints each scene's snapshot state
and any page errors, so a bad scene is visible before submitting.
"""
import json
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent

from patchright.sync_api import sync_playwright  # noqa: E402

# patchright 1.64 wants a newer shell than the cache has; the cached
# headless shell (1228) is the one v1's scripts ran against.
CHROME_HEADLESS_SHELL = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"
)


def main() -> int:
    shots = json.loads((REPO / "shots.json").read_text())
    (REPO / "screenshots").mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME_HEADLESS_SHELL)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.set_default_timeout(120000)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        for shot in shots:
            started = time.time()
            page.goto(f"http://localhost:8080/{shot['query']}", wait_until="load", timeout=120000)
            import_result = page.evaluate(
                "import('/src/main.js').then(() => 'ok').catch(e => 'FAIL: ' + e.message)"
            )
            if import_result != "ok":
                print(f"{shot['name']}: module import failed: {import_result}")
                continue
            try:
                page.wait_for_function("window.__solmarReady === true", timeout=120000)
            except Exception as exc:
                print(f"{shot['name']}: READY TIMEOUT after {time.time() - started:.1f}s: {exc}")
                continue
            page.wait_for_timeout(900)
            state = page.evaluate("() => window.__solmar.snapshot()")
            print(f"{shot['name']}: {json.dumps(state)} ({time.time() - started:.1f}s)")
            page.screenshot(path=str(REPO / "screenshots" / shot["name"]), type="jpeg", quality=85)
            size = (REPO / "screenshots" / shot["name"]).stat().st_size
            flag = "OK" if size <= 262144 else "OVER 256 KiB!"
            print(f"  {shot.get('caption', '')} — {size} bytes [{flag}]")
        print("PAGE ERRORS:", errors if errors else "none")
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
