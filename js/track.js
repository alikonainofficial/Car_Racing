/*
 * track.js — the tile grid and tile helpers.
 * 20×15 tiles of 40 px. Codes: 0 road, 1 wall, 2 player start, 3 goal, 4 tree, 5 flag.
 */
var Track = (function () {
  'use strict';

  var TILE = 40, COLS = 20, ROWS = 15;
  var ROAD = 0, WALL = 1, START = 2, GOAL = 3, TREE = 4, FLAG = 5;

  // The original grid ended in a dead-end finish lane (bottom left) with no road back to
  // the start, so it could not be lapped. Rows 10–14, columns 0–3 are changed to close the
  // loop: the finish lane now turns north into the start corridor, and the finish line is
  // a gate of goal tiles (row 10, cols 1–2) just behind the start grid, flanked by two
  // decorative flags. Everything else is the original layout.
  var grid = [
    4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4,
    4, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1,
    1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1,
    1, 0, 0, 0, 1, 1, 1, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 0, 0, 1,
    1, 0, 0, 1, 1, 0, 0, 1, 4, 4, 1, 1, 0, 0, 0, 1, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 0, 0, 1, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1,
    1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 5, 0, 0, 1, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 5, 0, 0, 0, 5, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    5, 3, 3, 5, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 5, 0, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 4, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 0, 1, 4, 4, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1
  ];

  // Checkpoints: the flag tiles on the racing line, in race order. Found once by walking
  // the road from the start grid in the race direction (cars start facing up): up the left
  // corridor, across the top, down the right side, then
  //   1. (col 16, row 10) the notch where the right straight turns into the infield
  //   2. (col 13, row  8) the tip of the hairpin at the top of the infield
  //   3. (col 10, row  9) the tip of the wall between the two infield halves
  //   4. (col  6, row  9) the tip of the last wall before the run down to the finish
  // then down to the bottom lane and north through the finish gate. Hard-coded so laps are
  // deterministic. The two flags beside the finish gate (cols 0 and 3, row 10) are
  // decoration and stay solid.
  var CHECKPOINTS = [216, 173, 190, 186];

  // Start tiles in grid order (the first one is the blue car's, the second the red car's,
  // as in the original game). They are road once the positions are read.
  var starts = [];
  grid.forEach(function (code, i) {
    if (code === START) {
      starts.push({ x: (i % COLS) * TILE + TILE / 2, y: Math.floor(i / COLS) * TILE + TILE / 2 });
      grid[i] = ROAD;
    }
  });

  function indexAt(px, py) {
    var c = Math.floor(px / TILE), r = Math.floor(py / TILE);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return c + COLS * r;
  }
  function tileAt(px, py) {
    var i = indexAt(px, py);
    return i < 0 ? WALL : grid[i];
  }
  // Anything you can't drive onto: walls, trees and decorative flags. Outside the grid
  // counts as wall. Road, goal and checkpoint flags are drivable.
  function isSolid(px, py) {
    var i = indexAt(px, py);
    if (i < 0) return true;
    var t = grid[i];
    if (t === ROAD || t === GOAL) return false;
    if (t === FLAG) return CHECKPOINTS.indexOf(i) < 0;
    return true;
  }
  function tileCenter(i) {
    return { x: (i % COLS) * TILE + TILE / 2, y: Math.floor(i / COLS) * TILE + TILE / 2 };
  }

  // Render every tile once into an offscreen canvas; pics[code] is the tile image.
  function render(pics) {
    var cv = document.createElement('canvas');
    cv.width = COLS * TILE; cv.height = ROWS * TILE;
    var c = cv.getContext('2d');
    for (var i = 0; i < grid.length; i++) {
      c.drawImage(pics[grid[i]], (i % COLS) * TILE, Math.floor(i / COLS) * TILE, TILE, TILE);
    }
    return cv;
  }

  return {
    TILE: TILE, COLS: COLS, ROWS: ROWS,
    ROAD: ROAD, WALL: WALL, START: START, GOAL: GOAL, TREE: TREE, FLAG: FLAG,
    grid: grid, starts: starts, checkpoints: CHECKPOINTS,
    indexAt: indexAt, tileAt: tileAt, isSolid: isSolid, tileCenter: tileCenter, render: render
  };
})();
