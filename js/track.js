/*
 * track.js — the tile grid and tile helpers.
 * 20×15 tiles of 40 px. Codes: 0 road, 1 wall, 2 player start, 3 goal, 4 tree, 5 flag.
 */
var Track = (function () {
  'use strict';

  var TILE = 40, COLS = 20, ROWS = 15;
  var ROAD = 0, WALL = 1, START = 2, GOAL = 3, TREE = 4, FLAG = 5;

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
    1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 5, 0, 0, 1,
    1, 1, 5, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1,
    0, 3, 0, 0, 0, 0, 1, 4, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1,
    0, 3, 0, 0, 0, 0, 1, 4, 4, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1,
    1, 1, 5, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 1, 1, 1, 1, 1, 1, 1
  ];

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
  // Anything you can't drive onto. Outside the grid counts as wall.
  function isSolid(px, py) {
    var t = tileAt(px, py);
    return !(t === ROAD || t === GOAL);
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
    grid: grid, starts: starts,
    indexAt: indexAt, tileAt: tileAt, isSolid: isSolid, tileCenter: tileCenter, render: render
  };
})();
