import sys
import os

APP = "/system/apps/filly-pet"
sys.path.insert(0, APP)
os.chdir(APP)
# The shared library and the frames are in /system/filly. The simulator maps
# /system to another directory, so find it from the real working directory.
sys.path.insert(0, os.getcwd().rsplit("/apps/", 1)[0] + "/filly")

import time
from badgeware import io, screen, run, shapes, brushes, PixelFont, State, clamp
import fillylib
from fillylib import Filly, center_text

# Filly, the CARE mascot, as a small care companion.
# State writes happen only after actions, timed saves, and exit.

FLOOR_Y = 100
ANCHOR_X = 48
STATE_NAME = "filly-pet"
SAVE_SECONDS = 30
REACTION_SECONDS = 3
INFO_SECONDS = 5
MAX_AWAY_SECONDS = 8 * 60 * 60
DAY_SECONDS = 24 * 60 * 60
ABSURD_AWAY_SECONDS = 30 * DAY_SECONDS

STATUS_X = 2
STATUS_Y = 2
STATUS_W = 156
STATUS_H = 13
PANEL_X = 96
PANEL_Y = 18
PANEL_W = 62
PANEL_H = 78
BAR_X = 102
BAR_W = 50
BAR_H = 7

DECAY = {
    "energy": 100 / (7 * 60 * 60),
    "joy": 100 / (6.5 * 60 * 60),
    "care": 100 / (8 * 60 * 60),
}

LABELS = (("energy", "REST"), ("joy", "JOY"), ("care", "CARE"))
BAR_Y = {"energy": 31, "joy": 54, "care": 77}
BAR_RGB = {
    "energy": fillylib.ACCENT,
    "joy": fillylib.TONGUE,
    "care": fillylib.PLATE_GREEN,
}

state = {
    "energy": 100,
    "joy": 100,
    "care": 100,
    "born_at": 0,
    "last_seen": 0,
    "total_cares": 0,
    "days_cared": 0,
    "last_care_day": -1,
}

screen.font = PixelFont.load("/system/assets/fonts/ark.ppf")
filly = Filly(ANCHOR_X, FLOOR_Y, io.ticks)
reaction_until = 0
resting = False
info_until = 0
last_save = 0
low_alerted = False
loaded = False


def now_seconds():
    try:
        return int(time.time())
    except Exception:
        return 0


def pin(value):
    return clamp(value, 0, 100)


def care_day(ts):
    if ts <= 0:
        return -1
    return ts // DAY_SECONDS


def note_care():
    ts = now_seconds()
    day = care_day(ts)
    state["total_cares"] = int(state.get("total_cares", 0)) + 1
    if day >= 0 and day != int(state.get("last_care_day", -1)):
        state["days_cared"] = int(state.get("days_cared", 0)) + 1
        state["last_care_day"] = day


def apply_decay(seconds):
    if seconds <= 0:
        return
    for name, _ in LABELS:
        state[name] = pin(float(state.get(name, 100)) - DECAY[name] * seconds)


def apply_away_decay():
    ts = now_seconds()
    last = int(state.get("last_seen", 0))
    if int(state.get("born_at", 0)) <= 0 and ts > 0:
        state["born_at"] = ts
    elapsed = ts - last
    if last <= 0 or elapsed < 0 or elapsed > ABSURD_AWAY_SECONDS:
        elapsed = 0
    elif elapsed > MAX_AWAY_SECONDS:
        elapsed = MAX_AWAY_SECONDS
    apply_decay(elapsed)
    state["last_seen"] = ts


def save_state():
    state["last_seen"] = now_seconds()
    return State.save(STATE_NAME, state)


def start_reaction(name):
    global reaction_until, resting
    resting = False
    filly.set_state(name, io.ticks)
    reaction_until = io.ticks + REACTION_SECONDS * 1000


def handle_input():
    global resting, info_until, reaction_until
    any_button = (
        io.BUTTON_A in io.pressed or io.BUTTON_B in io.pressed or
        io.BUTTON_C in io.pressed or io.BUTTON_UP in io.pressed or
        io.BUTTON_DOWN in io.pressed
    )
    if resting and any_button:
        resting = False
        start_reaction("surprised")
        save_state()
        return
    if io.BUTTON_A in io.pressed:
        state["care"] = pin(float(state.get("care", 100)) + 24)
        state["energy"] = pin(float(state.get("energy", 100)) + 4)
        note_care()
        start_reaction("talking")
        save_state()
    elif io.BUTTON_B in io.pressed:
        state["joy"] = pin(float(state.get("joy", 100)) + 26)
        state["energy"] = pin(float(state.get("energy", 100)) - 8)
        note_care()
        start_reaction("happy")
        save_state()
    elif io.BUTTON_C in io.pressed:
        resting = True
        reaction_until = 0
        filly.set_state("sleepy", io.ticks)
        note_care()
        save_state()
    elif io.BUTTON_UP in io.pressed or io.BUTTON_DOWN in io.pressed:
        info_until = io.ticks + INFO_SECONDS * 1000


