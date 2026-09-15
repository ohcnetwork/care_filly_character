import sys
import os

sys.path.insert(0, "/system/apps/filly")
os.chdir("/system/apps/filly")

import json
from badgeware import io, screen, run, brushes, shapes, Image, PixelFont

# Filly, the CARE mascot, as a badge pet (GitHub Universe 2025 badge, badgeware API).
#
# Buttons:
#   A     listen        UP    think
#   B     talk          DOWN  sleep / wake
#   C     happy
#
# A press of A, B, C or UP while Filly sleeps wakes Filly with a surprise.
# A reaction returns to idle after REACTION_SECONDS.
#
# The frames and manifest.json come from `npm run export:badger` in
# https://github.com/ohcnetwork/care_filly_character. The manifest lists the
# frame count, frame rate and loop point of each state.
#
# The badge heap is ~240 kB and fragmented, so no sprite sheet stays in RAM.
# Each frame is a small PNG (assets/<state>/NN.png) decoded when it is shown,
# like the MonaOS startup animation.

REACTION_SECONDS = 3
FLOOR_Y = 94
CENTER_X = 80

with open("assets/manifest.json") as f:
    manifest = json.load(f)

CELL = manifest["cell"]
BASELINE = manifest["baseline"]
STATES = manifest["states"]
del manifest

screen.font = PixelFont.load("/system/assets/fonts/ark.ppf")

# colours follow src/core/palette.ts
WALL = brushes.color(217, 239, 195)
FLOOR = brushes.color(35, 122, 67)
FLOOR_EDGE = brushes.color(32, 88, 49)
SHADOW = brushes.color(0, 0, 0, 40)
INK = brushes.color(18, 59, 40)
INK_SOFT = brushes.color(18, 59, 40, 150)
PAPER = brushes.color(250, 249, 246)
PILL = brushes.color(169, 203, 141)

LABELS = {
    "idle": "hi there!",
    "listening": "listening...",
    "talking": "hello world!",
    "happy": "yay!",
    "thinking": "hmm...",
    "surprised": "oh!",
    "sleepy": "zzz...",
}

REACTIONS = {
    io.BUTTON_A: "listening",
    io.BUTTON_B: "talking",
    io.BUTTON_C: "happy",
    io.BUTTON_UP: "thinking",
}


class Clip:
    """The frames of one state. Only the frame on screen is in RAM."""

    def __init__(self, name):
        info = STATES[name]
        self.dir = info["dir"]
        self.fps = info["fps"]
        self.frames = info["frames"]
        self.loop_start = info["loop_start"]
        self.index = -1
        self.image = None

    def frame(self, seconds):
        # play the lead-in once, then loop the tail
        i = int(seconds * self.fps)
        if i >= self.frames:
            i = self.loop_start + (i - self.loop_start) % (self.frames - self.loop_start)
        if i != self.index:
            self.image = None  # free the old frame before the next decode
            self.image = Image.load("assets/{}/{:02d}.png".format(self.dir, i))
            self.index = i
        return self.image


class Filly:
    def __init__(self):
        self.state = "idle"
        self.clip = Clip("idle")
        self.since = io.ticks

    def elapsed(self):
        return (io.ticks - self.since) / 1000

    def set_state(self, name):
        if name == self.state:
            return
        self.state = name
        self.clip = Clip(name)
        self.since = io.ticks

    def react(self, name):
        if self.state == "sleepy":
            name = "surprised"
        self.set_state(name)

    def update(self):
        if self.state not in ("idle", "sleepy") and self.elapsed() > REACTION_SECONDS:
            self.set_state("idle")

    def draw(self):
        screen.brush = SHADOW
        screen.draw(shapes.rounded_rectangle(CENTER_X - 17, FLOOR_Y - 2, 34, 5, 2))
        image = self.clip.frame(self.elapsed())
        screen.blit(image, CENTER_X - CELL // 2, FLOOR_Y - BASELINE)


filly = Filly()


def center_text(text, y, sx=0, ex=160):
    w, _ = screen.measure_text(text)
    screen.text(text, sx + ((ex - sx) / 2) - (w / 2), y)


def draw_room():
    screen.brush = WALL
    screen.clear()
    screen.brush = FLOOR
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 120 - FLOOR_Y))
    screen.brush = FLOOR_EDGE
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 2))


def draw_header():
    screen.brush = INK
    screen.draw(shapes.rounded_rectangle(50, -5, 60, 18, 3))
    screen.brush = PAPER
    center_text("filly", 0)


def draw_label():
    label = LABELS[filly.state]
    w, _ = screen.measure_text(label)
    screen.brush = PILL
    screen.draw(shapes.rounded_rectangle(CENTER_X - (w / 2) - 5, 20, w + 10, 13, 4))
    screen.brush = INK
    center_text(label, 22)


def draw_hints():
    screen.brush = PAPER
    center_text("A listen  B talk  C happy", 99)
    screen.brush = brushes.color(250, 249, 246, 170)
    center_text("up think  down sleep", 109)


def handle_input():
    if io.BUTTON_DOWN in io.pressed:
        filly.set_state("idle" if filly.state == "sleepy" else "sleepy")
        return
    for button, state in REACTIONS.items():
        if button in io.pressed:
            filly.react(state)
            return


def update():
    handle_input()
    filly.update()

    draw_room()
    filly.draw()
    draw_header()
    draw_label()
    draw_hints()


if __name__ == "__main__":
    run(update)
