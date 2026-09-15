import sys
import os

APP = "/system/apps/filly-pulse"
sys.path.insert(0, APP)
os.chdir(APP)
# The shared library and the frames are in /system/filly. The simulator maps
# /system to another directory, so find it from the real working directory.
sys.path.insert(0, os.getcwd().rsplit("/apps/", 1)[0] + "/filly")

from badgeware import io, screen, run, shapes, brushes, PixelFont, State
import fillylib
from fillylib import Filly, center_text

# filly-pulse is an ECG rhythm game for Filly, the CARE mascot.

FLOOR_Y = 100
ANCHOR_X = 48

MON_X = 2
MON_Y = 2
MON_W = 156
MON_H = 13
MARKER_X = 24
BASE_Y = 9
LOOKAHEAD_MS = 2000

PANEL_X = 96
PANEL_Y = 20
PANEL_W = 60
PANEL_H = 65

HIT_MS = 120
PERFECT_MS = 55
START_BPM = 60
MAX_BPM = 150
LIVES_MAX = 3
TITLE_SLEEP_MS = 20000
REACTION_MS = 900

MODE_TITLE = "title"
MODE_PLAY = "play"
MODE_PAUSE = "pause"
MODE_OVER = "over"

screen.font = PixelFont.load("/system/assets/fonts/ark.ppf")

state = {"best": 0}
State.load("filly-pulse", state)
best = int(state.get("best", 0))

filly = Filly(ANCHOR_X, FLOOR_Y, io.ticks)
mode = MODE_TITLE
score = 0
streak = 0
lives = LIVES_MAX
beat_time = 0
beat_no = 0
message = "press A"
reaction_until = 0
title_since = io.ticks
paused_at = 0
last_saved_best = best


def bpm_for_streak(value):
    bpm = START_BPM + value * 6
    if bpm > MAX_BPM:
        bpm = MAX_BPM
    return bpm


def next_interval():
    interval = int(60000 / bpm_for_streak(streak))
    if streak > 6:
        interval += ((beat_no % 3) - 1) * 25
    return interval


def save_state():
    state["best"] = best
    State.save("filly-pulse", state)


def set_filly(name):
    if filly.state != name:
        filly.set_state(name, io.ticks)


def start_round():
    global mode, score, streak, lives, beat_time, beat_no, message, reaction_until
    mode = MODE_PLAY
    score = 0
    streak = 0
    lives = LIVES_MAX
    beat_no = 0
    beat_time = io.ticks + LOOKAHEAD_MS
    message = "find pulse"
    reaction_until = 0
    set_filly("listening")


def end_round(text):
    global mode, best, message, last_saved_best
    mode = MODE_OVER
    message = text
    if score > best:
        best = score
        message = "new best"
        save_state()
        last_saved_best = best
    set_filly("thinking")


def add_miss(text):
    global lives, streak, beat_time, beat_no, message, reaction_until
    if mode != MODE_PLAY:
        return
    lives -= 1
    streak = 0
    message = text
    reaction_until = io.ticks + REACTION_MS
    set_filly("surprised")
    if lives <= 0:
        end_round("game over")
        return
    beat_no += 1
    beat_time += next_interval()


def add_hit(delta):
    global score, streak, beat_time, beat_no, message, reaction_until
    perfect = delta <= PERFECT_MS
    score += 3 if perfect else 1
    streak += 1
    message = "perfect" if perfect else "hit"
    reaction_until = io.ticks + REACTION_MS
    set_filly("happy")
    beat_no += 1
    beat_time += next_interval()


def toggle_pause():
    global mode, paused_at, beat_time, reaction_until, message
    if mode == MODE_PLAY:
        mode = MODE_PAUSE
        paused_at = io.ticks
        message = "paused"
        set_filly("thinking")
    elif mode == MODE_PAUSE:
        shift = io.ticks - paused_at
        beat_time += shift
        reaction_until += shift
        mode = MODE_PLAY
        message = "resume"
        set_filly("listening")


def handle_input():
    global mode, title_since
    if mode == MODE_TITLE:
        if io.BUTTON_A in io.pressed:
            start_round()
        elif io.ticks - title_since > TITLE_SLEEP_MS:
            set_filly("sleepy")
        return

    if mode == MODE_OVER:
        if io.BUTTON_A in io.pressed:
            start_round()
        return

    if io.BUTTON_B in io.pressed:
        toggle_pause()
        return

    if mode == MODE_PLAY and io.BUTTON_A in io.pressed:
        delta = abs(io.ticks - beat_time)
        if delta <= HIT_MS:
            add_hit(delta)
        else:
            add_miss("miss press")


