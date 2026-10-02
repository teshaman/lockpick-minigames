/**
 * Lockpick Minigames — the six canvas minigames.
 * Every game extends MiniGame, draws into a 2D canvas and talks to its host
 * through three callbacks: done(success), hint(text) and bars({health, right}).
 */

export const TIERS = 15;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const sign = () => (Math.random() < 0.5 ? -1 : 1);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
/** Smallest angular distance between two angles in radians. */
const angDist = (a, b) => { let d = ((a - b) % TAU + TAU) % TAU; return d > Math.PI ? TAU - d : d; };

/** 0 for tier 1 … 1 for tier 15. */
export const tierT = tier => (clamp(Number(tier) || 1, 1, TIERS) - 1) / (TIERS - 1);

export function tierLabel(tier) {
  tier = clamp(Math.round(Number(tier) || 1), 1, TIERS);
  return `Lv.${tier} ${game.i18n.localize(`LPM.Tier.${tier}`)}`;
}

const PALETTE = {
  bg: "#0b0a14",
  gold: "#d8b24a",
  text: "#c8b67a",
  dim: "#6a6680",
  red: "#ff4b4b",
  green: "#5ad35a",
  blue: "#58a8ff"
};

/* ------------------------------------------------------------------ */
/*  Drawing helpers                                                    */
/* ------------------------------------------------------------------ */

function drawBackground(ctx, W, H, danger = 0) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, "rgba(70,58,105,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if ( danger > 0 ) {
    const r = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    r.addColorStop(0, "rgba(0,0,0,0)");
    r.addColorStop(1, `rgba(180,20,20,${0.6 * clamp(danger, 0, 1)})`);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }
}

/** A brass lock face: dark outer ring with rivets, rotating brass dome with a keyhole. */
function drawDial(ctx, cx, cy, r, rot = 0, glow = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  const outer = ctx.createRadialGradient(0, 0, r * 0.78, 0, 0, r);
  outer.addColorStop(0, "#5a4a2c");
  outer.addColorStop(1, "#211a0f");
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = outer; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#120d07"; ctx.stroke();
  for ( let i = 0; i < 12; i++ ) {
    const a = i * TAU / 12;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.025, 0, TAU);
    ctx.fillStyle = "#cfc4a8"; ctx.fill();
  }
  ctx.rotate(rot);
  const dome = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r * 0.78);
  dome.addColorStop(0, "#f2d87c");
  dome.addColorStop(0.6, "#b8912f");
  dome.addColorStop(1, "#5a4212");
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU);
  ctx.fillStyle = dome; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = "#2b1f0c"; ctx.stroke();
  if ( glow > 0 ) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.78);
    g.addColorStop(0, `rgba(255,232,150,${0.6 * glow})`);
    g.addColorStop(1, "rgba(255,232,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = "#120d06";
  ctx.beginPath(); ctx.arc(0, -r * 0.07, r * 0.085, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, -r * 0.03); ctx.lineTo(r * 0.05, -r * 0.03);
  ctx.lineTo(r * 0.075, r * 0.2); ctx.lineTo(-r * 0.075, r * 0.2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function label(ctx, text, x, y, { size = 13, color = PALETTE.text, align = "center", bold = false, caps = true } = {}) {
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}${size}px "Signika", "Segoe UI", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(caps ? String(text).toUpperCase() : String(text), x, y);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/*  Base class                                                         */
/* ------------------------------------------------------------------ */

export class MiniGame {
  static id = "base";
  static rightLabel = "LPM.Bar.Progress";
  static hintKey = "";

  constructor(canvas, tier, host) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tier = clamp(Math.round(Number(tier) || 1), 1, TIERS);
    this.t = tierT(this.tier);
    this.host = host;
    this.health = 100;
    this.running = false;
    this.mouse = { x: -1, y: -1, down: false, right: false };
    this.space = false;
    this.last = 0;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }
  /** Left button or Space. */
  get held() { return this.mouse.down || this.space; }

  start() {
    this.#bind();
    this.running = true;
    this.last = performance.now();
    this.hint(this.constructor.hintKey);
    this.setup();
    this.draw();
    this.pushBars();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    if ( this.raf ) cancelAnimationFrame(this.raf);
    this.#unbind();
  }

  loop = now => {
    if ( !this.running ) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.update(dt);
    if ( !this.running ) return;
    this.draw();
    this.pushBars();
    this.raf = requestAnimationFrame(this.loop);
  };

  /* Overridable --------------------------------------------------- */
  setup() {}
  update(dt) {}
  draw() {}
  right() { return { value: 0 }; }
  onMove(x, y) {}
  onDown(x, y) {}
  onUp() {}
  onRightDown(x, y) {}
  onRightUp() {}
  onLeave() {}
  onSpace(down) {}
  onBroken() { this.fail(); }

  /* Shared -------------------------------------------------------- */
  pushBars() {
    this.host.bars?.({
      health: clamp(this.health, 0, 100) / 100,
      right: this.right(),
      rightLabel: game.i18n.localize(this.constructor.rightLabel)
    });
  }

  hint(key, data = {}) {
    this.host.hint?.(key ? game.i18n.format(key, data) : "");
  }

  damage(amount) {
    if ( !this.running ) return;
    this.health -= amount;
    if ( this.health <= 0 ) {
      this.health = 0;
      this.onBroken();
    }
  }

  win() {
    if ( !this.running ) return;
    this.running = false;
    this.draw();
    this.pushBars();
    this.host.done?.(true);
  }

  fail() {
    if ( !this.running ) return;
    this.running = false;
    this.draw();
    this.pushBars();
    this.host.done?.(false);
  }

  /* Input --------------------------------------------------------- */
  #pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.W / r.width, y: (e.clientY - r.top) * this.H / r.height };
  }

  #bind() {
    const c = this.canvas;
    this._h = {
      move: e => { const p = this.#pos(e); this.mouse.x = p.x; this.mouse.y = p.y; this.onMove(p.x, p.y); },
      down: e => {
        const p = this.#pos(e);
        this.mouse.x = p.x; this.mouse.y = p.y;
        try { c.setPointerCapture(e.pointerId); } catch(err) {}
        if ( e.button === 0 ) { this.mouse.down = true; this.onDown(p.x, p.y); }
        else if ( e.button === 2 ) { this.mouse.right = true; this.onRightDown(p.x, p.y); }
      },
      up: e => {
        if ( e.button === 0 ) { this.mouse.down = false; this.onUp(); }
        else if ( e.button === 2 ) { this.mouse.right = false; this.onRightUp(); }
      },
      leave: () => { this.onLeave(); },
      key: e => {
        if ( e.code !== "Space" ) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if ( e.type === "keydown" ) {
          if ( !this.space ) { this.space = true; this.onSpace(true); }
        } else {
          this.space = false;
          this.onSpace(false);
        }
      },
      ctx: e => e.preventDefault()
    };
    c.addEventListener("pointermove", this._h.move);
    c.addEventListener("pointerdown", this._h.down);
    c.addEventListener("pointerup", this._h.up);
    c.addEventListener("pointerleave", this._h.leave);
    c.addEventListener("contextmenu", this._h.ctx);
    window.addEventListener("keydown", this._h.key, { capture: true });
    window.addEventListener("keyup", this._h.key, { capture: true });
  }

  #unbind() {
    if ( !this._h ) return;
    const c = this.canvas;
    c.removeEventListener("pointermove", this._h.move);
    c.removeEventListener("pointerdown", this._h.down);
    c.removeEventListener("pointerup", this._h.up);
    c.removeEventListener("pointerleave", this._h.leave);
    c.removeEventListener("contextmenu", this._h.ctx);
    window.removeEventListener("keydown", this._h.key, { capture: true });
    window.removeEventListener("keyup", this._h.key, { capture: true });
    this._h = null;
  }
}

