#!/usr/bin/env python3
"""Interactive play-test of Solmar Bay: new game, walk, steal a car, drive,
finish mission 1, gain wanted, get wasted, respawn, save and continue.

Headless Chromium renders slowly in software GL, so game time is advanced
deterministically by calling the game's own step() from the page instead of
relying on wall-clock waits.
"""
import json
from pathlib import Path

from patchright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent
BASE = "http://localhost:8080/"


def snap(page):
    return page.evaluate("() => window.__solmar.snapshot()")


def step_n(page, n):
    page.evaluate(f"() => {{ for (let i = 0; i < {n}; i++) window.__solmar.step(1 / 60); }}")


def press(page, key, steps=5):
    page.keyboard.down(key)
    step_n(page, steps)
    page.keyboard.up(key)


def hold(page, key, seconds):
    page.keyboard.down(key)
    step_n(page, int(seconds * 60))
    page.keyboard.up(key)


def main() -> int:
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.set_default_timeout(60000)
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until="load")
        page.evaluate("import('/src/main.js').then(() => 'ok')")
        page.wait_for_timeout(800)
        print("title screen:", page.evaluate("() => document.getElementById('screen-title').classList.contains('show')"))
        page.click("#btn-new")
        page.wait_for_timeout(500)
        s0 = snap(page)
        print("after new game:", json.dumps(s0))
        assert s0["screen"] == "playing", "not playing after New Game"

        hold(page, "KeyW", 2)
        s1 = snap(page)
        print("after walking W 2s:", json.dumps(s1))
        assert s1["playerZ"] < s0["playerZ"] - 8, "player did not move north"

        car = page.evaluate("""() => {
          const g = window.__solmar;
          const c = g.parkedCars[0];
          return { x: c.x, z: c.z };
        }""")
        page.evaluate(f"""() => {{
          const g = window.__solmar;
          g.player.x = {car['x'] + 2};
          g.player.z = {car['z']};
        }}""")
        press(page, "KeyE")
        s2 = snap(page)
        print("after E near parked car:", json.dumps(s2))
        assert s2["inCar"], "did not enter the car"

        hold(page, "KeyW", 3)
        s3 = snap(page)
        print("after driving W 3s:", json.dumps(s3))
        assert s3["speed"] > 100, "car did not accelerate"
        moved = abs(s3["playerX"] - s2["playerX"]) + abs(s3["playerZ"] - s2["playerZ"])
        assert moved > 40, "car did not move"

        press(page, "KeyE")
        assert not snap(page)["inCar"], "did not exit the car"
        page.evaluate("""() => {
          const g = window.__solmar;
          const c = g.parkedCars.find((c) => c.stolen) || g.parkedCars[0];
          g.player.x = c.x + 2; g.player.z = c.z;
        }""")
        press(page, "KeyE")
        assert snap(page)["inCar"], "did not re-enter the car"
        page.evaluate("""() => {
          const g = window.__solmar;
          const c = g.player.inCar;
          c.x = -236; c.z = -236; c.speed = 0;
          c.mesh.position.set(c.x, 0, c.z);
        }""")
        step_n(page, 60)
        s4 = snap(page)
        print("after reaching garage:", json.dumps(s4))
        assert s4["missionIndex"] == 1, "mission 1 did not complete"
        assert s4["money"] >= 750, "mission reward not paid"

        page.evaluate("() => window.__solmar.police.addWanted(2)")
        step_n(page, 90)
        s5 = snap(page)
        print("wanted 2:", json.dumps(s5))
        assert s5["wanted"] == 2 and s5["cops"] >= 2, "police did not respond"

        press(page, "KeyE")
        assert not snap(page)["inCar"], "did not exit before shooting"
        ammo_before = snap(page)["ammo"]
        page.mouse.move(640, 360)
        page.mouse.down()
        step_n(page, 10)
        page.mouse.up()
        ammo_after = snap(page)["ammo"]
        print(f"ammo {ammo_before} -> {ammo_after}")
        assert ammo_after < ammo_before, "shooting did not consume ammo"

        page.evaluate("() => window.__solmar.world.damagePlayer(500)")
        step_n(page, 5)
        print("after lethal damage:", json.dumps(snap(page)))
        assert snap(page)["screen"] == "end", "no wasted screen"
        step_n(page, 200)
        s6 = snap(page)
        print("after respawn:", json.dumps(s6))
        assert s6["screen"] == "playing" and s6["health"] == 100, "did not respawn"

        page.evaluate("() => window.__solmar.saveGame()")
        saved = page.evaluate("() => !!window.localStorage.getItem('solmar-bay.save.v1')")
        print("save written:", saved)
        assert saved, "no save in localStorage"
        page.reload(wait_until="load")
        page.evaluate("import('/src/main.js').then(() => 'ok')")
        page.wait_for_timeout(800)
        cont_enabled = page.evaluate("() => !document.getElementById('btn-continue').disabled")
        print("continue enabled after reload:", cont_enabled)
        assert cont_enabled, "continue not enabled"
        page.click("#btn-continue")
        page.wait_for_timeout(500)
        s7 = snap(page)
        print("after continue:", json.dumps(s7))
        assert s7["missionIndex"] == 1, "save did not restore mission progress"

        press(page, "Escape")
        assert snap(page)["screen"] == "paused", "escape did not pause"
        press(page, "Escape")
        assert snap(page)["screen"] == "playing", "escape did not resume"
        print("PAGE ERRORS:", errors if errors else "none")
        assert not errors, f"page errors: {errors}"
        browser.close()
    print("PLAYTEST ALL PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