def update_beat():
    if mode != MODE_PLAY:
        return
    if io.ticks > beat_time + HIT_MS:
        add_miss("miss beat")
    elif reaction_until and io.ticks > reaction_until and filly.state in ("happy", "surprised"):
        set_filly("listening")


def draw_room():
    screen.brush = fillylib.WALL
    screen.clear()
    screen.brush = fillylib.FLOOR
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 120 - FLOOR_Y))
    screen.brush = fillylib.FLOOR_EDGE
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 2))


def draw_monitor():
    # A full top strip gives a long lead time before each spike meets the marker.
    screen.brush = fillylib.color((25, 73, 49))
    screen.draw(shapes.rounded_rectangle(MON_X, MON_Y, MON_W, MON_H, 3))
    screen.brush = brushes.color(255, 255, 255, 30)
    screen.draw(shapes.line(MON_X + 4, BASE_Y, MON_X + MON_W - 4, BASE_Y, 1))
    screen.brush = fillylib.WARM
    screen.draw(shapes.line(MARKER_X, MON_Y + 1, MARKER_X, MON_Y + MON_H - 1, 1))

    now = io.ticks
    interval = next_interval()
    # Outside a round the trace runs on its own, so the monitor never looks dead.
    origin = beat_time if mode in (MODE_PLAY, MODE_PAUSE) else now - now % interval + interval
    screen.brush = fillylib.PILL
    for i in range(-1, 7):
        t = origin + interval * i
        x = MARKER_X + (t - now) * (MON_X + MON_W - 4 - MARKER_X) / LOOKAHEAD_MS
        if x < MON_X + 5 or x > MON_X + MON_W - 5:
            continue
        screen.draw(shapes.line(x - 5, BASE_Y, x - 2, BASE_Y, 1))
        screen.draw(shapes.line(x - 2, BASE_Y, x, MON_Y + 3, 1))
        screen.draw(shapes.line(x, MON_Y + 3, x + 2, MON_Y + MON_H - 2, 1))
        screen.draw(shapes.line(x + 2, MON_Y + MON_H - 2, x + 5, BASE_Y, 1))


def fixed_text(text, x, y, w, align_right=False):
    tw, _ = screen.measure_text(text)
    if align_right:
        screen.text(text, x + w - tw, y)
    else:
        screen.text(text, x, y)


def draw_panel():
    screen.brush = fillylib.PILL
    screen.draw(shapes.rounded_rectangle(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5))
    screen.brush = fillylib.INK
    if mode == MODE_TITLE:
        center_text("pulse", PANEL_Y + 5, PANEL_X, PANEL_X + PANEL_W)
        center_text("press A", PANEL_Y + 20, PANEL_X, PANEL_X + PANEL_W)
        fixed_text("best", PANEL_X + 6, PANEL_Y + 38, 26)
        fixed_text(str(best), PANEL_X + 30, PANEL_Y + 38, 22, True)
    elif mode == MODE_OVER:
        center_text(message, PANEL_Y + 5, PANEL_X, PANEL_X + PANEL_W)
        fixed_text("score", PANEL_X + 6, PANEL_Y + 22, 30)
        fixed_text(str(score), PANEL_X + 36, PANEL_Y + 22, 16, True)
        fixed_text("best", PANEL_X + 6, PANEL_Y + 36, 30)
        fixed_text(str(best), PANEL_X + 36, PANEL_Y + 36, 16, True)
        center_text("A retry", PANEL_Y + 51, PANEL_X, PANEL_X + PANEL_W)
    else:
        center_text(message, PANEL_Y + 5, PANEL_X, PANEL_X + PANEL_W)
        fixed_text("score", PANEL_X + 6, PANEL_Y + 22, 30)
        fixed_text(str(score), PANEL_X + 36, PANEL_Y + 22, 16, True)
        fixed_text("streak", PANEL_X + 6, PANEL_Y + 36, 33)
        fixed_text(str(streak), PANEL_X + 40, PANEL_Y + 36, 12, True)
        fixed_text("lives", PANEL_X + 6, PANEL_Y + 50, 30)
        fixed_text(str(lives), PANEL_X + 42, PANEL_Y + 50, 10, True)


def draw_hints():
    screen.brush = fillylib.PAPER
    center_text("A hit/start  B pause", FLOOR_Y + 2)
    screen.brush = fillylib.PAPER_SOFT
    center_text("tap as spike crosses mark", FLOOR_Y + 11)


def update():
    handle_input()
    update_beat()

    draw_room()
    filly.draw(io.ticks)
    draw_monitor()
    draw_panel()
    draw_hints()


def on_exit():
    global last_saved_best
    if last_saved_best != best:
        save_state()
        last_saved_best = best


if __name__ == "__main__":
    run(update)