/* ------------------------------------------------------------------ */
/*  1. Sweet Spot — the pick circles the whole dial; hold to turn      */
/* ------------------------------------------------------------------ */

export class SweetSpotGame extends MiniGame {
  static id = "sweetspot";
  static rightLabel = "LPM.Bar.Rotation";
  static hintKey = "LPM.Hint.sweetspot";

  setup() {
    this.cx = this.W / 2; this.cy = this.H / 2 + 6;
    this.r = Math.min(this.W, this.H) * 0.4;
    this.sweet = rnd(0, TAU);
    this.tol = lerp(12, 2.5, this.t) * Math.PI / 180;
    this.soft = lerp(45, 12, this.t) * Math.PI / 180;
    this.turnSpeed = lerp(75, 50, this.t) * Math.PI / 180;
    this.drain = lerp(45, 110, this.t);
    this.rot = 0;
    this.maxRot = Math.PI / 2;
    this.pickAngle = Math.PI / 2;
    this.stress = 0;
    this.turning = false;
  }

  update(dt) {
    if ( !this.held && this.mouse.x >= 0 ) this.pickAngle = Math.atan2(this.mouse.y - this.cy, this.mouse.x - this.cx);
    const d = angDist(this.pickAngle, this.sweet);
    const maxRot = (Math.PI / 2) * (1 - clamp((d - this.tol) / this.soft, 0, 1));
    this.maxRot = maxRot;
    if ( this.held ) {
      if ( !this.turning ) { this.turning = true; this.hint(""); }
      if ( this.rot < maxRot ) {
        this.rot = Math.min(maxRot, this.rot + this.turnSpeed * dt);
        this.stress = Math.max(0, this.stress - dt * 2);
      } else if ( maxRot < Math.PI / 2 ) {
        this.stress = Math.min(1, this.stress + dt * 4);
        this.damage(this.drain * dt);
      }
      if ( this.rot >= Math.PI / 2 - 1e-3 ) { this.rot = Math.PI / 2; this.win(); }
    } else {
      if ( this.turning ) { this.turning = false; this.hint(this.constructor.hintKey); }
      this.rot = Math.max(0, this.rot - 3.5 * dt);
      this.stress = Math.max(0, this.stress - dt * 3);
    }
  }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.stress * 0.8);
    const d = angDist(this.pickAngle, this.sweet);
    drawDial(ctx, this.cx, this.cy, this.r, this.rot, d <= this.tol ? 0.7 : 0);
    const a = this.pickAngle + this.rot;
    const shake = this.stress > 0 ? (Math.random() - 0.5) * this.stress * 10 : 0;
    const len = this.r * 1.25;
    const red = clamp(1 - this.health / 60, 0, 1);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(a);
    ctx.translate(0, shake);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, red > 0.3 ? "#ffd0d0" : "#f6f6fa");
    g.addColorStop(1, red > 0.1 ? `rgb(255,${Math.round(120 - 90 * red)},${Math.round(120 - 90 * red)})` : "#8a8a96");
    ctx.lineCap = "round";
    ctx.lineWidth = 6; ctx.strokeStyle = "#15151c";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = g; ctx.stroke();
    ctx.restore();
  }

  right() { return { value: this.rot / (Math.PI / 2) }; }
}

/* ------------------------------------------------------------------ */
/*  2. Dual Rotation — find the hidden spot (hot/cold), then track it  */
/* ------------------------------------------------------------------ */

export class DualRotationGame extends MiniGame {
  static id = "dual";
  static rightLabel = "LPM.Bar.Rotation";
  static hintKey = "LPM.Hint.dualSearch";

  setup() {
    this.cx = this.W / 2; this.cy = this.H / 2 + 6;
    this.r = Math.min(this.W, this.H) * 0.4;
    this.bound = this.r * 0.64;
    const a = rnd(0, TAU), d = rnd(0.2, 0.95) * this.bound;
    this.sx = this.cx + Math.cos(a) * d; this.sy = this.cy + Math.sin(a) * d;
    this.phase = "search";
    this.searchRadius = lerp(150, 70, this.t);
    this.captureFind = lerp(30, 12, this.t);
    this.capture = lerp(48, 16, this.t);
    this.speed = lerp(40, 150, this.t);
    this.vx = 0; this.vy = 0;
    this.turnIn = 0;
    this.foundTimer = 0;
    this.heat = 0;
    this.rot = 0;
    this.aligned = false;
    this.fillRate = lerp(40, 24, this.t) * Math.PI / 180;
    this.drain = lerp(35, 85, this.t);
  }

