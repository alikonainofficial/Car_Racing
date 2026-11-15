/*
 * car.js — car physics and drawing.
 * Units are pixels and seconds. The original ran per frame at 30 fps; the constants
 * below are those values converted to per-second rates.
 */
var CAR = {
  DRIVE_POWER: 450,     // px/s²  (0.5 px/frame per frame at 30 fps)
  REVERSE_POWER: 180,   // px/s²  (0.2 px/frame per frame)
  DECAY: 0.94,          // speed *= DECAY^(dt*30)
  TURN_RATE: 2.83,      // rad/s  (0.03π rad/frame)
  MIN_TURN_SPEED: 15    // px/s   (0.5 px/frame)
};

function Car(opts) {
  this.name = opts.name;
  this.img = opts.img;
  this.keys = opts.keys; // {up, down, left, right} as KeyboardEvent.code values
  this.reset(opts.x, opts.y);
}

Car.prototype.reset = function (x, y) {
  if (x != null) { this.homeX = x; this.homeY = y; }
  this.x = this.homeX;
  this.y = this.homeY;
  this.a = -Math.PI / 2; // facing up
  this.speed = 0;
};

// ctl = {gas, reverse, left, right} booleans
Car.prototype.update = function (dt, ctl) {
  var nextX = this.x + Math.cos(this.a) * this.speed * dt;
  var nextY = this.y + Math.sin(this.a) * this.speed * dt;
  if (!Track.isSolid(nextX, nextY)) {
    this.x = nextX; this.y = nextY;
  } else {
    this.speed = -0.5 * this.speed;
  }

  if (ctl.gas) {
    this.speed += CAR.DRIVE_POWER * dt;
  } else if (ctl.reverse) {
    this.speed -= CAR.REVERSE_POWER * dt;
  } else if (ctl.left && Math.abs(this.speed) >= CAR.MIN_TURN_SPEED) {
    this.a -= CAR.TURN_RATE * dt;
  } else if (ctl.right && Math.abs(this.speed) >= CAR.MIN_TURN_SPEED) {
    this.a += CAR.TURN_RATE * dt;
  }
  this.speed *= Math.pow(CAR.DECAY, dt * 30);
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
