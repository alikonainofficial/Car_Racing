/*
 * game.js — loading, loop, input, phases, laps and HUD for Car Racing.
 * Uses the shared cabinet shell (js/arcade-shell.js) through window.Arcade.
 */
(function () {
  'use strict';

  var LAPS = 3;
  var COUNTDOWN_MS = 3000;
  var GO_MS = 800;

  var P1_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  var P2_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };

  var IMAGE_FILES = {
    p1: 'player1.png', p2: 'player2.png',
    road: 'track_road.png', wall: 'track_wall.png', goal: 'track_goal.png',
    tree: 'track_tree.png', flag: 'track_flag.png'
  };

  var G = {
    loaded: false, pics: {}, trackCanvas: null, skidCanvas: null, skidCtx: null, flagTint: {},
    cars: [], active: [],
    phase: 'loading',       // loading → countdown → racing → finished
    countMs: 0, beeps: 0, raceMs: 0, lastNow: 0
  };

  Arcade.init({ game: 'racing', title: 'Car Racing', onRestart: restartCurrentMode, onPauseChange: onPauseChange });
  Arcade.input.capture([
    P1_KEYS.up, P1_KEYS.down, P1_KEYS.left, P1_KEYS.right,
    P2_KEYS.up, P2_KEYS.down, P2_KEYS.left, P2_KEYS.right
  ]);
  // Touch: one d-pad for player 1 (two players is keyboard only).
  Arcade.touch.dpad({ up: P1_KEYS.up, down: P1_KEYS.down, left: P1_KEYS.left, right: P1_KEYS.right }, 'left');

  function onPauseChange(paused) {
    if (paused) silenceEngines();
    else G.lastNow = performance.now(); // the race clock does not run while paused
  }

  // ------------------------------------------------------------ formatting
  function pad(n, w) { return Arcade.fmt.pad(n, w); }
  // 00:41.2 (HUD and overlays)
  function clock(ms) {
    ms = Math.max(0, ms);
    return pad(Math.floor(ms / 60000), 2) + ':' + pad(Math.floor(ms / 1000) % 60, 2) + '.' + (Math.floor(ms / 100) % 10);
  }

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
  function tintedFlag(color) {
    var cv = document.createElement('canvas'); cv.width = Track.TILE; cv.height = Track.TILE;
    var c = cv.getContext('2d');
    c.drawImage(G.pics.flag, 0, 0, Track.TILE, Track.TILE);
    c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.75;
    c.fillStyle = color; c.fillRect(0, 0, Track.TILE, Track.TILE);
    return cv;
  }

  showLoading();
  loadImages().then(function () {
    var tiles = [];
    tiles[Track.ROAD] = G.pics.road; tiles[Track.WALL] = G.pics.wall; tiles[Track.GOAL] = G.pics.goal;
    tiles[Track.TREE] = G.pics.tree; tiles[Track.FLAG] = G.pics.flag;
    G.trackCanvas = Track.render(tiles);
    var blueStart = Track.starts[0], redStart = Track.starts[1];
    G.cars = [
      new Car({ name: 'Red', color: Arcade.theme.red, img: G.pics.p1, keys: P1_KEYS, x: redStart.x, y: redStart.y }),
      new Car({ name: 'Blue', color: Arcade.theme.blue, img: G.pics.p2, keys: P2_KEYS, x: blueStart.x, y: blueStart.y })
    ];
    G.cars.forEach(function (car) { G.flagTint[car.name] = tintedFlag(car.color); });
    clearSkids();
    G.loaded = true;
    Arcade.ui.hideOverlay();
    restartCurrentMode();
    Arcade.loop(update, draw);
  }, function () {
    Arcade.ui.overlay({ title: 'Could not load', lines: ['The track images failed to load.'], hint: 'Reload the page to try again' });
  });

  // ------------------------------------------------------------ rounds
  function restartCurrentMode() {
    if (!G.loaded) { showLoading(); return; }
    startRound(G.cars);
  }

  function startRound(cars) {
    G.active = cars;
    G.cars.forEach(function (car) {
      car.reset();
      car.lap = 0; car.nextCp = 0; car.prevTile = -1;
      car.lapStart = 0; car.lapTimes = []; car.splits = [];
      car.finished = false; car.finishMs = 0;
    });
    clearSkids();
    Arcade.fx.clear();
    G.phase = 'countdown';
    G.countMs = 0; G.raceMs = 0; G.beeps = 0;
    G.lastNow = performance.now();
    countdownBeeps();
  }

  // 3 · 2 · 1 short beeps, GO long beep.
  function countdownBeeps() {
    while (G.beeps < 4 && G.countMs >= G.beeps * 1000) {
      Arcade.sfx.play('countdown', G.beeps === 3);
      G.beeps++;
    }
  }

  // Checkpoint and lap logic, run when a car's centre enters a new tile.
  function trackProgress(car) {
    var i = Track.indexAt(car.x, car.y);
    if (i === car.prevTile) return;
    car.prevTile = i;
    var cps = Track.checkpoints;
    if (car.nextCp < cps.length && i === cps[car.nextCp]) {
      car.nextCp++;
      car.splits.push(G.raceMs);
      Arcade.sfx.play('pickup');
    } else if (i >= 0 && Track.grid[i] === Track.GOAL && car.nextCp === cps.length) {
      car.lapTimes.push(G.raceMs - car.lapStart);
      car.lapStart = G.raceMs;
      car.lap++;
      car.nextCp = 0;
      if (car.lap >= LAPS) {
        car.finished = true; car.finishMs = G.raceMs;
        Arcade.sfx.play('win');
      } else {
        Arcade.sfx.play('score');
      }
    }
  }

  function finishRound() {
    G.phase = 'finished';
    silenceEngines();
    Arcade.store.bumpPlays();
    Arcade.ui.overlay({
      title: 'Finished',
      lines: G.active.map(function (car) { return car.name + ' ' + clock(car.finishMs); }),
      hint: 'Space or R to race again',
      action: restartCurrentMode
    });
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
  function engineAudible(car) {
    return (G.phase === 'countdown' || G.phase === 'racing') && G.active.indexOf(car) >= 0 &&
      !Arcade.isPaused() && !Arcade.ui.overlayVisible() && !Arcade.sfx.isMuted();
  }
  function syncEngines() {
    G.cars.forEach(function (car) {
      var e = car.engine; if (!e) return;
      var t = e.ac.currentTime;
      e.gain.gain.setTargetAtTime(engineAudible(car) ? 0.05 : 0, t, 0.03);
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
    var t = performance.now(), d = t - G.lastNow;
    G.lastNow = t;
    carEnv.skid = G.skidCtx;

    G.active.forEach(function (car) {
      var ctl = controls(car);
      if (ctl.gas || ctl.reverse || ctl.left || ctl.right) ensureEngine(car);
    });

    if (G.phase === 'countdown') {
      G.countMs += d;
      countdownBeeps();
      if (G.countMs >= COUNTDOWN_MS) { G.phase = 'racing'; G.raceMs = 0; }
    } else if (G.phase === 'racing') {
      G.raceMs += d;
      G.active.forEach(function (car) {
        if (car.finished) return;
        car.update(dt, controls(car), carEnv);
        trackProgress(car);
      });
      if (G.active.every(function (car) { return car.finished; })) finishRound();
    }
    hud();
  }

  function hud() {
    if (!G.active.length) return;
    Arcade.ui.hud({
      Lap: G.active.map(function (car) { return car.name + ' ' + Math.min(car.lap + 1, LAPS) + '/' + LAPS; }).join(' · '),
      Time: clock(G.raceMs)
    });
  }

  // Passed flags are tinted in the car's colour (split in halves for two cars); the next
  // flag each car needs is outlined in its colour.
  function drawCheckpoints(c) {
    var cps = Track.checkpoints, T = Track.TILE, n = G.active.length;
    cps.forEach(function (idx, k) {
      var p = Track.tileCenter(idx), x0 = p.x - T / 2, y0 = p.y - T / 2;
      G.active.forEach(function (car, ci) {
        var w = T / n, sx = ci * w;
        if (k < car.nextCp) c.drawImage(G.flagTint[car.name], sx, 0, w, T, x0 + sx, y0, w, T);
        if (k === car.nextCp && !car.finished && G.phase !== 'finished') {
          c.save();
          c.strokeStyle = car.color; c.lineWidth = 3;
          c.globalAlpha = 0.6 + 0.4 * Math.sin(performance.now() / 180);
          var inset = 2 + ci * 4;
          c.strokeRect(x0 + inset, y0 + inset, T - inset * 2, T - inset * 2);
          c.restore();
        }
      });
    });
  }

  function draw(c) {
    if (!G.loaded) return;
    c.drawImage(G.trackCanvas, 0, 0);
    c.drawImage(G.skidCanvas, 0, 0);
    drawCheckpoints(c);
    G.active.forEach(function (car) { car.draw(c); });
    if (G.phase === 'countdown') {
      Arcade.ui.banner(c, String(3 - Math.floor(G.countMs / 1000)), { size: 72, color: Arcade.theme.brassHi });
    } else if (G.phase === 'racing' && G.raceMs < GO_MS) {
      Arcade.ui.banner(c, 'GO!', { size: 72, color: Arcade.theme.green });
    }
    syncEngines();
  }

  // Small debug/test handle (read-only use).
  window.CarRacing = { state: G };
})();