  update(dt) {
    const dist = this.mouse.x < 0 ? Infinity : Math.hypot(this.mouse.x - this.sx, this.mouse.y - this.sy);
    if ( this.phase === "search" ) {
      this.heat = clamp(1 - dist / this.searchRadius, 0, 1);
      if ( dist <= this.captureFind ) {
        this.foundTimer += dt;
        if ( this.foundTimer >= 0.35 ) {
          this.phase = "track";
          const a = rnd(0, TAU);
          this.vx = Math.cos(a) * this.speed; this.vy = Math.sin(a) * this.speed;
          this.turnIn = rnd(0.4, 1.2);
          this.hint("LPM.Hint.dualTrack");
        }
      } else this.foundTimer = 0;
      return;
    }
    this.turnIn -= dt;
    if ( this.turnIn <= 0 ) {
      const a = Math.atan2(this.vy, this.vx) + rnd(-2.2, 2.2);
      const s = this.speed * rnd(0.7, 1.3);
      this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
      this.turnIn = rnd(0.35, 1.1);
    }
    this.sx += this.vx * dt; this.sy += this.vy * dt;
    const dx = this.sx - this.cx, dy = this.sy - this.cy;
    const dd = Math.hypot(dx, dy);
    if ( dd > this.bound ) {
      const nx = dx / dd, ny = dy / dd;
      const dot = this.vx * nx + this.vy * ny;
      this.vx -= 2 * dot * nx; this.vy -= 2 * dot * ny;
      this.sx = this.cx + nx * this.bound; this.sy = this.cy + ny * this.bound;
    }
    this.aligned = dist <= this.capture;
    if ( this.held ) {
      if ( this.aligned ) {
        this.rot = Math.min(Math.PI / 2, this.rot + this.fillRate * dt);
        if ( this.rot >= Math.PI / 2 - 1e-3 ) return this.win();
      } else {
        this.damage(this.drain * dt);
      }
    } else {
      this.rot = Math.max(0, this.rot - 0.45 * dt);
    }
  }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.phase === "track" && this.held && !this.aligned ? 0.7 : 0);
    drawDial(ctx, this.cx, this.cy, this.r, this.rot, 0);
    if ( this.phase === "search" ) {
      if ( this.mouse.x >= 0 && this.heat > 0 ) {
        const rad = 30 + 90 * this.heat;
        const g = ctx.createRadialGradient(this.mouse.x, this.mouse.y, 0, this.mouse.x, this.mouse.y, rad);
        g.addColorStop(0, `rgba(255,236,160,${0.15 + 0.75 * this.heat})`);
        g.addColorStop(1, "rgba(255,214,90,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, rad, 0, TAU); ctx.fill();
      }
      if ( this.foundTimer > 0 ) {
        ctx.strokeStyle = "#9fd4ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.sx, this.sy, 6 + 10 * (1 - this.foundTimer / 0.35), 0, TAU); ctx.stroke();
      }
      return;
    }
    const g = ctx.createRadialGradient(this.sx, this.sy, 0, this.sx, this.sy, this.capture * 1.6);
    g.addColorStop(0, "rgba(255,244,180,0.95)");
    g.addColorStop(0.3, "rgba(255,214,90,0.5)");
    g.addColorStop(1, "rgba(255,214,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.sx, this.sy, this.capture * 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffe066";
    ctx.beginPath(); ctx.arc(this.sx, this.sy, 6, 0, TAU); ctx.fill();
    if ( this.mouse.x >= 0 ) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.aligned ? PALETTE.green : "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, 9, 0, TAU); ctx.stroke();
    }
  }

  right() { return { value: this.rot / (Math.PI / 2) }; }
}

/* ------------------------------------------------------------------ */
/*  3. Pin Tumbler — push a pin, catch it while it pauses at its notch */
/* ------------------------------------------------------------------ */

export class PinTumblerGame extends MiniGame {
  static id = "tumbler";
  static rightLabel = "LPM.Bar.Pins";
  static hintKey = "LPM.Hint.tumbler";

  setup() {
    this.n = Math.round(lerp(4, 8, this.t));
    this.errorsAllowed = Math.max(1, Math.round(lerp(6, 1, this.t)));
    this.errors = 0;
    this.riseSpeed = lerp(1.1, 2.6, this.t);
    this.fallSpeed = 3.2;
    this.pause = lerp(0.7, 0.18, this.t);
    const fakes = this.t > 0.55 ? Math.round(lerp(1, 3, (this.t - 0.55) / 0.45)) : 0;
    this.pins = Array.from({ length: this.n }, () => ({
      notch: rnd(0.35, 0.95),
      fake: null,
      state: "idle",
      pos: 0,
      pauseT: 0,
      known: false,
      set: false,
      flash: 0,
      passedFake: false,
      passedNotch: false
    }));
    for ( const p of this.pins.slice().sort(() => Math.random() - 0.5).slice(0, fakes) ) {
      p.fake = Math.random() < 0.5 ? rnd(0.12, p.notch - 0.15) : rnd(p.notch + 0.12, 0.98);
      if ( p.fake < 0.1 || p.fake > 0.99 ) p.fake = null;
    }
    this.frameW = Math.min(this.W - 60, this.n * 56 + 30);
    this.x0 = (this.W - this.frameW) / 2;
    this.colW = this.frameW / this.n;
    this.top = 78;
    this.bottom = this.H - 56;
    this.pinH = 46;
    this.base = 26;
    this.travel = this.bottom - this.base - this.top - this.pinH - 10;
  }

  update(dt) {
    for ( const p of this.pins ) {
      if ( p.flash > 0 ) p.flash = Math.max(0, p.flash - dt * 3);
      else if ( p.flash < 0 ) p.flash = Math.min(0, p.flash + dt * 3);
      if ( p.set ) continue;
      switch ( p.state ) {
        case "rise": {
          const next = p.pos + this.riseSpeed * dt;
          if ( p.fake !== null && !p.passedFake && p.pos < p.fake && next >= p.fake ) {
            p.pos = p.fake; p.passedFake = true; p.state = "fakepause"; p.pauseT = this.pause * 0.45;
          } else if ( !p.passedNotch && p.pos < p.notch && next >= p.notch ) {
            p.pos = p.notch; p.passedNotch = true; p.known = true; p.state = "pause"; p.pauseT = this.pause;
          } else if ( next >= 1 ) {
            p.pos = 1; p.state = "fall";
          } else p.pos = next;
          break;
        }
        case "pause":
        case "fakepause":
          p.pauseT -= dt;
          if ( p.pauseT <= 0 ) p.state = p.state === "pause" ? "fall" : "rise";
          break;
        case "fall":
          p.pos -= this.fallSpeed * dt;
          if ( p.pos <= 0 ) { p.pos = 0; p.state = "idle"; p.passedFake = false; p.passedNotch = false; }
          break;
      }
    }
  }

