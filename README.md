# KeyLight Pixel Mapper

A GPU-accelerated pixel mapping desktop app for LED lighting. Place LED fixtures on a 2D canvas, run real-time GLSL shader effects, and stream output via Art-Net, sACN/E1.31, or USB DMX — all with sub-frame latency.

Built for [KeyLight](https://github.com/djmoneykey/keylight) hardware (WLED-compatible), and works with any Art-Net or sACN device.

---

## Features

- **WebGL2 rendering** — 30+ GLSL effects rendered at full GPU speed
- **Flexible fixture support** — LED strips, PAR LEDs, bars, panels; RGB, GRB, RGBW, GRBW and more
- **Multi-scene compositing** — multiple named scenes, each with its own layer stack, blend modes, masks, and opacity
- **Three output protocols** — Art-Net (broadcast + unicast), sACN/E1.31 multicast, USB DMX (ENTTEC Pro & Open)
- **Art-Net node discovery** — automatic ArtPoll across all network interfaces; discovered nodes listed for unicast assignment
- **Audio-reactive effects** — mic/line input routed to BPM detection and 11 reactive shaders
- **Fixture library** — built-in presets for KeyLight, WS2812B, SK6812, APA102, PAR LEDs; browse thousands more from [Open Fixture Library](https://open-fixture-library.org/)
- **Decoupled output timer** — Art-Net/sACN packets fire on a dedicated `setInterval` independent of the render loop, eliminating jitter at the fixture

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm 9+

### Install & Run

```bash
git clone https://github.com/djmoneykey/keylight-pixel-mapper.git
cd keylight-pixel-mapper
npm install
npm start
```

### Build

```bash
npm run make
```

Outputs a platform installer to `out/make/`.

---

## Usage

### Edit Mode

1. **Add a fixture** — open the Fixture Library (`Ctrl+L` or _Fixtures_ menu), pick a preset or browse Open Fixture Library, and drop it onto the canvas.
2. **Assign universe/channel** — select the fixture in the Properties panel and set its Art-Net universe and start channel.
3. **Pick an effect** — select from the Effects panel on the right, or use keyboard shortcuts (`1`–`5` for the first five).
4. **Enable output** — open Output Settings (`Ctrl+,`), choose protocol (Art-Net / sACN / both / USB DMX), and press Space or toggle Output on.

### Perform Mode

Switch to Perform Mode (toolbar) for a full-screen canvas view with scene and layer controls. Double-click a scene chip to rename it; click `+` to add scenes.

### Scene Mode

Enable Scene Mode in the toolbar to unlock multi-layer compositing:

- Each **scene** has its own layer stack
- Each **layer** has an effect, opacity, blend mode, and mask
- **Masks**: Full canvas, polygon (draw on canvas), or per-fixture selection
- **Blend modes**: Normal, Add, Screen, Multiply

---

## Output Protocols

| Protocol | Transport | Notes |
|---|---|---|
| Art-Net | UDP port 6454 | Broadcast or unicast; ArtPoll discovery |
| sACN / E1.31 | UDP port 5568 | Multicast per universe (239.255.0.x) |
| USB DMX | WebSerial | ENTTEC DMX USB Pro or Open DMX USB |

Art-Net unicast scans all network interfaces for ArtPoll replies — useful when your LED nodes are on a different subnet than your default gateway.

---

## Effects

| Category | Effects |
|---|---|
| Basic | Solid, Strobe, Breathe |
| Movement | Rainbow, Chase, Scanner, Meteor, Color Wipe, Theater, Sinelon, Gradient, Plasma, BPM Sync, Ripple, Twinkle, Confetti, Fire, Lightning, Matrix |
| Reactive | Spectrum, Bass Pulse, Beat Flash, VU Meter, Freq RGB, Spec Chase, Audio Ripple, Bass Fire, Waveform, Bands, Spec Mirror |

Reactive effects use your system microphone or line input. BPM is detected automatically from bass transients and can be overridden.

---

## Fixture Library

### Built-in Presets

| Category | Fixtures |
|---|---|
| KeyLight | PT-120 (120px RGBW), Strip 30, Strip 60 |
| PAR LED | RGB, GRB, BGR, RGBW, GRBW (1px each) |
| LED Strip | WS2812B 30/60/144px, SK6812 RGBW 30/60px, APA102 60px |
| LED Bar | 8px, 12px, 24px, 48px |

### Open Fixture Library Browser

Browse and add fixtures from the community-maintained [Open Fixture Library](https://open-fixture-library.org/) (20,000+ fixtures). Select a manufacturer, expand a fixture model, and pick a mode — the correct channel order is detected automatically.

### Channel Orders Supported

`RGB` `RBG` `GRB` `GBR` `BRG` `BGR` `RGBW` `GRBW` `BGRW` `RBGW` `WRGB` `WGRB`

For RGBW fixtures, the W channel is derived from luminance: `W = 0.299R + 0.587G + 0.114B`.

---

## Tech Stack

- **Electron 42** + electron-forge + Vite
- **React 19** + TypeScript 5
- **WebGL2** — ping-pong FBOs for scene compositing, per-LED GPU sampling
- **Zustand** — persisted app state
- **Node.js** `dgram` — UDP socket for Art-Net / sACN in the main process
- **WebSerial** — USB DMX output from the renderer process

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Toggle output on/off |
| `1` – `5` | Effect shortcuts (customizable) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+D` | Duplicate selected fixture(s) |
| `Ctrl+A` | Select all fixtures |
| `Delete` | Remove selected fixture(s) |
| `Arrow keys` | Nudge selected fixture(s) |
| `Shift+Arrow` | Fine nudge |
| `G` | Toggle grid |
| `Ctrl+L` | Open Fixture Library |
| `Escape` | Deselect all |

---

## License

MIT — see [LICENSE](LICENSE).

---

Made by [djmoneykey](https://github.com/djmoneykey) · Built for the KeyLight and WLED community.
