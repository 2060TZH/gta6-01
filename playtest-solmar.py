#!/usr/bin/env python3
"""Interactive play-test of Solmar Bay: new game, walk, steal a car, drive,
finish mission 1, gain wanted, get wasted, respawn, save and continue.

v2 adds: full save/load round-trip (ammo, reserve, wanted, mission stage,
mission collected, packages, taxi, car), New Game reset, M mute, punch-air
does not add wanted, empty-reserve reload, package reachability, traffic
never on the sea road, foot-cop collision, and the taxi-beacon restore.

Headless Chromium renders slowly in software GL, so game time is advanced
deterministically by calling the game's own step() from the page instead of
relying on wall-clock waits.
"""
import json
import os
from pathlib import Path

from patchright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent
BASE = "http://localhost:8080/"
# patchright 1.64 wants a newer shell than the cache has; the cached
# headless shell (1228) is the one v1's scripts ran against.
CHROME_HEADLESS_SHELL = os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell"
)


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


def fresh_page(p):
    browser = p.chromium.launch(executable_path=CHROME_HEADLESS_SHELL)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.set_default_timeout(60000)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="load")
    page.evaluate("import('/src/main.js').then(() => 'ok')")
    page.wait_for_timeout(800)
    return browser, page, errors


def reload_page(page):
    page.reload(wait_until="load")
    page.evaluate("import('/src/main.js').then(() => 'ok')")
    page.wait_for_timeout(800)


