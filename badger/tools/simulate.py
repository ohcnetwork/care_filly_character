"""Run a badge app without a window in the Universe 2025 badge simulator.

The harness drives the app loop itself with a virtual clock, posts button
events from a script, saves screenshots at set times, and writes a contact
sheet. It exits with code 1 when the app raises an exception.

Usage:

    python badger/tools/simulate.py filly-mascot --home <badger/home clone> \\
        --seconds 8 --keys "a@1,b@3,up@5" --shots 0.5,2,4,6 --out /tmp/sim

Arguments:
    app         Name of a directory in badger/apps/.
    --home      Path to a clone of https://github.com/badger/home (for
                badge25/simulator/badge_simulator.py and the fonts). Defaults
                to the BADGER_HOME environment variable.
    --seconds   How long to run, in simulated seconds (default 6).
    --fps       Simulated frame rate (default 30).
    --keys      Button script. Items are "<button>@<press>" or
                "<button>@<press>-<release>" in seconds. Buttons: a, b, c, up,
                down, left, right, home. A press without a release lasts 1 frame.
    --shots     Screenshot times in seconds, comma separated.
    --out       Output directory for screenshots and sheet.png.
    --state     JSON file to load as the saved State of the app before start
                (for apps that use badgeware.State). The file name given to
                State.load must equal the app name.

Requirements: Python 3.13 and pygame 2.6 (pygame does not import on 3.14).
The system root that maps to /system is a temporary directory with links to
badger/apps, badger/filly and the simulator fonts.
"""

import argparse
import importlib.util
import os
import shutil
import sys
import tempfile
import traceback

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BADGER = os.path.join(REPO, "badger")

KEYS = {
    "a": "K_a",
    "b": "K_b",
    "c": "K_c",
    "up": "K_UP",
    "down": "K_DOWN",
    "left": "K_LEFT",
    "right": "K_RIGHT",
    "home": "K_h",
}


def parse_keys(script, fps):
    """Return {frame: [(is_press, pygame key name), ...]} from the button script."""
    schedule = {}
    for item in filter(None, (s.strip() for s in script.split(","))):
        name, _, when = item.partition("@")
        if name not in KEYS or not when:
            raise SystemExit("bad key item: {!r}".format(item))
        start, _, end = when.partition("-")
        press = round(float(start) * fps)
        release = round(float(end) * fps) if end else press + 1
        release = max(release, press + 1)
        schedule.setdefault(press, []).append((True, KEYS[name]))
        schedule.setdefault(release, []).append((False, KEYS[name]))
    return schedule


def make_root(home):
    """Build a temporary /system root: apps and filly from the repo, fonts from badger/home."""
    root = tempfile.mkdtemp(prefix="filly-sim-")
    os.symlink(os.path.join(BADGER, "apps"), os.path.join(root, "apps"))
    os.symlink(os.path.join(BADGER, "filly"), os.path.join(root, "filly"))
    os.mkdir(os.path.join(root, "assets"))
    os.symlink(os.path.join(home, "badge25", "assets", "fonts"), os.path.join(root, "assets", "fonts"))
    return root


def load_simulator(home):
    path = os.path.join(home, "badge25", "simulator", "badge_simulator.py")
    if not os.path.isfile(path):
        raise SystemExit("simulator not found: {}".format(path))
    spec = importlib.util.spec_from_file_location("badge_simulator", path)
    sim = importlib.util.module_from_spec(spec)
    sys.modules["badge_simulator"] = sim
    spec.loader.exec_module(sim)
    return sim


