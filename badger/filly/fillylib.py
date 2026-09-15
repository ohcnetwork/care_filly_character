"""Shared code for the Filly badge apps (GitHub Universe 2025 badge, badgeware API).

The apps filly-mascot, filly-pulse and filly-pet import this module. It gives:

- the CARE palette as badgeware brushes (colours follow src/core/palette.ts),
- the frame manifest (/system/filly/assets/manifest.json),
- Clip: the frames of one state, one frame in RAM at a time,
- Filly: the character at a feet anchor, with a contact shadow,
- text helpers.

Frames: `npm run export:badger` in https://github.com/ohcnetwork/care_filly_character
writes one paletted PNG per animation frame to /system/filly/assets/<state>/NN.png.
The badge heap is about 240 kB and fragmented, so a sprite sheet does not fit.
Each app decodes only the frame on screen, like the MonaOS startup animation.

Anchor: the manifest gives each state a frame size (w, h) and an offset
(ox, oy) from the anchor. The anchor is the feet point: the bottom centre of
the idle body. Blit a frame at (anchor_x + ox, anchor_y + oy) and the feet stay
on the same pixel in every state. `EXTENT` gives the farthest reach from the
anchor over all states, for layout.

Import from an app (the app must set its own cwd first):

    sys.path.insert(0, os.getcwd().rsplit("/apps/", 1)[0] + "/filly")
    import fillylib

That line finds /system/filly on the badge and the mapped directory in the
simulator, where /system is another directory.
"""

import json
from badgeware import screen, brushes, shapes, Image

ASSETS = "/system/filly/assets"

STATE_NAMES = ("idle", "listening", "talking", "happy", "thinking", "surprised", "sleepy")

with open(ASSETS + "/manifest.json") as _f:
    MANIFEST = json.load(_f)

STATES = MANIFEST["states"]
# Size of the idle body (px). The anchor is its bottom centre.
BODY = MANIFEST["body"]
# Farthest reach from the anchor over all states (px): left, right, up, down.
EXTENT = MANIFEST["extent"]

# ── palette (src/core/palette.ts) ─────────────────────────────────────────────

BODY_MINT = (217, 239, 195)
PLATE_GREEN = (35, 122, 67)
PLATE_SHADOW = (32, 88, 49)
TILE_GREEN = (111, 171, 114)
LIMB_GREEN = (52, 141, 77)
EYE_INK = (18, 59, 40)
ACCENT = (90, 157, 88)
ACCENT_SOFT = (169, 203, 141)
HIGHLIGHT = (251, 249, 233)
BACKGROUND = (250, 249, 246)
BLUSH = (239, 183, 149)
TONGUE = (236, 152, 115)


def color(rgb, alpha=255):
    """A brush from an (r, g, b) tuple."""
    return brushes.color(rgb[0], rgb[1], rgb[2], alpha)


WALL = color(BODY_MINT)
FLOOR = color(PLATE_GREEN)
FLOOR_EDGE = color(PLATE_SHADOW)
SHADOW = brushes.color(0, 0, 0, 40)
INK = color(EYE_INK)
INK_SOFT = color(EYE_INK, 150)
PAPER = color(BACKGROUND)
PAPER_SOFT = color(BACKGROUND, 170)
PILL = color(ACCENT_SOFT)
GREEN = color(ACCENT)
WARM = color(TONGUE)


# ── frames ────────────────────────────────────────────────────────────────────


class Clip:
    """The frames of one state. Only the frame on screen is in RAM."""

    def __init__(self, name):
        info = STATES[name]
        self.name = name
        self.dir = info["dir"]
        self.fps = info["fps"]
        self.frames = info["frames"]
        self.loop_start = info["loop_start"]
        self.w = info["w"]
        self.h = info["h"]
        self.ox = info["ox"]
        self.oy = info["oy"]
        self.index = -1
        self.image = None

    def frame_index(self, seconds):
        """Frame index at `seconds` after the clip started: lead-in once, then the loop."""
        i = int(seconds * self.fps)
        if i >= self.frames:
            i = self.loop_start + (i - self.loop_start) % (self.frames - self.loop_start)
        return i

    def frame(self, seconds):
        """The Image at `seconds`. Decodes a PNG only when the index changes."""
        i = self.frame_index(seconds)
        if i != self.index:
            self.image = None  # free the old frame before the next decode
            self.image = Image.load("{}/{}/{:02d}.png".format(ASSETS, self.dir, i))
            self.index = i
        return self.image

    def draw(self, seconds, anchor_x, anchor_y):
        screen.blit(self.frame(seconds), anchor_x + self.ox, anchor_y + self.oy)


class Filly:
    """Filly at a feet anchor. `x` is the body centre, `y` is the floor line.

    set_state() changes the clip and restarts its clock. elapsed() is the time
    in the current state, in seconds. draw() blits the frame and, when
    `shadow` is true, a contact shadow on the floor line. Pass io.ticks (ms)
    to set_state() and draw() so the character runs on the badge clock.
    """

    def __init__(self, x, y, ticks, state="idle"):
        self.x = x
        self.y = y
        self.state = state
        self.clip = Clip(state)
        self.since = ticks

    def set_state(self, name, ticks):
        if name == self.state:
            return
        self.state = name
        self.clip = Clip(name)
        self.since = ticks

    def elapsed(self, ticks):
        return (ticks - self.since) / 1000

    def draw(self, ticks, shadow=True):
        if shadow:
            w = BODY["w"] * 0.6
            screen.brush = SHADOW
            screen.draw(shapes.rounded_rectangle(self.x - w / 2, self.y - 2, w, 5, 2))
        self.clip.draw(self.elapsed(ticks), self.x, self.y)


# ── text ──────────────────────────────────────────────────────────────────────


def center_text(text, y, sx=0, ex=160):
    """Draw `text` centred between x = sx and x = ex, with the current brush."""
    w, _ = screen.measure_text(text)
    screen.text(text, sx + (ex - sx) / 2 - w / 2, y)


def pill(text, cx, y, fill=PILL, ink=INK, pad=5):
    """A rounded label centred on `cx`. Returns its width."""
    w, h = screen.measure_text(text)
    screen.brush = fill
    screen.draw(shapes.rounded_rectangle(cx - w / 2 - pad, y, w + 2 * pad, h + 4, 4))
    screen.brush = ink
    screen.text(text, cx - w / 2, y + 2)
    return w + 2 * pad