  onDown(x, y) {
    const i = Math.floor((x - this.x0) / this.colW);
    if ( i < 0 || i >= this.n ) return;
    const p = this.pins[i];
    if ( p.set ) return;
    if ( p.state === "idle" ) {
      p.state = "rise";
      p.passedFake = false; p.passedNotch = false;
      return;
    }
    if ( p.state === "pause" ) {
      p.set = true;
      p.pos = p.notch;
      p.flash = 1;
      if ( this.pins.every(q => q.set) ) this.win();
      return;
    }
    this.errors += 1;
    p.flash = -1;
    p.state = "fall";
    this.damage(100 / this.errorsAllowed + 0.01);
  }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, 0);
    const setCount = this.pins.filter(p => p.set).length;
    label(ctx, game.i18n.format("LPM.Tumbler.Remaining", { n: this.n - setCount }), this.W / 2, 26, { size: 13, bold: true });
    label(ctx, game.i18n.format("LPM.Tumbler.Errors", { n: Math.max(0, this.errorsAllowed - this.errors) }), this.W / 2, 46, { size: 11, color: PALETTE.dim });
    ctx.fillStyle = "#1b1a26";
    roundRect(ctx, this.x0 - 12, this.top - 12, this.frameW + 24, this.bottom - this.top + 24, 8);
    ctx.fill();
    ctx.strokeStyle = "#3a3450"; ctx.lineWidth = 1.5; ctx.stroke();
    const baseY = this.bottom - this.base;
    ctx.fillStyle = "#b8912f";
    ctx.fillRect(this.x0 - 12, baseY, this.frameW + 24, this.base + 12);
    for ( let i = 0; i < this.n; i++ ) {
      const p = this.pins[i];
      const cx = this.x0 + this.colW * (i + 0.5);
      const gw = Math.min(26, this.colW * 0.5);
      ctx.fillStyle = "#0d0c16";
      ctx.fillRect(cx - gw / 2, this.top, gw, baseY - this.top);
      const y = baseY - this.pinH - p.pos * this.travel;
      if ( p.known || p.set ) {
        const ny = baseY - this.pinH - p.notch * this.travel;
        ctx.fillStyle = p.set ? "rgba(216,178,74,0.9)" : "rgba(216,178,74,0.55)";
        ctx.fillRect(cx - gw / 2 - 6, ny - 1.5, 6, 3);
        ctx.fillRect(cx + gw / 2, ny - 1.5, 6, 3);
      }
      ctx.strokeStyle = "#6d6a7a"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      let yy = this.top + 4;
      ctx.moveTo(cx, yy);
      let k = 0;
      while ( yy < y - 4 ) {
        yy += 6;
        ctx.lineTo(cx + (k % 2 ? -5 : 5), Math.min(yy, y - 4));
        k++;
      }
      ctx.lineTo(cx, y);
      ctx.stroke();
      const pw = gw - 6;
      const g = ctx.createLinearGradient(0, y, 0, y + this.pinH);
      if ( p.set ) {
        g.addColorStop(0, "#f2d87c"); g.addColorStop(1, "#8a6d2a");
      } else if ( p.state === "pause" || p.state === "fakepause" ) {
        g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#c9c9d6");
        g.addColorStop(0.5, "#9fd4ff"); g.addColorStop(1, "#4a8fd6");
      } else {
        g.addColorStop(0, "#e9e9f0"); g.addColorStop(0.5, "#9a9aa6");
        g.addColorStop(0.5, "#6fb6ff"); g.addColorStop(1, "#2e6fb5");
      }
      ctx.fillStyle = g;
      roundRect(ctx, cx - pw / 2, y, pw, this.pinH, 4);
      ctx.fill();
      if ( p.flash ) {
        ctx.fillStyle = p.flash > 0 ? `rgba(120,255,140,${0.5 * p.flash})` : `rgba(255,70,70,${0.6 * -p.flash})`;
        roundRect(ctx, cx - pw / 2, y, pw, this.pinH, 4);
        ctx.fill();
      }
      ctx.fillStyle = "#2b1f0c";
      ctx.beginPath();
      ctx.moveTo(cx - 5, baseY + 8); ctx.lineTo(cx + 5, baseY + 8); ctx.lineTo(cx, baseY + 16);
      ctx.closePath(); ctx.fill();
      if ( p.state === "idle" && !p.set ) {
        ctx.fillStyle = "rgba(216,178,74,0.5)";
        ctx.beginPath(); ctx.moveTo(cx - 4, baseY + 20); ctx.lineTo(cx + 4, baseY + 20); ctx.lineTo(cx, baseY + 14); ctx.closePath(); ctx.fill();
      }
    }
  }

  right() {
    const setCount = this.pins.filter(p => p.set).length;
    return { value: setCount / this.n, text: `${setCount}/${this.n}` };
  }
}

/* ------------------------------------------------------------------ */
/*  4. Skill Check — click when the sweep hits the drifting arc        */
/* ------------------------------------------------------------------ */

export class SkillCheckGame extends MiniGame {
  static id = "skillcheck";
  static rightLabel = "LPM.Bar.Hits";
  static hintKey = "LPM.Hint.skillcheck";

  setup() {
    this.cx = this.W / 2; this.cy = this.H / 2 + 10;
    this.R = Math.min(this.W, this.H) * 0.36;
    this.width = 34;
    this.need = Math.round(lerp(3, 7, this.t));
    this.hits = 0;
    this.a = rnd(0, TAU);
    this.omega = lerp(2.0, 6.0, this.t) * sign();
    this.zoneW = lerp(1.1, 0.28, this.t);
    this.capW = this.zoneW * 0.22;
    this.drift = lerp(0.1, 1.1, this.t);
    this.missDmg = lerp(40, 60, this.t);
    this.flash = 0;
    this.newZone();
  }

  newZone() {
    const ahead = rnd(1.2, 4.0) * Math.sign(this.omega);
    this.zone = (this.a + ahead + TAU) % TAU;
  }

  /** 0 = miss, 1 = yellow body, 2 = blue cap. */
  inZone() {
    const d = angDist(this.a, this.zone);
    if ( d > this.zoneW / 2 ) return 0;
    return d >= this.zoneW / 2 - this.capW ? 2 : 1;
  }

  update(dt) {
    this.a = (this.a + this.omega * dt + TAU) % TAU;
    this.zone = (this.zone - Math.sign(this.omega) * this.drift * dt + TAU) % TAU;
    if ( this.flash > 0 ) this.flash = Math.max(0, this.flash - dt * 3);
    else if ( this.flash < 0 ) this.flash = Math.min(0, this.flash + dt * 3);
  }

  attempt() {
    if ( !this.running ) return;
    const z = this.inZone();
    if ( z ) {
      this.hits = Math.min(this.need, this.hits + z);
      this.flash = 1;
      if ( this.hits >= this.need ) return this.win();
      this.omega *= lerp(1.02, 1.12, this.t) * (Math.random() < lerp(0.2, 0.45, this.t) ? -1 : 1);
      this.newZone();
    } else {
      this.flash = -1;
      this.damage(this.missDmg);
    }
  }

