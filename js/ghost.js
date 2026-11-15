/*
 * ghost.js — record, replay and store the Time Trial ghost.
 * Stored as arcade.racing.ghost = { time, hz: 20, samples: [x, y, a, x, y, a, …] }
 * with x, y in whole pixels and a (heading) in 1/100 rad, all integers.
 * Sample k is the car at race time k / hz seconds.
 */
var Ghost = (function () {
  'use strict';

  var HZ = 20;
  var STEP = 1000 / HZ;

  function Recorder() { this.samples = []; this.nextMs = 0; }
  // Call every frame while racing; adds a sample for each 50 ms boundary passed.
  Recorder.prototype.sample = function (raceMs, car) {
    while (raceMs >= this.nextMs) {
      this.samples.push(Math.round(car.x), Math.round(car.y), Math.round(car.a * 100));
      this.nextMs += STEP;
    }
  };

  function Player(data) {
    this.s = data.samples;
    this.hz = data.hz;
    this.n = data.samples.length / 3;
    this.time = data.time;
  }
  // Interpolated {x, y, a} at a race time, or null once the recording has ended.
  Player.prototype.at = function (raceMs) {
    var f = Math.max(0, raceMs) * this.hz / 1000, i = Math.floor(f), t = f - i, s = this.s;
    if (i >= this.n - 1) return null;
    var j = i * 3, k = j + 3;
    var a0 = s[j + 2] / 100, a1 = s[k + 2] / 100;
    var da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)); // shortest way round
    return { x: s[j] + (s[k] - s[j]) * t, y: s[j + 1] + (s[k + 1] - s[j + 1]) * t, a: a0 + da * t };
  };

  function valid(d) {
    return d && typeof d.time === 'number' && d.hz === HZ && Array.isArray(d.samples) &&
      d.samples.length >= 6 && d.samples.length % 3 === 0;
  }
  function load() {
    var d = Arcade.store.get('ghost', null);
    return valid(d) ? new Player(d) : null;
  }
  function save(time, recorder) {
    Arcade.store.set('ghost', { time: Math.round(time), hz: HZ, samples: recorder.samples });
  }

  return { HZ: HZ, Recorder: Recorder, Player: Player, load: load, save: save };
})();
