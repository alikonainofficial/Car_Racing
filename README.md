# Car Racing

A top-down arcade racer in plain HTML, CSS and JavaScript. No build step: it's a static
site on GitHub Pages.

**Play:** https://alikonainofficial.github.io/Car_Racing/

## Modes

- **Time Trial** (1 player): 3 laps against the clock. Your best run is saved as a
  **ghost** that drives alongside you next time. As you pass each flag, a split delta shows
  how far ahead (green) or behind (coral) your best run you are.
- **Race** (2 players, same keyboard): 3 laps per round, best of 3. The first car to
  finish 3 laps wins the round; the first to win 2 rounds wins the match.

Both modes start with a 3-2-1-GO countdown. Results can be copied as a one-line summary.

## Controls

| | Red car (P1) | Blue car (P2) |
|---|---|---|
| Accelerate | ↑ | W |
| Brake / reverse | ↓ | S |
| Steer | ← → | A D |

`R` restarts the current mode, `P` or `Esc` pauses. On a touch screen, an on-screen d-pad
drives the red car (Race needs a keyboard).

## Laps and checkpoints

The four flags on the circuit are checkpoints. A lap counts only when you drive over all
four **in order** and then cross the chequered finish gate behind the start grid. The next
flag you need is outlined in your car's colour, and flags you've passed are tinted.

## Saved data

Everything is stored locally in your browser (`localStorage`). Nothing is sent anywhere.
Keys: `arcade.racing.best` and `arcade.racing.bestLap` (ms), `arcade.racing.bestSplits`,
`arcade.racing.ghost` (your best Time Trial run), `arcade.racing.mode` and
`arcade.racing.plays`. Clear your site data to reset them.

## Files

- `js/track.js`: tile grid, tile helpers, checkpoint order
- `js/car.js`: car physics and drawing
- `js/ghost.js`: ghost recording, replay and storage
- `js/game.js`: modes, phases, HUD and overlays
- `js/arcade-shell.js`, `css/arcade-shell.css`: shared arcade cabinet shell (do not edit here)