  onDown() { this.attempt(); }
  onSpace(down) { if ( down ) this.attempt(); }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.flash < 0 ? -this.flash : 0);
    label(ctx, `${this.hits}/${this.need}`, this.cx, 28, { size: 18, bold: true, color: PALETTE.gold });
    ctx.lineWidth = this.width;
    ctx.strokeStyle = "#2a2838";
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = "#4a4660";
    for ( let i = 0; i < 24; i++ ) {
      const a = i * TAU / 24;
      ctx.beginPath();
      ctx.moveTo(this.cx + Math.cos(a) * (this.R - this.width / 2), this.cy + Math.sin(a) * (this.R - this.width / 2));
      ctx.lineTo(this.cx + Math.cos(a) * (this.R + this.width / 2), this.cy + Math.sin(a) * (this.R + this.width / 2));
      ctx.stroke();
    }
    const z0 = this.zone - this.zoneW / 2, z1 = this.zone + this.zoneW / 2;
    ctx.lineWidth = this.width - 4;
    ctx.strokeStyle = this.flash > 0 ? "#8fe08f" : "#e4c04a";
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, z0, z1); ctx.stroke();
    ctx.strokeStyle = this.flash > 0 ? "#bdf3bd" : "#6fb6ff";
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, z0, z0 + this.capW); ctx.stroke();
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, z1 - this.capW, z1); ctx.stroke();
    drawDial(ctx, this.cx, this.cy, this.R * 0.42, 0, 0);
    const nx = this.cx + Math.cos(this.a) * (this.R + this.width / 2 + 8);
    const ny = this.cy + Math.sin(this.a) * (this.R + this.width / 2 + 8);
    ctx.lineCap = "round";
    ctx.lineWidth = 4; ctx.strokeStyle = PALETTE.red;
    ctx.beginPath();
    ctx.moveTo(this.cx + Math.cos(this.a) * (this.R - this.width / 2 - 6), this.cy + Math.sin(this.a) * (this.R - this.width / 2 - 6));
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.fillStyle = "#ffd6d6";
    ctx.beginPath(); ctx.arc(nx, ny, 5, 0, TAU); ctx.fill();
  }

  right() { return { value: this.hits / this.need, text: `${this.hits}/${this.need}` }; }
}

/* ------------------------------------------------------------------ */
/*  5. Tension — keep the marker in the moving band, click targets     */
/* ------------------------------------------------------------------ */

export class TensionGame extends MiniGame {
  static id = "tension";
  static rightLabel = "LPM.Bar.Targets";
  static hintKey = "LPM.Hint.tension";

  setup() {
    this.started = false;
    this.tension = 0;
    this.rise = lerp(0.9, 1.6, this.t);
    this.fall = lerp(0.7, 1.3, this.t);
    this.bandHalf = lerp(0.15, 0.045, this.t);
    this.bandC = rnd(0.35, 0.65);
    this.bandV = lerp(0.05, 0.28, this.t) * sign();
    this.need = Math.round(lerp(4, 9, this.t));
    this.count = 0;
    this.gx = 56; this.gw = 34; this.gTop = 50; this.gBot = this.H - 44;
    this.cx = this.W / 2 + 36; this.cy = this.H / 2 + 8;
    this.r = Math.min(this.W, this.H) * 0.36;
    this.target = null;
    this.ttl = lerp(3.5, 1.6, this.t);
    this.targetTTL = 0;
    this.missDmg = lerp(30, 45, this.t);
    this.expireDmg = lerp(0, 25, this.t);
    this.gaugeHeld = false;
    this.flash = 0;
    this.pulse = 0;
  }

  get pressing() { return this.space || this.mouse.right || this.gaugeHeld; }

  inGauge(x, y) {
    return x >= this.gx - 14 && x <= this.gx + this.gw + 14 && y >= this.gTop - 12 && y <= this.gBot + 12;
  }

  newTarget() {
    const a = rnd(0, TAU);
    const d = rnd(0.15, 0.82) * this.r;
    this.target = { x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d };
    this.targetTTL = this.ttl;
  }

  inBand() { return Math.abs(this.tension - this.bandC) <= this.bandHalf; }

  update(dt) {
    this.pulse += dt;
    if ( this.flash > 0 ) this.flash = Math.max(0, this.flash - dt * 3);
    else if ( this.flash < 0 ) this.flash = Math.min(0, this.flash + dt * 3);
    if ( !this.started ) return;
    this.tension = clamp(this.tension + (this.pressing ? this.rise : -this.fall) * dt, 0, 1);
    this.bandC += this.bandV * dt;
    const lo = 0.12 + this.bandHalf, hi = 0.86 - this.bandHalf;
    if ( this.bandC < lo ) { this.bandC = lo; this.bandV = Math.abs(this.bandV); }
    if ( this.bandC > hi ) { this.bandC = hi; this.bandV = -Math.abs(this.bandV); }
    if ( Math.random() < dt * lerp(0.3, 0.9, this.t) ) this.bandV *= -1;
    if ( this.tension >= 0.95 ) this.damage(50 * dt);
    this.targetTTL -= dt;
    if ( this.targetTTL <= 0 ) {
      if ( this.expireDmg > 0 ) { this.flash = -1; this.damage(this.expireDmg); }
      if ( this.running ) this.newTarget();
    }
  }

  onDown(x, y) {
    if ( this.inGauge(x, y) ) { this.gaugeHeld = true; if ( this.started ) return; }
    if ( !this.started ) {
      this.started = true;
      this.newTarget();
      this.hint("LPM.Hint.tensionGo");
      return;
    }
    if ( !this.target ) return;
    if ( Math.hypot(x - this.target.x, y - this.target.y) <= 18 ) {
      if ( this.inBand() ) {
        this.count += 1;
        this.flash = 1;
        if ( this.count >= this.need ) return this.win();
        this.newTarget();
      } else {
        this.flash = -1;
        this.damage(this.missDmg);
      }
    }
  }

