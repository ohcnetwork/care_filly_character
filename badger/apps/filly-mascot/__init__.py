import sys
import os

APP = "/system/apps/filly-mascot"
sys.path.insert(0, APP)
os.chdir(APP)
# The shared library and the frames are in /system/filly. The simulator maps
# /system to another directory, so find it from the real working directory.
sys.path.insert(0, os.getcwd().rsplit("/apps/", 1)[0] + "/filly")

from badgeware import io, screen, run, shapes, PixelFont
import fillylib
from fillylib import Filly, center_text

# Filly, the CARE mascot, on the GitHub Universe 2025 badge.
#
# Buttons:
#   A     listen        UP    think
#   B     talk          DOWN  sleep / wake
#   C     happy
#
# A press of A, B, C or UP while Filly sleeps wakes Filly with a surprise.
# A reaction returns to idle after REACTION_SECONDS.
#
# Layout (fixed, no element moves):
#   speech pill   top left, one fixed box; the text changes with the state
#   Filly         feet on the floor line, a little right of centre
#   floor band    y 100..120: two lines of button hints

REACTION_SECONDS = 3
FLOOR_Y = 100
ANCHOR_X = 92
PILL_X = 4
PILL_Y = 4

screen.font = PixelFont.load("/system/assets/fonts/ark.ppf")

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

# One pill width for every label, so the box does not change size.
PILL_W = max(screen.measure_text(label)[0] for label in LABELS.values()) + 10

filly = Filly(ANCHOR_X, FLOOR_Y, io.ticks)


def react(name):
    if filly.state == "sleepy":
        name = "surprised"
    filly.set_state(name, io.ticks)


def handle_input():
    if io.BUTTON_DOWN in io.pressed:
        filly.set_state("idle" if filly.state == "sleepy" else "sleepy", io.ticks)
        return
    for button, state in REACTIONS.items():
        if button in io.pressed:
            react(state)
            return


def draw_room():
    screen.brush = fillylib.WALL
    screen.clear()
    screen.brush = fillylib.FLOOR
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 120 - FLOOR_Y))
    screen.brush = fillylib.FLOOR_EDGE
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 2))


def draw_speech():
    screen.brush = fillylib.PILL
    screen.draw(shapes.rounded_rectangle(PILL_X, PILL_Y, PILL_W, 13, 4))
    screen.brush = fillylib.INK
    center_text(LABELS[filly.state], PILL_Y + 2, PILL_X, PILL_X + PILL_W)


def draw_hints():
    screen.brush = fillylib.PAPER
    center_text("A listen  B talk  C happy", FLOOR_Y + 2)
    screen.brush = fillylib.PAPER_SOFT
    center_text("up think  down sleep", FLOOR_Y + 11)


def update():
    handle_input()
    if filly.state not in ("idle", "sleepy") and filly.elapsed(io.ticks) > REACTION_SECONDS:
        filly.set_state("idle", io.ticks)

    draw_room()
    filly.draw(io.ticks)
    draw_speech()
    draw_hints()


if __name__ == "__main__":
    run(update)
