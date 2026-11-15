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

  Arcade.init({ game: 'racing', title: 'Car Racing', onRestart: restartCurrentMode, onPauseChange: onPauseChange });

  function onPauseChange(paused) {
    if (paused) silenceEngines();
  }
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
    if (!G.cars.length) {
      G.cars = [
        new Car({ name: 'Red', color: Arcade.theme.red, img: G.pics.p1, keys: P1_KEYS, x: redStart.x, y: redStart.y }),
        new Car({ name: 'Blue', color: Arcade.theme.blue, img: G.pics.p2, keys: P2_KEYS, x: blueStart.x, y: blueStart.y })
      ];
    }
    G.cars.forEach(function (car) { car.reset(); });
    clearSkids();
  }

  // ------------------------------------------------------------ effects
  function clearSkids() {
    if (!G.skidCanvas) {
      G.skidCanvas = document.createElement('canvas');
      G.skidCanvas.width = Track.COLS * Track.TILE; G.skidCanvas.height = Track.ROWS * Track.TILE;
      G.skidCtx = G.skidCanvas.getContext('2d');
    }
    G.skidCtx.clearRect(0, 0, G.skidCanvas.width, G.skidCanvas.height);
  }
  var carEnv = {
    onHit: function (x, y) {
      Arcade.fx.shake(3, 100);
      Arcade.sfx.play('thud');
      Arcade.fx.burst(x, y, { color: '#9a8f7a', count: 6, speed: 120, life: 0.3 });
    },
    onDust: function (x, y) {
      Arcade.fx.burst(x, y, { color: '#cdbf9c', count: 1, speed: 25, life: 0.6, size: 5, gravity: 0 });
    },
    skid: null
  };

  // ------------------------------------------------------------ engine sound
  // One sawtooth oscillator per car → lowpass 400 Hz → gain 0.05. Created on the first
  // driving input; silenced (gain 0) whenever an overlay is up, the game is paused or muted.
  function ensureEngine(car) {
    if (car.engine) return car.engine;
    var ac = Arcade.sfx.context();
    if (!ac || ac.state !== 'running') return null;
    var osc = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 60;
    lp.type = 'lowpass'; lp.frequency.value = 400;
    g.gain.value = 0;
    osc.connect(lp); lp.connect(g); g.connect(ac.destination);
    osc.start();
    car.engine = { osc: osc, gain: g, ac: ac };
    return car.engine;
  }
  function engineAudible() {
    return G.loaded && !Arcade.isPaused() && !Arcade.ui.overlayVisible() && !Arcade.sfx.isMuted();
  }
  function syncEngines() {
    var on = engineAudible();
    G.cars.forEach(function (car) {
      var e = car.engine; if (!e) return;
      var t = e.ac.currentTime;
      e.gain.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.03);
      e.osc.frequency.setTargetAtTime(60 + Math.abs(car.speed) * 0.5, t, 0.05);
    });
  }
  function silenceEngines() {
    G.cars.forEach(function (car) { if (car.engine) car.engine.gain.gain.setValueAtTime(0, car.engine.ac.currentTime); });
  }

  // ------------------------------------------------------------ loop
  function controls(car) {
    var k = car.keys, inp = Arcade.input;
    return { gas: inp.isDown(k.up), reverse: inp.isDown(k.down), left: inp.isDown(k.left), right: inp.isDown(k.right) };
  }

  function update(dt) {
    carEnv.skid = G.skidCtx;
    G.cars.forEach(function (car) {
      var ctl = controls(car);
      if (ctl.gas || ctl.reverse || ctl.left || ctl.right) ensureEngine(car);
      car.update(dt, ctl, carEnv);
    });
  }

  function draw(c) {
    c.drawImage(G.trackCanvas, 0, 0);
    c.drawImage(G.skidCanvas, 0, 0);
    G.cars.forEach(function (car) { car.draw(c); });
    syncEngines();
  }

  // Small debug/test handle (read-only use).
  window.CarRacing = { state: G };
})();