def save_sheet(pygame, shots, path):
    """Write the screenshots as one grid image at 2x."""
    if not shots:
        return
    columns = min(4, len(shots))
    rows = (len(shots) + columns - 1) // columns
    gap = 4
    w, h = 160, 120
    sheet = pygame.Surface((columns * (w + gap) + gap, rows * (h + gap) + gap))
    sheet.fill((40, 40, 40))
    for i, surface in enumerate(shots):
        x = gap + (i % columns) * (w + gap)
        y = gap + (i // columns) * (h + gap)
        sheet.blit(surface, (x, y))
    pygame.image.save(pygame.transform.scale(sheet, (sheet.get_width() * 2, sheet.get_height() * 2)), path)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("app")
    parser.add_argument("--home", default=os.environ.get("BADGER_HOME"))
    parser.add_argument("--seconds", type=float, default=6)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--keys", default="")
    parser.add_argument("--shots", default="")
    parser.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "filly-sim-out"))
    parser.add_argument("--state")
    args = parser.parse_args()
    if not args.home:
        raise SystemExit("set --home or BADGER_HOME to a clone of https://github.com/badger/home")

    app_dir = os.path.join(BADGER, "apps", args.app)
    if not os.path.isfile(os.path.join(app_dir, "__init__.py")):
        raise SystemExit("no app at {}".format(app_dir))

    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
    import pygame

    sim = load_simulator(args.home)
    root = make_root(args.home)
    os.makedirs(args.out, exist_ok=True)
    if args.state:
        state_dir = os.path.join(root, ".badge_state")
        os.makedirs(state_dir, exist_ok=True)
        shutil.copy(args.state, os.path.join(state_dir, "{}.json".format(args.app)))

    # Virtual clock: io.ticks advances by one frame each loop, so runs are fast and repeatable.
    clock = {"ms": 0}
    pygame.time.get_ticks = lambda: clock["ms"]

    pygame.init()
    sim.SIM_ROOT = root
    sim._perf_monitor = None
    sim.screen = sim.Screen(scale=1)
    sim.io = sim.IO()

    # The simulator draws shapes with pygame.draw, which does not blend alpha.
    # The badge does. Draw a translucent brush through a layer with alpha.
    real_draw = sim.Screen.draw

    def blended_draw(self, shape):
        color = self._norm_color(self.brush)
        if len(color) < 4 or color[3] >= 255:
            return real_draw(self, shape)
        layer = pygame.Surface(self._surface.get_size(), pygame.SRCALPHA)
        sim._render_shape(layer, color, shape)
        self._surface.blit(layer, (0, 0))

    sim.Screen.draw = blended_draw

    # Count frame decodes: the badge decodes a PNG on every Image.load.
    loads = {"count": 0, "largest": (0, 0)}
    real_load = sim.Image.load

    def counted_load(path):
        loads["count"] += 1
        image = real_load(path)
        if image.width * image.height > loads["largest"][0] * loads["largest"][1]:
            loads["largest"] = (image.width, image.height)
        return image

    sim.Image.load = staticmethod(counted_load)
    sim.Image._cache.clear()

    schedule = parse_keys(args.keys, args.fps)
    shot_times = sorted(float(s) for s in filter(None, (s.strip() for s in args.shots.split(","))))
    shots = []
    step = 1000 // args.fps
    total_frames = int(args.seconds * args.fps)
    frames_done = 0
    module = None
    try:
        module = sim.load_game_module(os.path.join(root, "apps", args.app, "__init__.py"))
        init = getattr(module, "init", None)
        if callable(init):
            init()
        for frame in range(total_frames):
            for is_press, key in schedule.get(frame, ()):
                kind = pygame.KEYDOWN if is_press else pygame.KEYUP
                pygame.event.post(pygame.event.Event(kind, key=getattr(pygame, key)))
            sim.io.update()
            module.update()
            sim.screen.present()
            frames_done = frame + 1
            now = frame / args.fps
            while shot_times and shot_times[0] <= now:
                t = shot_times.pop(0)
                surface = sim.screen._surface.copy()
                shots.append(surface)
                pygame.image.save(surface, os.path.join(args.out, "shot-{:05.2f}s.png".format(t)))
            clock["ms"] += step
    except Exception:
        traceback.print_exc()
        print("FAIL: {} raised after {} frames".format(args.app, frames_done))
        return 1
    finally:
        on_exit = getattr(module, "on_exit", None) if module else None
        if callable(on_exit):
            on_exit()
        save_sheet(pygame, shots, os.path.join(args.out, "sheet.png"))
        shutil.rmtree(root, ignore_errors=True)
        pygame.quit()

    print(
        "OK: {} ran {} frames ({:.1f} s at {} fps); {} Image.load calls, largest {}x{}; {} screenshots in {}".format(
            args.app,
            total_frames,
            args.seconds,
            args.fps,
            loads["count"],
            loads["largest"][0],
            loads["largest"][1],
            len(shots),
            args.out,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
