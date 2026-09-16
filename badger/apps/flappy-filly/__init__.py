import sys
import os

APP = "/system/apps/flappy-filly"
sys.path.insert(0, APP)
os.chdir(APP)
# The shared library is in /system/filly. The simulator maps /system to
# another directory, so find it from the real working directory.
sys.path.insert(0, os.getcwd().rsplit("/apps/", 1)[0] + "/filly")

import math
import random
from badgeware import io, screen, run, shapes, PixelFont, SpriteSheet, State
import fillylib
from fillylib import center_text

# flappy-filly: Filly flies between the pillars, like flappy mona.
#
# The sprite sheet assets/filly.png has 5 cells of 32 x 32 px: rise, float,
# sink, fall and hit. The game picks a cell from the vertical speed. The
# sheet is small (about 5 kB), so it stays in RAM. Speeds are in px/s, so the
# game feels the same at every frame rate.

FLOOR_Y = 100
CELL = 32
# Body pixels in a cell: x 4..27, y 6..30. The hit box is 3 px inside the body.
HIT_X = 7
HIT_Y = 9
HIT_W = 18
HIT_H = 19
FEET = 31
FILLY_X = 6
HOVER_Y = 40

GRAVITY = 220.0
FLAP_V = -62.0
MAX_FALL = 160.0
MAX_DT = 0.1

PILLAR_W = 24
GAP = 52
GAP_MIN = 6
GAP_MAX = FLOOR_Y - GAP - 6
SPACING = 68
FIRST_X = 200
SPEED_START = 40.0
SPEED_STEP = 1.5
SPEED_MAX = 80.0
HIT_SLACK = 2

PANEL_X = 44
PANEL_Y = 22
PANEL_W = 112
PANEL_H = 50
LINE_1 = 28
LINE_2 = 41
LINE_3 = 54
HUD_X = 118
HUD_Y = 4
HUD_W = 38
HUD_H = 13
HINT_Y = 103
DASH_Y = 114
DASH_STEP = 26
OVER_MS = 1200

CELL_RISE = 0
CELL_FLOAT = 1
CELL_SINK = 2
CELL_FALL = 3
CELL_HIT = 4

MODE_TITLE = "title"
MODE_PLAY = "play"
MODE_DYING = "dying"
MODE_OVER = "over"

CLOUD = fillylib.color(fillylib.HIGHLIGHT, 160)
SHEEN = fillylib.color(fillylib.TILE_GREEN)
CLOUDS = ((20, 12, 30), (80, 30, 22), (130, 18, 36))

screen.font = PixelFont.load("/system/assets/fonts/ark.ppf")
sheet = SpriteSheet("assets/filly.png", 5, 1)

state = {"best": 0}
State.load("flappy-filly", state)
best = int(state.get("best", 0))

mode = MODE_TITLE
score = 0
new_best = False
filly_y = float(HOVER_Y)
velocity = 0.0
speed = SPEED_START
scroll = 0.0
pillars = []
last_ticks = io.ticks
died_at = 0


class Pillar:
    def __init__(self, x):
        self.x = float(x)
        self.gap_y = random.randint(GAP_MIN, GAP_MAX)
        self.passed = False

    def boxes(self):
        top_h = self.gap_y - HIT_SLACK
        bottom_y = self.gap_y + GAP + HIT_SLACK
        return (
            (self.x, 0, PILLAR_W, top_h),
            (self.x, bottom_y, PILLAR_W, FLOOR_Y - bottom_y),
        )

    def draw(self):
        x = int(self.x)
        top_h = self.gap_y + 12
        bottom_y = self.gap_y + GAP
        screen.brush = fillylib.FLOOR
        screen.draw(shapes.rounded_rectangle(x, -12, PILLAR_W, top_h, 8))
        screen.draw(shapes.rounded_rectangle(x, bottom_y, PILLAR_W, 132 - bottom_y, 8))
        screen.brush = SHEEN
        screen.draw(shapes.rounded_rectangle(x + 3, -12, 6, top_h - 4, 3))
        screen.draw(shapes.rounded_rectangle(x + 3, bottom_y + 4, 6, 128 - bottom_y, 3))


def overlaps(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[0] + a[2], b[0] + b[2])
    y2 = min(a[1] + a[3], b[1] + b[3])
    return x1 < x2 and y1 < y2


def filly_box():
    return (FILLY_X + HIT_X, filly_y + HIT_Y, HIT_W, HIT_H)


def start_round(from_y):
    global mode, score, new_best, filly_y, velocity, speed, pillars
    mode = MODE_PLAY
    score = 0
    new_best = False
    filly_y = float(from_y)
    velocity = FLAP_V
    speed = SPEED_START
    pillars = [Pillar(FIRST_X)]


