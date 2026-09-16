import sys
import os

APP = "/system/apps/filly-run"
sys.path.insert(0, APP)
os.chdir(APP)
# The shared library is in /system/filly. The simulator maps /system to
# another directory, so find it from the real working directory.
sys.path.insert(0, os.getcwd().rsplit("/apps/", 1)[0] + "/filly")

import random
from badgeware import io, screen, run, shapes, PixelFont, SpriteSheet, State
import fillylib
from fillylib import center_text

# filly-run: Filly hops over cacti and ducks under birds, like the Chrome
# dinosaur game.
#
# The sprite sheet assets/filly.png has 9 cells of 48 x 48 px: the 7 frames of
# the happy bounce (the run cycle: Filly has no legs), hit and duck. Each cell
# is anchor aligned: the feet point is 1 px above the bottom centre of the
# cell, so the bounce lifts the body in the cell. Speeds are in px/s, so the
# game feels the same at every frame rate.

FLOOR_Y = 100
CELL = 48
# Sprite position when Filly stands on the floor: the feet row is cell row 46.
GROUND_Y = FLOOR_Y - 47
FILLY_X = 10
# Hit boxes inside the cell (x, y, w, h). They are inside the body, like the
# dinosaur's boxes, so a touch of an ear or an arm is not a hit.
STAND_BOX = (14, 16, 20, 31)
DUCK_BOX = (8, 29, 32, 18)

# Jump: 0.62 s in the air, 48 px at the top. Filly is above a tall cactus
# (26 px) for 0.42 s, so the jump window is about 14 px at the start speed.
GRAVITY = 1000.0
JUMP_V = -310.0
DROP_V = 260.0
MAX_DT = 0.1
SQUASH_MS = 90

SPEED_START = 100.0
SPEED_MAX = 190.0
ACCEL = 0.85
PX_PER_POINT = 9.0
BIRD_SCORE = 300
NIGHT_EVERY = 500
FLASH_MS = 900
OVER_MS = 900

# Gap to the next obstacle in seconds of travel, and the first gap in px.
GAP_MIN_S = 0.85
GAP_MAX_S = 1.7
FIRST_GAP = 130.0
BIRD_EXTRA = 20.0
BIRD_FLAP_MS = 180

CELL_HIT = 7
CELL_DUCK = 8
HOP_CELLS = 7
HOP_FPS = 10.0

MODE_TITLE = "title"
MODE_PLAY = "play"
MODE_DYING = "dying"
MODE_OVER = "over"

PANEL_X = 60
PANEL_Y = 22
PANEL_W = 96
PANEL_H = 50
LINE_1 = 28
LINE_2 = 41
LINE_3 = 54
HUD_Y = 5
HUD_HI_X = 66
HUD_SCORE_X = 122
HINT_Y = 103
DASH_Y = 114
DASH_STEP = 26

NIGHT_SKY = fillylib.color(fillylib.EYE_INK)
CLOUD_DAY = fillylib.color(fillylib.HIGHLIGHT, 160)
CLOUD_NIGHT = fillylib.color(fillylib.HIGHLIGHT, 50)
CACTUS = fillylib.FLOOR
CACTUS_LIGHT = fillylib.color(fillylib.TILE_GREEN)
BIRD = fillylib.color(fillylib.ACCENT)
STAR = fillylib.color(fillylib.HIGHLIGHT)
CLOUDS = ((20, 14, 30), (80, 30, 22), (130, 20, 36))
STARS = ((8, 10), (30, 26), (52, 8), (74, 20), (96, 32), (118, 12), (140, 28), (150, 44), (40, 44), (100, 50), (14, 60), (128, 60))

# Cactus kinds: (width, height). A group holds 1 to 3 small or 1 to 2 tall.
SMALL = (8, 16)
TALL = (10, 26)
# Bird heights: sprite top y. Low: jump. Mid: duck (a standing Filly is hit). High: run under.
BIRD_H = 14
BIRD_W = 20
BIRD_Y = (FLOOR_Y - BIRD_H - 2, 60, 36)

screen.font = PixelFont.load("/system/assets/fonts/ark.ppf")
sheet = SpriteSheet("assets/filly.png", 9, 1)

state = {"best": 0}
State.load("filly-run", state)
best = int(state.get("best", 0))

mode = MODE_TITLE
score = 0
new_best = False
distance = 0.0
speed = SPEED_START
scroll = 0.0
filly_y = float(GROUND_Y)
velocity = 0.0
airborne = False
ducking = False
hop_phase = 0.0
landed_at = -10000
obstacles = []
until_spawn = 0.0
last_ticks = io.ticks
died_at = 0
last_hundred = 0
flash_until = 0