  onUp() { this.gaugeHeld = false; }
  onLeave() { this.gaugeHeld = false; }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.tension >= 0.95 ? 0.8 : (this.flash < 0 ? -this.flash : 0));
    const gh = this.gBot - this.gTop;
    ctx.fillStyle = "#15141f";
    roundRect(ctx, this.gx, this.gTop, this.gw, gh, 6); ctx.fill();
    ctx.strokeStyle = this.pressing ? "#d8b24a" : "#8a6d2a"; ctx.lineWidth = 2; ctx.stroke();
    const bandTop = this.gBot - (this.bandC + this.bandHalf) * gh;
    ctx.fillStyle = "rgba(90,211,90,0.28)";
    ctx.fillRect(this.gx + 2, bandTop, this.gw - 4, this.bandHalf * 2 * gh);
    ctx.strokeStyle = "rgba(90,211,90,0.7)"; ctx.lineWidth = 1;
    ctx.strokeRect(this.gx + 2, bandTop, this.gw - 4, this.bandHalf * 2 * gh);
    const fillH = this.tension * gh;
    const inBand = this.inBand();
    ctx.fillStyle = this.tension >= 0.95 ? "rgba(255,75,75,0.5)" : (inBand ? "rgba(90,211,90,0.45)" : "rgba(127,154,112,0.35)");
    ctx.fillRect(this.gx + 4, this.gBot - fillH, this.gw - 8, fillH);
    const my = this.gBot - fillH;
    ctx.fillStyle = this.tension >= 0.95 ? PALETTE.red : (inBand ? PALETTE.green : "#c9c2a8");
    roundRect(ctx, this.gx - 4, my - 3, this.gw + 8, 6, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,60,60,0.85)";
    roundRect(ctx, this.gx, this.gTop - 4, this.gw, 10, 4); ctx.fill();
    ctx.save();
    ctx.translate(this.gx - 12, this.gTop + gh / 2);
    ctx.rotate(-Math.PI / 2);
    label(ctx, game.i18n.localize("LPM.Tension.Label"), 0, 0, { size: 11, color: PALETTE.dim });
    ctx.restore();
    const dome = ctx.createRadialGradient(this.cx - this.r * 0.3, this.cy - this.r * 0.3, 10, this.cx, this.cy, this.r);
    dome.addColorStop(0, "#3d3c48");
    dome.addColorStop(1, "#14131c");
    ctx.fillStyle = dome;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#2a2838"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#6d6a7a";
    for ( let i = 0; i < 8; i++ ) {
      const a = i * TAU / 8;
      ctx.beginPath(); ctx.arc(this.cx + Math.cos(a) * this.r * 0.9, this.cy + Math.sin(a) * this.r * 0.9, 2, 0, TAU); ctx.fill();
    }
    if ( !this.started ) {
      label(ctx, game.i18n.localize("LPM.Tension.Start"), this.cx, this.cy, { size: 16, bold: true, color: PALETTE.gold });
      ctx.strokeStyle = "rgba(216,178,74,0.6)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 22 + Math.sin(this.pulse * 4) * 3, 0, TAU); ctx.stroke();
    } else if ( this.target ) {
      const pr = 7 + Math.sin(this.pulse * 6) * 1.5;
      const g = ctx.createRadialGradient(this.target.x, this.target.y, 0, this.target.x, this.target.y, 30);
      g.addColorStop(0, "rgba(255,230,120,0.7)");
      g.addColorStop(1, "rgba(255,230,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.target.x, this.target.y, 30, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,230,120,0.7)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.target.x, this.target.y, 18, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.targetTTL / this.ttl, 0, 1)); ctx.stroke();
      ctx.fillStyle = inBand ? "#ffe066" : "#b89a3a";
      ctx.beginPath(); ctx.arc(this.target.x, this.target.y, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#120d06"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  right() { return { value: this.count / this.need, text: `${this.count}/${this.need}` }; }
}

/* ------------------------------------------------------------------ */
/*  6. Ward Trace — guide the cursor along a different keyway each time */
/* ------------------------------------------------------------------ */

/** Collapse runs of collinear points. */
function simplify(pts) {
  const out = [pts[0]];
  for ( let i = 1; i < pts.length - 1; i++ ) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    if ( Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 0.5 ) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Keyway generators. Each returns either an array of points (the safe path, S at the
 * first point, E at the last) or {pts, extra} where extra is a list of [a, b] segments
 * that are also safe corridors but give no progress (maze dead ends).
 */
export const KEYWAYS = {
  zigzag(W, H, t) {
    const k = Math.round(lerp(5, 13, t));
    const pts = [];
    for ( let i = 0; i <= k; i++ ) {
      const x = 60 + (W - 120) * i / k;
      const y = (i === 0 || i === k) ? H / 2 : (i % 2 ? rnd(55, H / 2 - 25) : rnd(H / 2 + 25, H - 55));
      pts.push({ x, y });
    }
    return pts;
  },
  wave(W, H, t) {
    const f1 = rnd(1.5, 2.5 + 2.5 * t), f2 = rnd(4, 7 + 4 * t);
    const a1 = rnd(70, 110), a2 = lerp(10, 45, t);
    const p1 = rnd(0, TAU), p2 = rnd(0, TAU);
    const pts = [];
    const n = 60;
    for ( let i = 0; i <= n; i++ ) {
      const u = i / n;
      const x = 60 + (W - 120) * u;
      const env = Math.sin(u * Math.PI);
      pts.push({ x, y: H / 2 + env * (a1 * Math.sin(f1 * u * TAU / 2 + p1) + a2 * Math.sin(f2 * u * TAU / 2 + p2)) });
    }
    return pts;
  },
  stairs(W, H, t) {
    const pts = [{ x: 50, y: rnd(H * 0.35, H * 0.65) }];
    let x = 50, y = pts[0].y;
    while ( x < W - 60 ) {
      x = Math.min(W - 50, x + rnd(lerp(70, 35, t), lerp(110, 60, t)));
      pts.push({ x, y });
      if ( x >= W - 50 ) break;
      const dir = y > H / 2 ? -1 : 1;
      y = clamp(y + dir * rnd(lerp(40, 60, t), lerp(90, 130, t)), 50, H - 50);
      pts.push({ x, y });
    }
    return pts;
  },
  serpentine(W, H, t, halfW) {
    const rows = Math.round(lerp(3, 6, t));
    const gap = Math.max(halfW * 3 + 8, (H - 100) / rows);
    const y0 = H / 2 - gap * (rows - 1) / 2;
    const pts = [];
    for ( let r = 0; r < rows; r++ ) {
      const y = y0 + r * gap;
      const left = { x: 50, y }, right = { x: W - 50, y };
      pts.push(r % 2 ? right : left, r % 2 ? left : right);
    }
    return pts;
  },
  hairpins(W, H, t, halfW) {
    const cols = Math.round(lerp(4, 8, t));
    const gap = Math.max(halfW * 3 + 8, (W - 120) / cols);
    const x0 = W / 2 - gap * (cols - 1) / 2;
    const pts = [];
    const flip = Math.random() < 0.5;
    for ( let c = 0; c < cols; c++ ) {
      const x = x0 + c * gap;
      const top = { x, y: 50 }, bottom = { x, y: H - 50 };
      const down = (c % 2 === 0) !== flip;
      pts.push(down ? top : bottom, down ? bottom : top);
    }
    return pts;
  },
  orbit(W, H, t, halfW) {
    const cx = W / 2, cy = H / 2;
    const gap = Math.max(halfW * 3 + 8, lerp(95, 40, t));
    const Rmax = Math.min(W, H) / 2 - 30;
    const levels = Math.max(2, Math.floor((Rmax - 40) / gap) + 1);
    const radii = Array.from({ length: levels }, (_, i) => Rmax - i * gap);
    const pts = [];
    let a = rnd(0, TAU);
    const dir = sign();
    const hops = Math.round(lerp(3, 7, t));
    let level = Math.floor(Math.random() * levels);
    for ( let h = 0; h < hops; h++ ) {
      const sweep = rnd(0.6, 1.6);
      const steps = Math.ceil(sweep / 0.12);
      for ( let i = (h === 0 ? 0 : 1); i <= steps; i++ ) {
        const ang = a + dir * sweep * i / steps;
        pts.push({ x: cx + Math.cos(ang) * radii[level], y: cy + Math.sin(ang) * radii[level] });
      }
      a += dir * sweep;
      const next = clamp(level + pick([-1, 1]), 0, levels - 1);
      if ( next !== level && h < hops - 1 ) {
        level = next;
        pts.push({ x: cx + Math.cos(a) * radii[level], y: cy + Math.sin(a) * radii[level] });
      }
    }
    return pts;
  },
  petal(W, H, t) {
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - 36;
    const k = Math.round(lerp(3, 6, t));
    const amp = lerp(0.18, 0.28, t);
    const a0 = rnd(0, TAU);
    const pts = [];
    const n = 90;
    for ( let i = 0; i <= n; i++ ) {
      const th = 0.2 + (TAU - 0.4) * i / n;
      const r = R * (0.72 + amp * Math.sin(k * th));
      pts.push({ x: cx + Math.cos(a0 + th) * r, y: cy + Math.sin(a0 + th) * r });
    }
    return pts;
  },
  spiral(W, H, t, halfW) {
    const cx = W / 2, cy = H / 2;
    const step = Math.max(halfW * 3 + 10, lerp(46, 34, t));
    const turns = Math.round(lerp(1.5, 2.5, t) * 4);
    let w = Math.min(W, H) - 60, h = w;
    const pts = [{ x: cx - w / 2, y: cy + h / 2 }];
    let x = cx - w / 2, y = cy + h / 2;
    const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]];
    let len = w;
    for ( let i = 0; i < turns; i++ ) {
      const [dx, dy] = dirs[i % 4];
      x += dx * len; y += dy * len;
      pts.push({ x, y });
      if ( i % 2 === 1 ) len -= step;
      if ( len < step ) break;
    }
    return pts;
  },
  walk(W, H, t, halfW) {
    const cell = Math.max(halfW * 3 + 8, lerp(60, 44, t));
    const cols = Math.floor((W - 100) / cell), rows = Math.floor((H - 80) / cell);
    const x0 = (W - cols * cell) / 2, y0 = (H - rows * cell) / 2;
    let c = 0, r = Math.floor(rows / 2);
    const pts = [{ x: x0 + c * cell, y: y0 + r * cell }];
    let lastV = 0;
    while ( c < cols ) {
      const v = Math.random() < lerp(0.45, 0.7, t) ? pick([-1, 1]) : 0;
      if ( v !== 0 && v !== -lastV ) {
        const run = Math.round(rnd(1, Math.max(1, rows / 2)));
        const nr = clamp(r + v * run, 0, rows);
        if ( nr !== r ) { r = nr; pts.push({ x: x0 + c * cell, y: y0 + r * cell }); lastV = v; }
      } else lastV = 0;
      c += 1;
      pts.push({ x: x0 + c * cell, y: y0 + r * cell });
    }
    return pts;
  },
  maze(W, H, t, halfW) {
    const cell = Math.max(halfW * 3 + 8, lerp(66, 44, t));
    const cols = Math.max(3, Math.floor((W - 70) / cell)), rows = Math.max(2, Math.floor((H - 60) / cell));
    const x0 = (W - (cols - 1) * cell) / 2, y0 = (H - (rows - 1) * cell) / 2;
    const key = (c, r) => r * cols + c;
    const N = cols * rows;
    const adj = Array.from({ length: N }, () => []);
    const seen = new Uint8Array(N);
    const startRow = Math.floor(Math.random() * rows);
    const stack = [[0, startRow]];
    seen[key(0, startRow)] = 1;
    while ( stack.length ) {
      const [c, r] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [c + dx, r + dy])
        .filter(([nc, nr]) => nc >= 0 && nc < cols && nr >= 0 && nr < rows && !seen[key(nc, nr)]);
      if ( !nb.length ) { stack.pop(); continue; }
      const [nc, nr] = pick(nb);
      seen[key(nc, nr)] = 1;
      adj[key(c, r)].push(key(nc, nr));
      adj[key(nc, nr)].push(key(c, r));
      stack.push([nc, nr]);
    }
    const startK = key(0, startRow);
    const dist = new Int32Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
    const q = [startK]; dist[startK] = 0;
    while ( q.length ) {
      const u = q.shift();
      for ( const v of adj[u] ) if ( dist[v] < 0 ) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); }
    }
    let endK = -1;
    for ( let r = 0; r < rows; r++ ) { const k = key(cols - 1, r); if ( endK < 0 || dist[k] > dist[endK] ) endK = k; }
    const cells = [];
    for ( let u = endK; u !== -1; u = prev[u] ) cells.push(u);
    cells.reverse();
    const P = k => ({ x: x0 + (k % cols) * cell, y: y0 + Math.floor(k / cols) * cell });
    const onPath = new Uint8Array(N);
    for ( const k of cells ) onPath[k] = 1;
    const extra = [];
    for ( let u = 0; u < N; u++ ) for ( const v of adj[u] ) {
      if ( v < u ) continue;
      if ( onPath[u] && onPath[v] && Math.abs(cells.indexOf(u) - cells.indexOf(v)) === 1 ) continue;
      extra.push([P(u), P(v)]);
    }
    return { pts: simplify(cells.map(P)), extra };
  }
};