def die(now):
    global mode, died_at, best, new_best
    mode = MODE_DYING
    died_at = now
    if score > best:
        best = score
        new_best = True
        state["best"] = best
        State.save("flappy-filly", state)


def fall(dt):
    """Apply gravity to Filly. Returns True when the feet touch the floor."""
    global filly_y, velocity
    velocity = min(velocity + GRAVITY * dt, MAX_FALL)
    filly_y += velocity * dt
    if filly_y < -6:
        filly_y = -6.0
        velocity = 0.0
    if filly_y + FEET >= FLOOR_Y:
        filly_y = float(FLOOR_Y - FEET)
        return True
    return False


def update_play(dt, now):
    global score, speed, pillars
    if io.BUTTON_A in io.pressed:
        flap()
    if fall(dt):
        die(now)
        return
    for p in pillars:
        p.x -= speed * dt
    if pillars[-1].x <= 160 - SPACING:
        pillars.append(Pillar(160))
    pillars = [p for p in pillars if p.x > -PILLAR_W]
    box = filly_box()
    for p in pillars:
        for b in p.boxes():
            if overlaps(box, b):
                die(now)
                return
        if not p.passed and p.x + PILLAR_W < box[0]:
            p.passed = True
            score += 1
            speed = min(SPEED_START + score * SPEED_STEP, SPEED_MAX)


def flap():
    global velocity
    velocity = FLAP_V


def cell_for_speed():
    if velocity < -20:
        return CELL_RISE
    if velocity < 30:
        return CELL_FLOAT
    if velocity < 95:
        return CELL_SINK
    return CELL_FALL


def draw_sky():
    screen.brush = fillylib.WALL
    screen.draw(shapes.rectangle(0, 0, 160, 120))
    screen.brush = CLOUD
    for x0, y, w in CLOUDS:
        x = (x0 - scroll / 4) % 220 - 60
        screen.draw(shapes.rounded_rectangle(int(x), y, w, 8, 4))


def draw_floor():
    screen.brush = fillylib.FLOOR
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 120 - FLOOR_Y))
    screen.brush = fillylib.FLOOR_EDGE
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 2))
    offset = int(-scroll) % DASH_STEP
    for i in range(8):
        screen.draw(shapes.rectangle(offset + i * DASH_STEP - DASH_STEP, DASH_Y, 10, 2))


def title_y(now):
    return HOVER_Y + int(3 * math.sin(now / 250))


def draw_filly(now):
    if mode == MODE_TITLE:
        y = title_y(now)
        cell = CELL_FLOAT
    elif mode == MODE_PLAY:
        y = int(filly_y)
        cell = cell_for_speed()
    else:
        y = int(filly_y)
        cell = CELL_HIT
    screen.blit(sheet.sprite(cell, 0), FILLY_X, y)


def draw_panel(line_1, line_2, line_3):
    screen.brush = fillylib.PAPER
    screen.draw(shapes.rounded_rectangle(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6))
    ex = PANEL_X + PANEL_W
    screen.brush = fillylib.INK
    center_text(line_1, LINE_1, PANEL_X, ex)
    screen.brush = fillylib.INK_SOFT
    center_text(line_2, LINE_2, PANEL_X, ex)
    center_text(line_3, LINE_3, PANEL_X, ex)


def draw_hud():
    screen.brush = fillylib.PAPER
    screen.draw(shapes.rounded_rectangle(HUD_X, HUD_Y, HUD_W, HUD_H, 6))
    screen.brush = fillylib.INK
    center_text(str(score), HUD_Y + 2, HUD_X, HUD_X + HUD_W)


def draw_hint(text):
    screen.brush = fillylib.PAPER
    center_text(text, HINT_Y)


def update():
    global last_ticks, scroll, mode
    now = io.ticks
    dt = min((now - last_ticks) / 1000, MAX_DT)
    last_ticks = now

    if mode == MODE_TITLE:
        scroll += SPEED_START * dt
        if io.BUTTON_A in io.pressed:
            start_round(title_y(now))
    elif mode == MODE_PLAY:
        scroll += speed * dt
        update_play(dt, now)
    elif mode == MODE_DYING:
        fall(dt)
        if now - died_at >= OVER_MS:
            mode = MODE_OVER
    elif mode == MODE_OVER:
        if io.BUTTON_A in io.pressed:
            start_round(HOVER_Y)

    draw_sky()
    for p in pillars:
        p.draw()
    draw_floor()
    draw_filly(now)

    if mode == MODE_TITLE:
        draw_panel("flappy filly", "best " + str(best), "press A")
        draw_hint("A flap")
    elif mode == MODE_PLAY or mode == MODE_DYING:
        draw_hud()
    else:
        draw_panel("new best" if new_best else "game over", "score " + str(score), "best " + str(best))
        draw_hint("A again")


if __name__ == "__main__":
    run(update)