def main() -> int:
    errors = []
    with sync_playwright() as p:
        browser, page, errors = fresh_page(p)
        print("title screen:", page.evaluate("() => document.getElementById('screen-title').classList.contains('show')"))
        print("continue disabled with no save:",
              page.evaluate("() => document.getElementById('btn-continue').disabled"))
        assert page.evaluate("() => document.getElementById('btn-continue').disabled"), \
            "continue should be disabled with no save"
        page.click("#btn-new")
        page.wait_for_timeout(500)
        s0 = snap(page)
        print("after new game:", json.dumps(s0))
        assert s0["screen"] == "playing", "not playing after New Game"

        # --- packages are all reachable: outside buildings, out of the sea
        bad = page.evaluate("""() => {
          const g = window.__solmar;
          const bad = [];
          g.missions.packages.forEach((pkg, i) => {
            if (pkg.z > 294) bad.push([i, 'sea', pkg.x, pkg.z]);
            for (const c of g.city.colliders) {
              if (pkg.x > c.minX - 2 && pkg.x < c.maxX + 2 && pkg.z > c.minZ - 2 && pkg.z < c.maxZ + 2) {
                bad.push([i, 'building', pkg.x, pkg.z]);
              }
            }
          });
          return bad;
        }""")
        print("unreachable packages:", bad if bad else "none")
        assert not bad, f"unreachable packages: {bad}"

        # --- M mute exists now (HUD promises it)
        press(page, "KeyM")
        assert snap(page)["muted"] is True, "M did not mute"
        press(page, "KeyM")
        assert snap(page)["muted"] is False, "M did not unmute"

        # --- punching thin air must not add wanted
        press(page, "KeyF")
        assert snap(page)["wanted"] == 0, "punching air added wanted"

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

        # Peak speed over the drive, not the final frame: a traffic car
        # ahead can briefly slow the player even when the car accelerates.
        peak = 0
        page.keyboard.down("KeyW")
        for _ in range(6):
            step_n(page, 30)
            peak = max(peak, snap(page)["speed"])
        page.keyboard.up("KeyW")
        s3 = snap(page)
        print("after driving W 3s:", json.dumps(s3), "peak speed:", peak)
        assert peak > 100, "car did not accelerate"
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

        # --- mission 4 checkpoint save: collect shop 1, save mid-mission
        page.evaluate("""() => {
          const g = window.__solmar;
          // mission 2 is timed; jump straight to mission 4 for the checkpoint test
          g.missions.startMission(3, g.world);
          g.player.x = 168; g.player.z = -152;
          if (g.player.inCar) { g.player.inCar = null; g.player.mesh.visible = true; }
        }""")
        step_n(page, 30)
        s4b = snap(page)
        print("after shop 1:", json.dumps(s4b))
        assert s4b["missionIndex"] == 3 and s4b["missionCollected"] == 1, \
            "mission 4 first shop did not register"

        page.evaluate("() => window.__solmar.police.addWanted(2)")
        step_n(page, 90)
        s5 = snap(page)
        print("wanted 2:", json.dumps(s5))
        assert s5["wanted"] == 2 and s5["cops"] >= 2, "police did not respond"

        # --- traffic never drives on the sea road after 30s of traffic.
        #     (Drop the wanted level first: foot cops would otherwise beat
        #     the idle player down during the soak and trigger a respawn.)
        page.evaluate("() => window.__solmar.police.setWanted(0)")
        step_n(page, 1800)
        sea_cars = page.evaluate("""() => {
          const g = window.__solmar;
          return g.traffic.cars.filter((c) => c.z > 296 || Math.abs(c.x) > 314 || Math.abs(c.z) > 314).length;
        }""")
        print("traffic cars out of bounds / in the sea:", sea_cars)
        assert sea_cars == 0, "traffic drove into the sea or off the map"

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

        # --- empty reserve must not start a reload loop
        page.evaluate("""() => {
          const g = window.__solmar;
          g.state.ammo = 0; g.state.reserve = 0;
        }""")
        page.mouse.down()
        step_n(page, 30)
        page.mouse.up()
        assert snap(page)["ammo"] == 0, "empty gun reloaded from nothing"

        # --- full save round-trip: ammo, reserve, wanted, mission stage,
        #     collected, packages, money, health, position
        pkgs_before = snap(page)["packagesCollected"]
        page.evaluate("""() => {
          const g = window.__solmar;
          g.state.ammo = 5; g.state.reserve = 20;
          g.state.money = 1234; g.state.health = 77;
          g.police.setWanted(2);
          const pkg = g.missions.packages.find((pk) => !pk.taken);
          g.player.x = pkg.x; g.player.z = pkg.z;
        }""")
        step_n(page, 5)
        before = snap(page)
        print("before save:", json.dumps(before))
        assert before["packagesCollected"] == pkgs_before + 1, "package pickup did not register"
        # The package paid +$100 on pickup; reset money after it so the
        # round-trip assert checks exactly what was saved.
        page.evaluate("() => { window.__solmar.state.money = 1234; }")
        page.evaluate("() => window.__solmar.saveGame()")
        saved = page.evaluate("() => !!window.localStorage.getItem('solmar-bay.save.v1')")
        print("save written:", saved)
        assert saved, "no save in localStorage"
        reload_page(page)
        cont_enabled = page.evaluate("() => !document.getElementById('btn-continue').disabled")
        print("continue enabled after reload:", cont_enabled)
        assert cont_enabled, "continue not enabled"
        page.click("#btn-continue")
        page.wait_for_timeout(500)
        s7 = snap(page)
        print("after continue:", json.dumps(s7))
        assert s7["missionIndex"] == 3, f"save did not restore mission index ({s7['missionIndex']})"
        assert s7["missionCollected"] == 1, "save did not restore mission checkpoints"
        assert s7["packagesCollected"] == pkgs_before + 1, "save did not restore packages"
        assert s7["ammo"] == 5 and s7["reserve"] == 20, \
            f"save did not restore ammo ({s7['ammo']}/{s7['reserve']})"
        assert s7["money"] == 1234 and s7["health"] == 77, "save did not restore money/health"
        assert s7["wanted"] == 2, f"save did not restore wanted ({s7['wanted']})"

        # --- WASTED / respawn: money -300, health full, mission restarts,
        #     and the respawn itself is saved
        page.evaluate("() => window.__solmar.world.damagePlayer(500)")
        step_n(page, 5)
        print("after lethal damage:", json.dumps(snap(page)))
        assert snap(page)["screen"] == "end", "no wasted screen"
        step_n(page, 200)
        s6 = snap(page)
        print("after respawn:", json.dumps(s6))
        assert s6["screen"] == "playing" and s6["health"] == 100, "did not respawn"
        assert s6["money"] == 934, f"respawn did not dock $300 ({s6['money']})"
        assert s6["missionIndex"] == 3, "respawn did not restart the current mission"
        assert s6["missionCollected"] == 0, "respawn did not restart mission checkpoints"

        # --- taxi: enter a taxi, save in it, reload, still in the taxi
        #     with the fare beacon up
        page.evaluate("""() => {
          const g = window.__solmar;
          const taxi = g.traffic.cars.find((c) => c.taxi && !c.stolen);
          // Park the taxi on the z=160 road, stopped, so the E press finds it:
          // traffic positions are recomputed from axis/line/along each frame,
          // so raw x/z would not stick.
          taxi.axis = 'x'; taxi.line = 160; taxi.along = 0; taxi.dir = 1;
          taxi.speed = 0; taxi.baseSpeed = 0; taxi.turnCd = 5;
          for (const pc of g.parkedCars) { pc.x = -300; pc.z = -300; pc.mesh.position.set(-300, 0, -300); }
          g.player.x = 0; g.player.z = 158;
        }""")
        press(page, "KeyE")
        assert snap(page)["inCar"] and snap(page)["taxi"], "did not enter taxi / no fare"
        page.evaluate("() => window.__solmar.saveGame()")
        reload_page(page)
        page.click("#btn-continue")
        page.wait_for_timeout(500)
        s8 = snap(page)
        print("after continue in taxi:", json.dumps(s8))
        assert s8["inCar"] and s8["taxi"], "save did not restore taxi + car"
        # exit the taxi: the fare clears and the mission beacon comes back
        press(page, "KeyE")
        assert not snap(page)["taxi"], "exiting the taxi left a stale fare"

        # --- New Game from pause resets everything v1 leaked
        press(page, "Escape")
        assert snap(page)["screen"] == "paused", "escape did not pause"
        dbg = page.evaluate("""() => {
          const btn = document.getElementById('btn-restart');
          const r = btn.getBoundingClientRect();
          const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
          return {rect: [r.x, r.y, r.width, r.height],
            stack: document.elementsFromPoint(cx, cy).map((el) => (el.id || el.className || el.tagName) + ':' + getComputedStyle(el).pointerEvents),
            screens: ['screen-title', 'screen-pause', 'screen-end'].map((id) => id + '=' + document.getElementById(id).className)};
        }""")
        print("restart click debug:", json.dumps(dbg))
        # Plain click on purpose: this is the regression test for the
        # pointer-lock bug — pausing must release the mouse, or this button
        # is dead (headless Chrome kept the lock; the game releases it now).
        page.click("#btn-restart")
        page.wait_for_timeout(500)
        s9 = snap(page)
        print("after restart from pause:", json.dumps(s9))
        assert s9["screen"] == "playing", "restart did not resume"
        assert s9["missionIndex"] == 0 and s9["money"] == 500, "new game did not reset story/money"
        assert s9["ammo"] == 12 and s9["reserve"] == 48, "new game did not reset ammo"
        assert s9["packagesCollected"] == 0 and s9["wanted"] == 0, "new game did not reset packages/wanted"
        assert not s9["inCar"], "new game left the player in a car"

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
