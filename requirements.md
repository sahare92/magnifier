# Zchuchit — Screen Magnifier for Visually Impaired Users

## Overview

A Windows desktop app that provides a real-time screen magnifier to help visually impaired users see content on their PC — including other applications running on the system.

## Tech Stack

- **Electron** (Node.js + Chromium) — cross-platform desktop shell
- `desktopCapturer` + `getDisplayMedia` — captures the live screen feed, including all running apps
- Canvas API — renders the magnified lens overlay
- Global shortcuts — system-wide hotkeys that work regardless of focused app

## Features

### 1. Magnifier Lens

- Triggered by a global hotkey: **Ctrl+Shift+M** (toggles on/off)
- A transparent, always-on-top overlay window covers the full screen
- The lens follows the mouse cursor in real-time (~60 fps)
- The lens captures and magnifies a region of the actual screen (including other apps)
- The rest of the screen outside the lens is fully visible and interactive

### 2. Lens Shapes

- **Circle** (default)
- **Rectangle**
- Switched via the toolbar buttons

### 3. Zoom Level

- Controlled by a slider in the toolbar
- Range: **1.5x – 10x**, default **3x**
- Additional controls:
  - Mouse scroll wheel while magnifier is active: scroll up = zoom in, scroll down = zoom out
  - Keyboard **+** / **-** while magnifier is active

### 4. Lens Size

- Controlled by a slider in the toolbar
- Controls the physical diameter/side of the lens on screen
- Range: **100 px – 400 px**, default **200 px**

### 5. Toolbar

- A compact floating bar pinned to the top-center of the screen
- Visible only when the magnifier is active
- Draggable (move it out of the way if needed)
- Contains:
  - Zoom slider + current zoom value label
  - Size slider + current size value label
  - Shape toggle buttons (Circle / Rect)
  - Close button (equivalent to pressing the hotkey again)

## Non-Functional Requirements

- The overlay must be **click-through** — mouse clicks must pass through to underlying apps
- The toolbar must be **interactive** (not click-through)
- Both windows must be **always-on-top**
- App runs in the **system tray** (no taskbar icon visible during normal use)
- Settings (zoom, size, shape) **persist** between sessions via a local JSON config file

## Hotkeys Summary

| Action            | Shortcut         |
|-------------------|------------------|
| Toggle magnifier  | Ctrl+Shift+M     |
| Zoom in           | + (while active) |
| Zoom out          | - (while active) |