class Cactus:
    def __init__(self, x, kind, count):
        self.x = float(x)
        self.w, self.h = kind
        self.count = count
        self.width = self.w * count + 2 * (count - 1)

    def boxes(self):
        return ((self.x + 1, FLOOR_Y - self.h, self.width - 2, self.h),)

    def move(self, dt):
        self.x -= speed * dt

    def draw(self):
        for i in range(self.count):
            x = int(self.x) + i * (self.w + 2)
            top = FLOOR_Y - self.h
            arm_y = top + self.h // 3
            screen.brush = CACTUS
            screen.draw(shapes.rounded_rectangle(x + 2, top, self.w - 4, self.h + 4, 2))
            screen.draw(shapes.rounded_rectangle(x, arm_y, 3, 6, 1))
            screen.draw(shapes.rounded_rectangle(x + self.w - 3, arm_y + 3, 3, 6, 1))
            screen.brush = CACTUS_LIGHT
            screen.draw(shapes.rectangle(x + self.w // 2 - 1, top + 2, 1, self.h - 4))


class Bird:
    def __init__(self, x, y):
        self.x = float(x)
        self.y = y
        self.width = BIRD_W

    def boxes(self):
        return ((self.x + 2, self.y + 3, BIRD_W - 4, BIRD_H - 5),)

    def move(self, dt):
        self.x -= (speed + BIRD_EXTRA) * dt

    def draw(self):
        x = int(self.x)
        up = (io.ticks // BIRD_FLAP_MS) % 2 == 0
        screen.brush = BIRD
        screen.draw(shapes.rounded_rectangle(x + 2, self.y + 5, 14, 5, 2))
        screen.draw(shapes.rounded_rectangle(x + 13, self.y + 3, 7, 4, 2))
        if up:
            screen.draw(shapes.rounded_rectangle(x + 6, self.y, 4, 7, 1))
        else:
            screen.draw(shapes.rounded_rectangle(x + 6, self.y + 8, 4, 6, 1))


def overlaps(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[0] + a[2], b[0] + b[2])
    y2 = min(a[1] + a[3], b[1] + b[3])
    return x1 < x2 and y1 < y2


def filly_box():
    box = DUCK_BOX if ducking else STAND_BOX
    return (FILLY_X + box[0], filly_y + box[1], box[2], box[3])


def is_night():
    return (score // NIGHT_EVERY) % 2 == 1


def start_round():
    global mode, score, new_best, distance, speed, filly_y, velocity, airborne
    global ducking, obstacles, until_spawn, last_hundred, flash_until
    mode = MODE_PLAY
    score = 0
    new_best = False
    distance = 0.0
    speed = SPEED_START
    filly_y = float(GROUND_Y)
    velocity = JUMP_V
    airborne = True
    ducking = False
    obstacles = []
    until_spawn = FIRST_GAP
    last_hundred = 0
    flash_until = 0


def die(now):
    global mode, died_at, best, new_best, ducking
    mode = MODE_DYING
    died_at = now
    ducking = False
    if score > best:
        best = score
        new_best = True
        state["best"] = best
        State.save("filly-run", state)


def spawn():
    """Add the next obstacle at the right edge and pick the gap to the one after it."""
    global until_spawn
    x = 160.0
    if score >= BIRD_SCORE and random.random() < 0.3:
        obstacles.append(Bird(x, BIRD_Y[random.randint(0, 2)]))
    else:
        # Wide groups need a long jump, so they come at speed.
        wide = speed > 130
        if random.random() < 0.35:
            obstacles.append(Cactus(x, TALL, random.randint(1, 2) if wide else 1))
        else:
            obstacles.append(Cactus(x, SMALL, random.randint(1, 3 if wide else 2)))
    until_spawn = obstacles[-1].width + speed * (GAP_MIN_S + random.random() * (GAP_MAX_S - GAP_MIN_S))


def fall(dt, now):
    """Apply gravity. Returns True on the frame Filly lands."""
    global filly_y, velocity, airborne, landed_at
    if not airborne:
        return False
    velocity += GRAVITY * dt
    filly_y += velocity * dt
    if filly_y >= GROUND_Y:
        filly_y = float(GROUND_Y)
        velocity = 0.0
        airborne = False
        landed_at = now
        return True
    return False


def update_play(dt, now):
    global speed, distance, score, scroll, ducking, velocity, airborne
    global hop_phase, obstacles, until_spawn, last_hundred, flash_until
    speed = min(speed + ACCEL * dt, SPEED_MAX)
    scroll += speed * dt
    distance += speed * dt
    until_spawn -= speed * dt
    score = int(distance / PX_PER_POINT)
    if score // 100 > last_hundred:
        last_hundred = score // 100
        flash_until = now + FLASH_MS

    down = io.BUTTON_DOWN in io.held
    if (io.BUTTON_A in io.pressed or io.BUTTON_UP in io.pressed) and not airborne:
        velocity = JUMP_V
        airborne = True
        ducking = False
    if airborne and down and velocity < DROP_V:
        velocity = DROP_V
    fall(dt, now)
    ducking = down and not airborne
    if not airborne and not ducking:
        hop_phase += dt * HOP_FPS * speed / SPEED_START

    for o in obstacles:
        o.move(dt)
    obstacles = [o for o in obstacles if o.x + o.width > -4]
    if until_spawn <= 0:
        spawn()
    box = filly_box()
    for o in obstacles:
        for b in o.boxes():
            if overlaps(box, b):
                die(now)
                return


def filly_cell(now):
    if mode == MODE_DYING or mode == MODE_OVER:
        return CELL_HIT
    if ducking:
        return CELL_DUCK
    if airborne:
        if velocity < -100:
            return 1
        if velocity < 60:
            return 3
        if velocity < 180:
            return 5
        return 6
    if now - landed_at < SQUASH_MS:
        return 0
    return int(hop_phase) % HOP_CELLS


def draw_sky():
    night = is_night()
    screen.brush = NIGHT_SKY if night else fillylib.WALL
    screen.draw(shapes.rectangle(0, 0, 160, 120))
    if night:
        screen.brush = STAR
        for sx, sy in STARS:
            x = (sx - scroll / 12) % 168 - 4
            screen.draw(shapes.rectangle(int(x), sy, 1, 1))
        screen.brush = fillylib.PAPER
        screen.draw(shapes.circle(132, 32, 7))
        screen.brush = NIGHT_SKY
        screen.draw(shapes.circle(136, 30, 6))
    screen.brush = CLOUD_NIGHT if night else CLOUD_DAY
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
    for i in range(6):
        x = (i * 37 + (i * 13) % 20 - scroll) % 220 - 30
        screen.draw(shapes.rectangle(int(x), 105 + (i * 7) % 4, 2, 2))


def draw_filly(now):
    screen.blit(sheet.sprite(filly_cell(now), 0), FILLY_X, int(filly_y))


def draw_panel(line_1, line_2, line_3):
    screen.brush = fillylib.PAPER
    screen.draw(shapes.rounded_rectangle(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 6))
    ex = PANEL_X + PANEL_W
    screen.brush = fillylib.INK
    center_text(line_1, LINE_1, PANEL_X, ex)
    screen.brush = fillylib.INK_SOFT
    center_text(line_2, LINE_2, PANEL_X, ex)
    center_text(line_3, LINE_3, PANEL_X, ex)


def digits(n):
    s = str(n)
    return "0" * (5 - len(s)) + s


def draw_hud(now):
    screen.brush = fillylib.PAPER if is_night() else fillylib.INK
    if best > 0:
        screen.text("HI " + digits(best), HUD_HI_X, HUD_Y)
    if now < flash_until:
        if (now // 150) % 2 == 0:
            screen.text(digits(last_hundred * 100), HUD_SCORE_X, HUD_Y)
    else:
        screen.text(digits(score), HUD_SCORE_X, HUD_Y)


def draw_hint(text):
    screen.brush = fillylib.PAPER
    center_text(text, HINT_Y)


def update():
    global last_ticks, mode, hop_phase
    now = io.ticks
    dt = min((now - last_ticks) / 1000, MAX_DT)
    last_ticks = now

    if mode == MODE_TITLE:
        hop_phase += dt * HOP_FPS
        if io.BUTTON_A in io.pressed or io.BUTTON_UP in io.pressed:
            start_round()
    elif mode == MODE_PLAY:
        update_play(dt, now)
    elif mode == MODE_DYING:
        # Everything freezes on a hit, like the dinosaur.
        if now - died_at >= OVER_MS:
            mode = MODE_OVER
    elif mode == MODE_OVER:
        if io.BUTTON_A in io.pressed or io.BUTTON_UP in io.pressed:
            start_round()

    draw_sky()
    for o in obstacles:
        o.draw()
    draw_floor()
    draw_filly(now)

    if mode == MODE_TITLE:
        draw_panel("filly run", "A jump", "DOWN duck")
        draw_hint("press A")
    elif mode == MODE_OVER:
        draw_hud(now)
        draw_panel("new best" if new_best else "game over", digits(score), "A again")
    else:
        draw_hud(now)


if __name__ == "__main__":
    run(update)
