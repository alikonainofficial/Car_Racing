/*
 * game.js — loading, loop, input, modes, phases, HUD and overlays for Car Racing.
 * Uses the shared cabinet shell (js/arcade-shell.js) through window.Arcade.
 *
 * Modes:  Time Trial ('tt')  — 1 player, 3 laps, ghost of your best run, split deltas.
 *         Race ('race')      — 2 players, 3 laps per round, first to 2 round wins.
 * Phases: loading → menu → countdown → racing → finished | roundover | matchover
 */
(function () {
  'use strict';

  var LAPS = 3;
  var ROUNDS_TO_WIN = 2;
  var COUNTDOWN_MS = 3000;
  var GO_MS = 800;
  var POPUP_MS = 1200;
  var GHOST_ALPHA = 0.45;

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
    mode: Arcade.store.get('mode', 'tt') === 'race' ? 'race' : 'tt',
    phase: 'loading',
    countMs: 0, beeps: 0, raceMs: 0, lastNow: 0,
    overlay: null,            // options of the game's own overlay, to restore after a pause
    popups: [],               // split deltas / lap times shown next to a car
    // Time Trial
    recorder: null, ghost: null, bestSplits: null,
    // Race
    match: null
  };

  Arcade.init({ game: 'racing', title: 'Car Racing', onRestart: restartCurrentMode, onPauseChange: onPauseChange });
  Arcade.input.capture([
    P1_KEYS.up, P1_KEYS.down, P1_KEYS.left, P1_KEYS.right,
    P2_KEYS.up, P2_KEYS.down, P2_KEYS.left, P2_KEYS.right
  ]);
  // Touch: one d-pad for player 1 (two players is keyboard only).
  Arcade.touch.dpad({ up: P1_KEYS.up, down: P1_KEYS.down, left: P1_KEYS.left, right: P1_KEYS.right }, 'left');

  function onPauseChange(paused) {
    if (paused) { silenceEngines(); return; }
    G.lastNow = performance.now(); // the race clock does not run while paused
    // A tab switch can pause over a results/menu overlay; bring that overlay back.
    if (G.overlay && G.phase !== 'countdown' && G.phase !== 'racing') showOverlay(G.overlay);
  }

  // ------------------------------------------------------------ formatting
  function pad(n, w) { return Arcade.fmt.pad(n, w); }
  function tenths(ms) { return Math.floor(Math.max(0, ms) / 100); }
  // 00:41.2 — HUD and overlays
  function clock(ms) {
    var t = tenths(ms);
    return pad(Math.floor(t / 600), 2) + ':' + pad(Math.floor(t / 10) % 60, 2) + '.' + (t % 10);
  }
  // 1:58.4 — share line
  function shortClock(ms) {
    var t = tenths(ms);
    return Math.floor(t / 600) + ':' + pad(Math.floor(t / 10) % 60, 2) + '.' + (t % 10);
  }
  // 38.7 — share line, seconds
  function secs(ms) { return (tenths(ms) / 10).toFixed(1); }
  function minOf(arr) { return arr.length ? Math.min.apply(null, arr) : null; }
  function colored(car, text) { return '<span style="color:' + car.color + '">' + text + '</span>'; }

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
    G.cars.forEach(function (car) { G.flagTint[car.name] = tintedFlag(car.color); resetProgress(car); });
    clearSkids();
    G.loaded = true;
    showMenu();
    Arcade.loop(update, draw);
  }, function () {
    Arcade.ui.overlay({ title: 'Could not load', lines: ['The track images failed to load.'], hint: 'Reload the page to try again' });
  });

  // ------------------------------------------------------------ overlays
  function showOverlay(o) {
    G.overlay = o;
    Arcade.ui.overlay(o);
  }
  function modeName(m) { return m === 'race' ? 'Race' : 'Time Trial'; }

  function showMenu() {
    G.phase = 'menu';
    G.active = [];
    silenceEngines();
    showOverlay({
      title: 'Car Racing',
      lines: [
        'P1: arrows · P2: WASD',
        'Time Trial — 1 player, 3 laps, race your best run’s ghost',
        'Race — 2 players, 3 laps a round, best of 3'
      ],
      buttons: [
        { label: 'Time Trial', onClick: function () { chooseMode('tt'); } },
        { label: 'Race', onClick: function () { chooseMode('race'); } }
      ],
      hint: 'Space: ' + modeName(G.mode),
      action: function () { chooseMode(G.mode); }
    });
  }

  function unlockAudio() {
    var ac = Arcade.sfx.context();
    if (ac && ac.state === 'suspended') ac.resume();
  }

  function chooseMode(m) {
    G.mode = m;
    Arcade.store.set('mode', m);
    unlockAudio(); // overlay buttons sit above the canvas, so the shell has not unlocked audio yet
    startMode();
  }

  // R: restart the current mode at the countdown (a Race restarts the whole match).
  function restartCurrentMode() {
    if (!G.loaded) { showLoading(); return; }
    if (G.phase === 'menu') { showMenu(); return; }
    startMode();
  }

  function startMode() {
    G.overlay = null;
    if (G.mode === 'tt') {
      G.ghost = Ghost.load();
      var bs = Arcade.store.get('bestSplits', null);
      G.bestSplits = Array.isArray(bs) && bs.length === Track.checkpoints.length * LAPS ? bs : null;
      startRound([G.cars[0]]);
    } else {
      G.ghost = null; G.bestSplits = null;
      G.match = { wins: { Red: 0, Blue: 0 }, rounds: [] };
      startRound(G.cars);
    }
  }

  // ------------------------------------------------------------ rounds
  function resetProgress(car) {
    car.reset();
    car.lap = 0; car.nextCp = 0; car.prevTile = -1;
    car.lapStart = 0; car.lapTimes = []; car.splits = [];
    car.finished = false; car.finishMs = 0;
  }

  function startRound(cars) {
    Arcade.ui.hideOverlay();
    G.overlay = null;
    G.active = cars;
    G.cars.forEach(resetProgress);
    G.recorder = G.mode === 'tt' ? new Ghost.Recorder() : null;
    G.popups = [];
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

  function popup(car, text, color) {
    G.popups = G.popups.filter(function (p) { return p.car !== car; });
    G.popups.push({ car: car, text: text, color: color, until: G.raceMs + POPUP_MS });
  }

  // Checkpoint and lap logic, run when a car's centre enters a new tile.
  function trackProgress(car) {
    var i = Track.indexAt(car.x, car.y);
    if (i === car.prevTile) return;
    car.prevTile = i;
    var cps = Track.checkpoints;
    if (car.nextCp < cps.length && i === cps[car.nextCp]) {
      car.nextCp++;
      car.splits.push(Math.round(G.raceMs));
      Arcade.sfx.play('pickup');
      if (G.mode === 'tt' && G.bestSplits) {
        var d = G.raceMs - G.bestSplits[car.splits.length - 1];
        popup(car, Arcade.fmt.delta(d), d < 0 ? Arcade.theme.green : Arcade.theme.coral);
      }
    } else if (i >= 0 && Track.grid[i] === Track.GOAL && car.nextCp === cps.length) {
      var lapMs = G.raceMs - car.lapStart;
      car.lapTimes.push(Math.round(lapMs));
      car.lapStart = G.raceMs;
      car.lap++;
      car.nextCp = 0;
      if (car.lap >= LAPS) {
        car.finished = true; car.finishMs = Math.round(G.raceMs);
      } else {
        Arcade.sfx.play('score');
        popup(car, 'Lap ' + clock(lapMs), Arcade.theme.brassHi);
      }
    }
  }

  // ------------------------------------------------------------ results: Time Trial
  function finishTimeTrial(car) {
    G.phase = 'finished';
    silenceEngines();
    Arcade.sfx.play('win');
    var total = car.finishMs;
    var runBestLap = minOf(car.lapTimes);
    var res = Arcade.store.best('best', total, { lower: true });
    if (res.isNew) {
      Ghost.save(total, G.recorder);
      Arcade.store.set('bestSplits', car.splits.slice());
    }
    Arcade.store.best('bestLap', runBestLap, { lower: true });
    Arcade.store.bumpPlays();
    var shareText = '🏎️ Car Racing · ' + shortClock(total) + ' · best lap ' + secs(runBestLap) + ' s';
    showOverlay({
      kicker: 'Time Trial',
      title: clock(total),
      lines: [res.isNew ? 'New best!' : 'Best ' + clock(res.best), 'Best lap ' + clock(runBestLap)],
      buttons: [
        { label: 'Again', onClick: startMode },
        { label: 'Copy result', keepOpen: true, onClick: function () { Arcade.share.copy(shareText, 'Result copied'); } },
        { label: 'Change mode', onClick: showMenu }
      ],
      hint: 'Space: again',
      action: startMode
    });
  }

  // ------------------------------------------------------------ results: Race
  function finishRaceRound(winner) {
    var m = G.match;
    var red = G.cars[0], blue = G.cars[1], loser = winner === red ? blue : red;
    G.phase = 'roundover';
    silenceEngines();
    Arcade.sfx.play('win');
    m.wins[winner.name]++;
    var laps = [];
    G.cars.forEach(function (car) { car.lapTimes.forEach(function (t) { laps.push({ t: t, car: car }); }); });
    laps.sort(function (a, b) { return a.t - b.t; });
    var round = { n: m.rounds.length + 1, winner: winner, time: winner.finishMs, bestLap: laps[0] };
    m.rounds.push(round);
    var score = colored(red, 'Red ' + m.wins.Red) + ' · ' + colored(blue, 'Blue ' + m.wins.Blue);

    if (m.wins[winner.name] >= ROUNDS_TO_WIN) { finishMatch(winner); return; }

    showOverlay({
      kicker: 'Round ' + round.n,
      title: winner.name + ' wins the round',
      lines: [
        colored(winner, winner.name) + ' ' + clock(winner.finishMs) + ' · ' +
          colored(loser, loser.name) + ' on lap ' + Math.min(loser.lap + 1, LAPS) + '/' + LAPS,
        'Best lap ' + clock(round.bestLap.t) + ' (' + round.bestLap.car.name + ')',
        score
      ],
      buttons: [{ label: 'Next round', onClick: nextRound }],
      hint: 'Space: next round',
      action: nextRound
    });
  }
  function nextRound() { startRound(G.cars); }

  function finishMatch(winner) {
    var m = G.match;
    G.phase = 'matchover';
    Arcade.store.bumpPlays();
    var best = m.rounds.map(function (r) { return r.bestLap; }).sort(function (a, b) { return a.t - b.t; })[0];
    var other = winner.name === 'Red' ? 'Blue' : 'Red';
    var shareText = '🏎️ Red ' + m.wins.Red + '–' + m.wins.Blue + ' Blue · best lap ' + secs(best.t) + ' s';
    showOverlay({
      kicker: 'Race',
      title: winner.name + ' car wins ' + m.wins[winner.name] + '–' + m.wins[other],
      lines: m.rounds.map(function (r) {
        return 'Round ' + r.n + ': ' + colored(r.winner, r.winner.name) + ' · best lap ' + clock(r.bestLap.t) + ' (' + r.bestLap.car.name + ')';
      }),
      buttons: [
        { label: 'Rematch', onClick: startMode },
        { label: 'Copy result', keepOpen: true, onClick: function () { Arcade.share.copy(shareText, 'Result copied'); } },
        { label: 'Change mode', onClick: showMenu }
      ],
      hint: 'Space: rematch',
      action: startMode
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
  // Reduced motion: no screen shake and no dust; sounds stay.
  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(motionQuery && motionQuery.matches); }
  var carEnv = {
    onHit: function (x, y) {
      if (!reducedMotion()) Arcade.fx.shake(3, 100);
      Arcade.sfx.play('thud');
      Arcade.fx.burst(x, y, { color: '#9a8f7a', count: 6, speed: 120, life: 0.3 });
    },
    onDust: function (x, y) {
      if (reducedMotion()) return;
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
    return (G.phase === 'countdown' || G.phase === 'racing') && G.active.indexOf(car) >= 0 && !car.finished &&
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
      for (var n = 0; n < G.active.length; n++) {
        var car = G.active[n];
        if (car.finished) continue;
        car.update(dt, controls(car), carEnv);
        trackProgress(car);
        if (G.recorder && n === 0) G.recorder.sample(G.raceMs, car);
        if (car.finished) {
          if (G.mode === 'tt') finishTimeTrial(car); else finishRaceRound(car);
          break;
        }
      }
      G.popups = G.popups.filter(function (p) { return p.until > G.raceMs; });
    }
    hud();
  }

  function hud() {
    if (G.phase === 'menu' || !G.active.length) { Arcade.ui.hud({}); return; }
    var lapOf = function (car) { return 'Lap ' + Math.min(car.lap + 1, LAPS) + '/' + LAPS; };
    if (G.mode === 'tt') {
      var car = G.cars[0], best = Arcade.store.get('best', null), last = car.lapTimes[car.lapTimes.length - 1];
      Arcade.ui.hud({
        Lap: Math.min(car.lap + 1, LAPS) + '/' + LAPS,
        Time: clock(G.raceMs),
        Best: best == null ? '—' : clock(best),
        'Last lap': last == null ? '—' : clock(last)
      });
    } else {
      var red = G.cars[0], blue = G.cars[1], m = G.match, h = {};
      h['Round ' + Math.min(m.rounds.length + (G.phase === 'countdown' || G.phase === 'racing' ? 1 : 0), 3)] =
        colored(red, 'Red ' + m.wins.Red) + ' · ' + colored(blue, 'Blue ' + m.wins.Blue);
      h.Laps = colored(red, lapOf(red)) + ' · ' + colored(blue, lapOf(blue));
      h.Time = clock(G.raceMs);
      Arcade.ui.hud(h);
    }
  }

  // ------------------------------------------------------------ drawing
  // Passed flags are tinted in the car's colour (split in halves for two cars); the next
  // flag each car needs is outlined in its colour.
  function drawCheckpoints(c) {
    var cps = Track.checkpoints, T = Track.TILE, n = G.active.length;
    var live = G.phase === 'countdown' || G.phase === 'racing';
    cps.forEach(function (idx, k) {
      var p = Track.tileCenter(idx), x0 = p.x - T / 2, y0 = p.y - T / 2;
      G.active.forEach(function (car, ci) {
        var w = T / n, sx = ci * w;
        if (k < car.nextCp) c.drawImage(G.flagTint[car.name], sx, 0, w, T, x0 + sx, y0, w, T);
        if (k === car.nextCp && !car.finished && live) {
          c.save();
          c.strokeStyle = car.color; c.lineWidth = 3;
          c.globalAlpha = reducedMotion() ? 0.9 : 0.6 + 0.4 * Math.sin(performance.now() / 180);
          var inset = 2 + ci * 4;
          c.strokeRect(x0 + inset, y0 + inset, T - inset * 2, T - inset * 2);
          c.restore();
        }
      });
    });
  }

  function drawGhost(c) {
    if (!G.ghost || G.mode !== 'tt' || G.phase === 'menu') return;
    var p = G.ghost.at(G.phase === 'countdown' ? 0 : G.raceMs);
    if (!p) return;
    c.save();
    c.globalAlpha = GHOST_ALPHA;
    drawBitmapCenteredAtLocationWithRotation(c, G.pics.p1, p.x, p.y, p.a);
    c.restore();
  }

  function drawPopups(c) {
    G.popups.forEach(function (p) {
      c.save();
      c.font = '18px ' + Arcade.theme.fontHud; c.textBaseline = 'middle';
      var w = c.measureText(p.text).width + 12;
      var x = Math.min(Math.max(p.car.x + 26, 4), Track.COLS * Track.TILE - w - 4);
      var y = Math.min(Math.max(p.car.y - 30, 14), Track.ROWS * Track.TILE - 14);
      c.fillStyle = 'rgba(4, 9, 10, 0.75)'; c.fillRect(x, y - 12, w, 24);
      c.fillStyle = p.color; c.fillText(p.text, x + 6, y + 1);
      c.restore();
    });
  }

  function draw(c) {
    if (!G.loaded) return;
    c.drawImage(G.trackCanvas, 0, 0);
    c.drawImage(G.skidCanvas, 0, 0);
    if (G.phase !== 'menu') {
      drawCheckpoints(c);
      drawGhost(c);
      G.active.forEach(function (car) { car.draw(c); });
      drawPopups(c);
    }
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