def update_vitals():
    seconds = io.ticks_delta / 1000
    apply_decay(seconds)
    if resting:
        state["energy"] = pin(float(state.get("energy", 100)) + seconds * 0.18)


def lowest_name():
    name = "energy"
    value = float(state.get(name, 100))
    for key, _ in LABELS:
        v = float(state.get(key, 100))
        if v < value:
            name = key
            value = v
    return name


def need_message():
    if io.ticks < info_until:
        born = int(state.get("born_at", 0))
        age = 0
        ts = now_seconds()
        if born > 0 and ts >= born:
            age = (ts - born) // DAY_SECONDS
        return "age {}d  cares {}".format(age, int(state.get("total_cares", 0)))
    if resting:
        return "filly takes a care nap"
    if reaction_until > io.ticks:
        if filly.state == "talking":
            return "yum. care restored"
        if filly.state == "happy":
            return "play adds joy"
        return "filly wakes up"
    low = lowest_name()
    if float(state.get(low, 100)) < 30:
        if low == "energy":
            return "filly needs rest"
        if low == "joy":
            return "filly needs play"
        return "filly needs water"
    return "filly is happy"


def mood_state():
    global low_alerted
    if resting or reaction_until > io.ticks:
        return
    low_value = min(float(state.get("energy", 100)), float(state.get("joy", 100)), float(state.get("care", 100)))
    if low_value >= 15:
        low_alerted = False
    if low_value < 10 and not low_alerted:
        low_alerted = True
        start_reaction("surprised")
        return
    if float(state.get("energy", 100)) < 30:
        filly.set_state("sleepy", io.ticks)
    elif low_value < 30:
        filly.set_state("thinking", io.ticks)
    else:
        filly.set_state("idle", io.ticks)


def maybe_save():
    global last_save
    if io.ticks - last_save >= SAVE_SECONDS * 1000:
        save_state()
        last_save = io.ticks


def draw_room():
    screen.brush = fillylib.WALL
    screen.clear()
    screen.brush = fillylib.FLOOR
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 120 - FLOOR_Y))
    screen.brush = fillylib.FLOOR_EDGE
    screen.draw(shapes.rectangle(0, FLOOR_Y, 160, 2))


def draw_status():
    screen.brush = fillylib.PILL
    screen.draw(shapes.rounded_rectangle(STATUS_X, STATUS_Y, STATUS_W, STATUS_H, 4))
    screen.brush = fillylib.INK
    center_text(need_message(), STATUS_Y + 2, STATUS_X, STATUS_X + STATUS_W)


def draw_bar(name, label, y):
    amount = int(float(state.get(name, 100)) + 0.5)
    screen.brush = fillylib.INK_SOFT
    screen.text(label, PANEL_X + 4, y - 10)
    screen.brush = fillylib.PAPER_SOFT
    screen.draw(shapes.rounded_rectangle(BAR_X, y, BAR_W, BAR_H, 2))
    fill = int((BAR_W - 2) * amount / 100)
    if fill < 1 and amount > 0:
        fill = 1
    if fill > 0:
        screen.brush = fillylib.color(BAR_RGB[name])
        screen.draw(shapes.rounded_rectangle(BAR_X + 1, y + 1, fill, BAR_H - 2, 2))
    screen.brush = fillylib.INK
    screen.text("{:3d}".format(amount), BAR_X + 36, y - 10)


def draw_panel():
    screen.brush = brushes.color(250, 249, 246, 205)
    screen.draw(shapes.rounded_rectangle(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5))
    screen.brush = fillylib.INK_SOFT
    screen.draw(shapes.rounded_rectangle(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 5).stroke(1))
    for name, label in LABELS:
        draw_bar(name, label, BAR_Y[name])


def draw_hints():
    screen.brush = fillylib.PAPER
    center_text("A hydrate  B play  C rest", FLOOR_Y + 2)
    screen.brush = fillylib.PAPER_SOFT
    center_text("UP/DOWN info  HOME saves", FLOOR_Y + 11)


def init():
    global loaded, last_save
    State.load(STATE_NAME, state)
    apply_away_decay()
    loaded = True
    last_save = io.ticks


def update():
    if not loaded:
        init()
    handle_input()
    update_vitals()
    mood_state()
    maybe_save()

    draw_room()
    filly.draw(io.ticks)
    draw_status()
    draw_panel()
    draw_hints()


def on_exit():
    ok = save_state()
    print("filly-pet save {}".format("ok" if ok else "failed"))


if __name__ == "__main__":
    run(update)