export class WardTraceGame extends MiniGame {
  static id = "trace";
  static rightLabel = "LPM.Bar.Progress";
  static hintKey = "LPM.Hint.trace";

  setup() {
    this.halfW = lerp(30, 9, this.t);
    const names = this.t < 0.2 ? ["zigzag", "wave", "stairs"]
      : (this.t < 0.5 ? ["zigzag", "wave", "stairs", "serpentine", "hairpins", "walk", "orbit"] : Object.keys(KEYWAYS));
    this.kind = pick(names);
    this.build(this.kind);
    this.fog = this.t > 0.5 ? lerp(230, 80, (this.t - 0.5) * 2) : 0;
    this.state = "idle";
    this.progress = 0;
    this.hitDmg = lerp(40, 100, this.t);
    this.flash = 0;
  }

  build(kind) {
    const made = KEYWAYS[kind](this.W, this.H, this.t, this.halfW);
    this.pts = Array.isArray(made) ? made : made.pts;
    this.extra = Array.isArray(made) ? [] : (made.extra ?? []);
    this.total = 0;
    this.lens = [];
    for ( let i = 1; i < this.pts.length; i++ ) {
      const l = Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y);
      this.lens.push(l);
      this.total += l;
    }
  }

  static segDist(x, y, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let u = l2 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0;
    u = clamp(u, 0, 1);
    return { d: Math.hypot(x - (a.x + dx * u), y - (a.y + dy * u)), u };
  }

  /** Distance to the progress path (d, s) and to any safe corridor (wall). */
  nearest(x, y) {
    let best = { d: Infinity, s: 0 };
    let acc = 0;
    for ( let i = 1; i < this.pts.length; i++ ) {
      const { d, u } = WardTraceGame.segDist(x, y, this.pts[i - 1], this.pts[i]);
      if ( d < best.d ) best = { d, s: (acc + this.lens[i - 1] * u) / this.total };
      acc += this.lens[i - 1];
    }
    let wall = best.d;
    for ( const [a, b] of this.extra ) wall = Math.min(wall, WardTraceGame.segDist(x, y, a, b).d);
    best.wall = wall;
    return best;
  }

  update(dt) {
    if ( this.flash > 0 ) this.flash = Math.max(0, this.flash - dt * 2);
  }

  onDown(x, y) {
    if ( this.state !== "idle" ) return;
    const s = this.pts[0];
    if ( Math.hypot(x - s.x, y - s.y) <= 16 ) {
      this.state = "trace";
      this.progress = 0;
      this.hint("LPM.Hint.traceGo");
    }
  }

  onMove(x, y) {
    if ( this.state !== "trace" ) return;
    const n = this.nearest(x, y);
    if ( n.wall > this.halfW ) {
      this.flash = 1;
      this.damage(this.hitDmg);
      if ( this.running ) {
        this.state = "idle";
        this.progress = 0;
        this.hint("LPM.Hint.traceHit");
      }
      return;
    }
    if ( n.d > this.halfW ) return;
    // Progress may only advance a little per move, so a hop between neighbouring laps does not count.
    if ( n.s > this.progress + 0.08 ) return;
    this.progress = Math.max(this.progress, n.s);
    const end = this.pts[this.pts.length - 1];
    if ( this.progress >= 0.97 && Math.hypot(x - end.x, y - end.y) <= 18 ) this.win();
  }

  onLeave() {
    if ( this.state === "trace" ) {
      this.state = "idle";
      this.progress = 0;
      this.hint("LPM.Hint.traceHit");
    }
  }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.flash);
    ctx.save();
    if ( this.fog > 0 && this.mouse.x >= 0 ) {
      ctx.beginPath();
      ctx.arc(this.mouse.x, this.mouse.y, this.fog, 0, TAU);
      ctx.clip();
    }
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(this.pts[0].x, this.pts[0].y);
      for ( let i = 1; i < this.pts.length; i++ ) ctx.lineTo(this.pts[i].x, this.pts[i].y);
      for ( const [a, b] of this.extra ) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    };
    path(); ctx.lineWidth = this.halfW * 2 + 4; ctx.strokeStyle = "#746f86"; ctx.stroke();
    path(); ctx.lineWidth = this.halfW * 2; ctx.strokeStyle = "#17151f"; ctx.stroke();
    if ( this.progress > 0 ) {
      let remaining = this.progress * this.total;
      ctx.beginPath();
      ctx.moveTo(this.pts[0].x, this.pts[0].y);
      for ( let i = 1; i < this.pts.length && remaining > 0; i++ ) {
        const a = this.pts[i - 1], b = this.pts[i];
        const l = this.lens[i - 1];
        const u = Math.min(1, remaining / l);
        ctx.lineTo(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
        remaining -= l;
      }
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(216,178,74,0.8)"; ctx.stroke();
    }
    ctx.restore();
    if ( this.fog > 0 && this.mouse.x >= 0 ) {
      const g = ctx.createRadialGradient(this.mouse.x, this.mouse.y, this.fog * 0.6, this.mouse.x, this.mouse.y, this.fog);
      g.addColorStop(0, "rgba(11,10,20,0)");
      g.addColorStop(1, "rgba(11,10,20,0.95)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, this.fog, 0, TAU); ctx.fill();
    }
    const s = this.pts[0], e = this.pts[this.pts.length - 1];
    const marker = (p, color, txt) => {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 24);
      g.addColorStop(0, color.replace("1)", "0.55)"));
      g.addColorStop(1, color.replace("1)", "0)"));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#120d06"; ctx.lineWidth = 1.5; ctx.stroke();
      label(ctx, txt, p.x, p.y + 0.5, { size: 11, bold: true, color: "#120d06" });
    };
    marker(s, "rgba(90,211,90,1)", "S");
    marker(e, "rgba(255,214,90,1)", "E");
    if ( this.state === "trace" && this.mouse.x >= 0 ) {
      ctx.fillStyle = "#ffe066";
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, 5, 0, TAU); ctx.fill();
    }
  }

  right() { return { value: this.progress }; }
}

/* ------------------------------------------------------------------ */

export const GAMES = {
  sweetspot: SweetSpotGame,
  dual: DualRotationGame,
  tumbler: PinTumblerGame,
  skillcheck: SkillCheckGame,
  tension: TensionGame,
  trace: WardTraceGame
};

export function gameLabel(id) {
  return game.i18n.localize(`LPM.Game.${id in GAMES ? id : "random"}`);
}

export function randomGameId() {
  const ids = Object.keys(GAMES);
  return ids[Math.floor(Math.random() * ids.length)];
}
