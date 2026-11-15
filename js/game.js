/*
 * game.js — loading, loop, input, modes and HUD for Car Racing.
 * Uses the shared cabinet shell (js/arcade-shell.js) through window.Arcade.
 */
(function () {
  'use strict';

  var P1_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  var P2_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

  var IMAGE_FILES = {
    p1: 'player1.png', p2: 'player2.png',
    road: 'track_road.png', wall: 'track_wall.png', goal: 'track_goal.png',
    tree: 'track_tree.png', flag: 'track_flag.png'
  };

  var G = {
    loaded: false, pics: {}, trackCanvas: null,
    cars: []
  };

  Arcade.init({ game: 'racing', title: 'Car Racing', onRestart: restartCurrentMode });
  Arcade.input.capture([
    P1_KEYS.up, P1_KEYS.down, P1_KEYS.left, P1_KEYS.right,
    P2_KEYS.up, P2_KEYS.down, P2_KEYS.left, P2_KEYS.right
  ]);
  // Touch: one d-pad for player 1 (two players is keyboard only).
  Arcade.touch.dpad({ up: P1_KEYS.up, down: P1_KEYS.down, left: P1_KEYS.left, right: P1_KEYS.right }, 'left');

  // ------------------------------------------------------------ loading
  function showLoading() {
    Arcade.ui.overlay({ title: 'Loading…', action: showLoading });
  }
  function loadImages() {
    var names = Object.keys(IMAGE_FILES);
    return Promise.all(names.map(function (n) {
      var img = new Image();
      img.src = 'images/' + IMAGE_FILES[n];
      return img.decode().then(function () { G.pics[n] = img; });
    }));
  }

  showLoading();
  loadImages().then(function () {
    var tiles = [];
    tiles[Track.ROAD] = G.pics.road; tiles[Track.WALL] = G.pics.wall; tiles[Track.GOAL] = G.pics.goal;
    tiles[Track.TREE] = G.pics.tree; tiles[Track.FLAG] = G.pics.flag;
    G.trackCanvas = Track.render(tiles);
    G.loaded = true;
    Arcade.ui.hideOverlay();
    restartCurrentMode();
    Arcade.loop(update, draw);
  }, function () {
    Arcade.ui.overlay({ title: 'Could not load', lines: ['The track images failed to load.'], hint: 'Reload the page to try again' });
  });

  // ------------------------------------------------------------ modes
  function restartCurrentMode() {
    if (!G.loaded) { showLoading(); return; }
    var blueStart = Track.starts[0], redStart = Track.starts[1];
    G.cars = [
      new Car({ name: 'Red', img: G.pics.p1, keys: P1_KEYS, x: redStart.x, y: redStart.y }),
      new Car({ name: 'Blue', img: G.pics.p2, keys: P2_KEYS, x: blueStart.x, y: blueStart.y })
    ];
  }

  // ------------------------------------------------------------ loop
  function controls(car) {
    var k = car.keys, inp = Arcade.input;
    return { gas: inp.isDown(k.up), reverse: inp.isDown(k.down), left: inp.isDown(k.left), right: inp.isDown(k.right) };
  }

  function update(dt) {
    G.cars.forEach(function (car) { car.update(dt, controls(car)); });
  }

  function draw(c) {
    c.drawImage(G.trackCanvas, 0, 0);
    G.cars.forEach(function (car) { car.draw(c); });
  }

  // Small debug/test handle (read-only use).
  window.CarRacing = { state: G };
})();
