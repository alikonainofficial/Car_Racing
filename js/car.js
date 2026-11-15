/*
 * car.js — car physics and drawing.
 * Units are pixels and seconds. The original ran per frame at 30 fps; the power,
 * decay and turn constants below are those values converted to per-second rates.
 *
 * The car's state is a position, a heading `a` and a velocity vector (vx, vy).
 * Throttle pushes along the heading; each frame the velocity is blended toward the
 * heading (keeping its length), which gives a small slide when turning fast.
 */
var CAR = {
  DRIVE_POWER: 450,     // px/s²  (0.5 px/frame per frame at 30 fps)
  REVERSE_POWER: 180,   // px/s²  (0.2 px/frame per frame)
  DECAY: 0.94,          // v *= DECAY^(dt*30)
  TURN_RATE: 2.83,      // rad/s  (0.03π rad/frame)
  FULL_STEER_SPEED: 120,// px/s   steering scales up to full from 0 to this speed
  // Grip: v = lerp(v, heading×|v|, 1 − e^(−grip·dt)). The plan's 0.08^dt (grip 2.5/s)
  // made the car slide ~60° in every corner, so grip is tuned: firm at low speed,
  // looser near top speed (≈ 240 px/s) for a ~15° readable drift.
  GRIP_LOW: 22,         // 1/s at or below FULL_STEER_SPEED
  GRIP_HIGH: 9,         // 1/s at 240 px/s and above
  RADIUS: 10,           // px, collision probe distance from the centre
  RESTITUTION: 0.5,
  HIT_MIN_SPEED: 60,    // px/s into a wall before it counts as a hit (fx + sound)
  DUST_SPEED: 200,      // px/s
  DUST_EVERY: 0.04,     // s
  SKID_SLIP: 0.12,      // rad between heading and velocity before tyres mark the road
  SKID_SPEED: 150       // px/s
};

function Car(opts) {
  this.name = opts.name;
  this.color = opts.color;
  this.img = opts.img;
  this.keys = opts.keys; // {up, down, left, right} as KeyboardEvent.code values
  this.reset(opts.x, opts.y);
}

Car.prototype.reset = function (x, y) {
  if (x != null) { this.homeX = x; this.homeY = y; }
  this.x = this.homeX;
  this.y = this.homeY;
  this.a = -Math.PI / 2; // facing up
  this.vx = 0; this.vy = 0;
  this.speed = 0;        // signed speed along the heading (negative = reversing)
  this.dustT = 0;
  this.hitCooldown = 0;
  this.wheels = null;    // last rear-wheel positions for skid marks
};

// ctl = {gas, reverse, left, right} booleans
// env = {onHit(x, y, impact), onDust(x, y), skid: CanvasRenderingContext2D|null}
Car.prototype.update = function (dt, ctl, env) {
  var hx = Math.cos(this.a), hy = Math.sin(this.a);

  // Throttle and brake/reverse are independent of steering.
  if (ctl.gas) { this.vx += hx * CAR.DRIVE_POWER * dt; this.vy += hy * CAR.DRIVE_POWER * dt; }
  if (ctl.reverse) { this.vx -= hx * CAR.REVERSE_POWER * dt; this.vy -= hy * CAR.REVERSE_POWER * dt; }
  var decay = Math.pow(CAR.DECAY, dt * 30);
  this.vx *= decay; this.vy *= decay;

  var mag = Math.hypot(this.vx, this.vy);
  var fwd = this.vx * hx + this.vy * hy;    // + forward, − reversing
  var dir = fwd >= 0 ? 1 : -1;

  // Steering: full rate from FULL_STEER_SPEED up, none at a standstill; reversing flips it.
  var steer = (ctl.right ? 1 : 0) - (ctl.left ? 1 : 0);
  if (steer) {
    this.a += steer * dir * CAR.TURN_RATE * Math.min(1, mag / CAR.FULL_STEER_SPEED) * dt;
    this.a = Math.atan2(Math.sin(this.a), Math.cos(this.a));
    hx = Math.cos(this.a); hy = Math.sin(this.a);
  }

  // Drift: blend the velocity toward the heading, keeping its length.
  var t = Math.min(1, Math.max(0, (mag - CAR.FULL_STEER_SPEED) / CAR.FULL_STEER_SPEED));
  var grip = CAR.GRIP_LOW + (CAR.GRIP_HIGH - CAR.GRIP_LOW) * t;
  var k = 1 - Math.exp(-grip * dt);
  this.vx += (hx * dir * mag - this.vx) * k;
  this.vy += (hy * dir * mag - this.vy) * k;

  // Move one axis at a time so a wall hit tells us its normal.
  this.hitCooldown -= dt;
  var nx = this.x + this.vx * dt;
  if (Track.isSolid(nx + Math.sign(this.vx) * CAR.RADIUS, this.y)) {
    this._hit(Math.abs(this.vx), nx + Math.sign(this.vx) * CAR.RADIUS, this.y, env);
    this.vx = -CAR.RESTITUTION * this.vx;
  } else {
    this.x = nx;
  }
  var ny = this.y + this.vy * dt;
  if (Track.isSolid(this.x, ny + Math.sign(this.vy) * CAR.RADIUS)) {
    this._hit(Math.abs(this.vy), this.x, ny + Math.sign(this.vy) * CAR.RADIUS, env);
    this.vy = -CAR.RESTITUTION * this.vy;
  } else {
    this.y = ny;
  }

  mag = Math.hypot(this.vx, this.vy);
  this.speed = this.vx * hx + this.vy * hy;

  // Dust behind the car while turning fast.
  this.dustT -= dt;
  if (steer && Math.abs(this.speed) > CAR.DUST_SPEED && this.dustT <= 0) {
    this.dustT = CAR.DUST_EVERY;
    if (env && env.onDust) env.onDust(this.x - hx * 28, this.y - hy * 28);
  }

  // Skid marks from the rear wheels while sliding.
  var slip = mag > 1 ? Math.acos(Math.max(-1, Math.min(1, Math.abs(this.speed) / mag))) : 0;
  var wheels = this._rearWheels();
  if (env && env.skid && this.wheels && mag > CAR.SKID_SPEED && slip > CAR.SKID_SLIP) {
    var s = env.skid;
    s.strokeStyle = 'rgba(20, 20, 20, ' + Math.min(0.5, slip) + ')';
    s.lineWidth = 3; s.lineCap = 'round';
    s.beginPath();
    for (var i = 0; i < 2; i++) { s.moveTo(this.wheels[i].x, this.wheels[i].y); s.lineTo(wheels[i].x, wheels[i].y); }
    s.stroke();
  }
  this.wheels = wheels;
};

Car.prototype._rearWheels = function () {
  var hx = Math.cos(this.a), hy = Math.sin(this.a);
  var bx = this.x - hx * 20, by = this.y - hy * 20;
  return [{ x: bx - hy * 11, y: by + hx * 11 }, { x: bx + hy * 11, y: by - hx * 11 }];
};

Car.prototype._hit = function (impact, x, y, env) {
  if (impact < CAR.HIT_MIN_SPEED || this.hitCooldown > 0) return;
  this.hitCooldown = 0.15;
  if (env && env.onHit) env.onHit(x, y, impact);
};

function drawBitmapCenteredAtLocationWithRotation(c, img, x, y, ang) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.drawImage(img, -img.width / 2, -img.height / 2);
  c.restore();
}

Car.prototype.draw = function (c) {
  drawBitmapCenteredAtLocationWithRotation(c, this.img, this.x, this.y, this.a);
};
