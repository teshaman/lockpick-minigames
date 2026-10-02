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
    this.mouse = { x: -1, y: -1, down: false };
    this.space = false;
    this.last = 0;
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }
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
        if ( e.button !== 0 ) return;
        const p = this.#pos(e);
        this.mouse.x = p.x; this.mouse.y = p.y; this.mouse.down = true;
        try { c.setPointerCapture(e.pointerId); } catch(err) {}
        this.onDown(p.x, p.y);
      },
      up: e => { if ( e.button !== 0 ) return; this.mouse.down = false; this.onUp(); },
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
/*  1. Sweet Spot — find the angle, hold to turn                       */
/* ------------------------------------------------------------------ */

export class SweetSpotGame extends MiniGame {
  static id = "sweetspot";
  static rightLabel = "LPM.Bar.Rotation";
  static hintKey = "LPM.Hint.sweetspot";

  setup() {
    this.cx = this.W / 2; this.cy = this.H / 2 + 6;
    this.r = Math.min(this.W, this.H) * 0.4;
    this.sweet = rnd(-75, 75);
    this.tol = lerp(14, 3.5, this.t);
    this.soft = lerp(55, 22, this.t);
    this.picks = this.tier <= 5 ? 3 : (this.tier <= 10 ? 2 : 1);
    this.rot = 0;
    this.pickAngle = 0;
    this.stress = 0;
  }

  angleFromMouse() {
    if ( this.mouse.x < 0 ) return this.pickAngle;
    const a = Math.atan2(this.mouse.y - this.cy, this.mouse.x - this.cx) * 180 / Math.PI;
    let p = a - 90;
    if ( p > 180 ) p -= 360;
    if ( p < -180 ) p += 360;
    return clamp(p, -90, 90);
  }

  update(dt) {
    if ( !this.held ) this.pickAngle = this.angleFromMouse();
    const d = Math.abs(this.pickAngle - this.sweet);
    const maxRot = 90 * (1 - clamp((d - this.tol) / this.soft, 0, 1));
    if ( this.held ) {
      if ( this.rot < maxRot ) {
        this.rot = Math.min(maxRot, this.rot + lerp(80, 55, this.t) * dt);
        this.stress = Math.max(0, this.stress - dt * 2);
      } else if ( maxRot < 90 ) {
        this.stress = Math.min(1, this.stress + dt * 3);
        this.damage(lerp(30, 70, this.t) * dt);
      }
      if ( this.rot >= 90 ) { this.rot = 90; this.win(); }
    } else {
      this.rot = Math.max(0, this.rot - 200 * dt);
      this.stress = Math.max(0, this.stress - dt * 3);
    }
  }

  onBroken() {
    this.picks -= 1;
    if ( this.picks <= 0 ) return this.fail();
    this.health = 100;
    this.mouse.down = false;
    this.space = false;
    this.rot = 0;
    this.stress = 0;
    this.hint("LPM.Hint.pickBroke", { n: this.picks });
    setTimeout(() => { if ( this.running ) this.hint(this.constructor.hintKey); }, 1800);
  }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.stress * 0.8);
    const d = Math.abs(this.pickAngle - this.sweet);
    drawDial(ctx, this.cx, this.cy, this.r, this.rot * Math.PI / 180, d <= this.tol ? 0.8 : 0);
    const a = (this.pickAngle + 90 + this.rot) * Math.PI / 180;
    const shake = this.stress > 0 ? (Math.random() - 0.5) * this.stress * 8 : 0;
    const len = this.r * 1.25;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(a);
    ctx.translate(0, shake);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, "#f6f6fa");
    g.addColorStop(1, this.stress > 0.3 ? "#ff6060" : "#8a8a96");
    ctx.lineCap = "round";
    ctx.lineWidth = 6; ctx.strokeStyle = "#15151c";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = g; ctx.stroke();
    ctx.restore();
    for ( let i = 0; i < this.picks; i++ ) {
      ctx.save();
      ctx.translate(18 + i * 14, this.H - 18);
      ctx.rotate(-Math.PI / 4);
      ctx.lineCap = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#d9d9e0";
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.restore();
    }
  }

  right() { return { value: this.rot / 90 }; }
}

/* ------------------------------------------------------------------ */
/*  2. Dual Rotation — hold and chase the drifting glow                */
/* ------------------------------------------------------------------ */

export class DualRotationGame extends MiniGame {
  static id = "dual";
  static rightLabel = "LPM.Bar.Rotation";
  static hintKey = "LPM.Hint.dual";

  setup() {
    this.cx = this.W / 2; this.cy = this.H / 2 + 6;
    this.r = Math.min(this.W, this.H) * 0.4;
    this.theta = rnd(0, TAU);
    this.rr = this.r * 0.5;
    this.omega = lerp(0.7, 2.4, this.t) * sign();
    this.flipIn = rnd(0.8, 2.2);
    this.cap = lerp(60, 22, this.t);
    this.rot = 0;
    this.aligned = false;
    this.sx = this.cx; this.sy = this.cy;
  }

  update(dt) {
    this.flipIn -= dt;
    if ( this.flipIn <= 0 ) {
      this.omega *= -1;
      this.flipIn = rnd(0.7, 2.2);
      this.rr = this.r * rnd(0.3, 0.62);
    }
    this.theta += this.omega * dt;
    this.sx = this.cx + Math.cos(this.theta) * this.rr;
    this.sy = this.cy + Math.sin(this.theta) * this.rr;
    const dist = Math.hypot(this.mouse.x - this.sx, this.mouse.y - this.sy);
    this.aligned = this.mouse.x >= 0 && dist <= this.cap;
    if ( this.held ) {
      if ( this.aligned ) {
        this.rot = Math.min(90, this.rot + lerp(45, 30, this.t) * dt);
        if ( this.rot >= 90 ) return this.win();
      } else {
        this.damage(lerp(28, 60, this.t) * dt);
      }
    } else {
      this.rot = Math.max(0, this.rot - 20 * dt);
    }
  }

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.held && !this.aligned ? 0.7 : 0);
    drawDial(ctx, this.cx, this.cy, this.r, this.rot * Math.PI / 180, 0);
    const g = ctx.createRadialGradient(this.sx, this.sy, 0, this.sx, this.sy, this.cap * 1.4);
    g.addColorStop(0, "rgba(255,244,180,0.95)");
    g.addColorStop(0.35, "rgba(255,214,90,0.5)");
    g.addColorStop(1, "rgba(255,214,90,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.sx, this.sy, this.cap * 1.4, 0, TAU); ctx.fill();
    if ( this.mouse.x >= 0 ) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.aligned ? PALETTE.green : "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(this.mouse.x, this.mouse.y, 9, 0, TAU); ctx.stroke();
    }
  }

  right() { return { value: this.rot / 90 }; }
}

/* ------------------------------------------------------------------ */
/*  3. Pin Tumbler — click each pin at the top of its bounce           */
/* ------------------------------------------------------------------ */

export class PinTumblerGame extends MiniGame {
  static id = "tumbler";
  static rightLabel = "LPM.Bar.Pins";
  static hintKey = "LPM.Hint.tumbler";

  setup() {
    this.n = Math.round(lerp(3, 7, this.t));
    this.errorsAllowed = Math.max(1, Math.round(lerp(6, 2, this.t)));
    this.errors = 0;
    this.window = lerp(0.22, 0.07, this.t);
    this.pins = Array.from({ length: this.n }, () => ({
      phase: rnd(0, TAU),
      period: lerp(2.1, 0.9, this.t) * rnd(0.85, 1.15),
      set: false,
      flash: 0
    }));
    this.time = 0;
    this.frameW = Math.min(this.W - 80, this.n * 58 + 40);
    this.x0 = (this.W - this.frameW) / 2;
    this.colW = this.frameW / this.n;
    this.top = 78;
    this.bottom = this.H - 56;
    this.pinH = 46;
    this.base = 26;
    this.travel = this.bottom - this.base - this.top - this.pinH - 10;
  }

  pos(i) {
    const p = this.pins[i];
    return p.set ? 1 : 0.5 + 0.5 * Math.sin(TAU * this.time / p.period + p.phase);
  }

  update(dt) {
    this.time += dt;
    for ( const p of this.pins ) {
      if ( p.flash > 0 ) p.flash = Math.max(0, p.flash - dt * 3);
      else if ( p.flash < 0 ) p.flash = Math.min(0, p.flash + dt * 3);
    }
  }

  onDown(x, y) {
    const i = Math.floor((x - this.x0) / this.colW);
    if ( i < 0 || i >= this.n ) return;
    const p = this.pins[i];
    if ( p.set ) return;
    if ( this.pos(i) >= 1 - this.window ) {
      p.set = true;
      p.flash = 1;
      if ( this.pins.every(q => q.set) ) this.win();
    } else {
      this.errors += 1;
      p.flash = -1;
      this.damage(100 / this.errorsAllowed + 0.01);
    }
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
    const lineY = baseY - this.pinH - this.travel * (1 - this.window) - 4;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(216,178,74,0.6)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(this.x0 - 6, lineY); ctx.lineTo(this.x0 + this.frameW + 6, lineY); ctx.stroke();
    ctx.setLineDash([]);
    for ( let i = 0; i < this.n; i++ ) {
      const p = this.pins[i];
      const cx = this.x0 + this.colW * (i + 0.5);
      const gw = Math.min(26, this.colW * 0.5);
      ctx.fillStyle = "#0d0c16";
      ctx.fillRect(cx - gw / 2, this.top, gw, baseY - this.top);
      const y = baseY - this.pinH - this.pos(i) * this.travel;
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
    }
  }

  right() {
    const setCount = this.pins.filter(p => p.set).length;
    return { value: setCount / this.n, text: `${setCount}/${this.n}` };
  }
}

/* ------------------------------------------------------------------ */
/*  4. Skill Check — click when the sweep hits the highlighted zone    */
/* ------------------------------------------------------------------ */

export class SkillCheckGame extends MiniGame {
  static id = "skillcheck";
  static rightLabel = "LPM.Bar.Hits";
  static hintKey = "LPM.Hint.skillcheck";

  setup() {
    this.cx = this.W / 2; this.cy = this.H / 2 + 10;
    this.R = Math.min(this.W, this.H) * 0.36;
    this.width = 34;
    this.need = Math.round(lerp(3, 6, this.t));
    this.hits = 0;
    this.a = rnd(0, TAU);
    this.omega = lerp(1.7, 5.0, this.t) * sign();
    this.zoneW = lerp(1.25, 0.32, this.t);
    this.missDmg = lerp(34, 51, this.t);
    this.flash = 0;
    this.newZone();
  }

  newZone() {
    const ahead = rnd(0.9, 3.5) * Math.sign(this.omega);
    this.zone = (this.a + ahead + TAU) % TAU;
  }

  inZone() {
    let d = ((this.a - this.zone) % TAU + TAU) % TAU;
    if ( d > Math.PI ) d -= TAU;
    const ad = Math.abs(d);
    if ( ad > this.zoneW / 2 ) return 0;
    return ad <= this.zoneW / 6 ? 2 : 1;
  }

  update(dt) {
    this.a = (this.a + this.omega * dt + TAU) % TAU;
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
      this.omega *= lerp(1.0, 1.08, this.t) * (Math.random() < 0.3 ? -1 : 1);
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
    ctx.lineWidth = this.width - 4;
    ctx.strokeStyle = this.flash > 0 ? "#8fe08f" : "#e4c04a";
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, this.zone - this.zoneW / 2, this.zone + this.zoneW / 2); ctx.stroke();
    ctx.strokeStyle = this.flash > 0 ? "#bdf3bd" : "#6fb6ff";
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.R, this.zone - this.zoneW / 6, this.zone + this.zoneW / 6); ctx.stroke();
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
/*  5. Tension — hold Space in the safe band, click the targets        */
/* ------------------------------------------------------------------ */

export class TensionGame extends MiniGame {
  static id = "tension";
  static rightLabel = "LPM.Bar.Targets";
  static hintKey = "LPM.Hint.tension";

  setup() {
    this.started = false;
    this.tension = 0;
    this.rise = lerp(0.9, 1.4, this.t);
    this.fall = lerp(0.6, 1.0, this.t);
    this.bandHalf = lerp(0.17, 0.06, this.t);
    this.bandC = rnd(0.3, 0.7);
    this.bandV = lerp(0.04, 0.18, this.t) * sign();
    this.need = Math.round(lerp(4, 8, this.t));
    this.count = 0;
    this.gx = 56; this.gw = 34; this.gTop = 50; this.gBot = this.H - 44;
    this.cx = this.W / 2 + 36; this.cy = this.H / 2 + 8;
    this.r = Math.min(this.W, this.H) * 0.36;
    this.target = null;
    this.targetTTL = 0;
    this.missDmg = lerp(25, 40, this.t);
    this.flash = 0;
    this.pulse = 0;
  }

  newTarget() {
    const a = rnd(0, TAU);
    const d = rnd(0.15, 0.8) * this.r;
    this.target = { x: this.cx + Math.cos(a) * d, y: this.cy + Math.sin(a) * d };
    this.targetTTL = lerp(4, 2, this.t);
  }

  inBand() { return Math.abs(this.tension - this.bandC) <= this.bandHalf; }

  update(dt) {
    this.pulse += dt;
    if ( this.flash > 0 ) this.flash = Math.max(0, this.flash - dt * 3);
    else if ( this.flash < 0 ) this.flash = Math.min(0, this.flash + dt * 3);
    if ( !this.started ) return;
    this.tension = clamp(this.tension + (this.space ? this.rise : -this.fall) * dt, 0, 1);
    this.bandC += this.bandV * dt;
    const lo = 0.12 + this.bandHalf, hi = 0.86 - this.bandHalf;
    if ( this.bandC < lo ) { this.bandC = lo; this.bandV = Math.abs(this.bandV); }
    if ( this.bandC > hi ) { this.bandC = hi; this.bandV = -Math.abs(this.bandV); }
    if ( Math.random() < dt * 0.4 ) this.bandV *= -1;
    if ( this.tension >= 0.95 ) this.damage(40 * dt);
    this.targetTTL -= dt;
    if ( this.targetTTL <= 0 ) this.newTarget();
  }

  onDown(x, y) {
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

  draw() {
    const ctx = this.ctx;
    drawBackground(ctx, this.W, this.H, this.tension >= 0.95 ? 0.8 : (this.flash < 0 ? -this.flash : 0));
    const gh = this.gBot - this.gTop;
    ctx.fillStyle = "#15141f";
    roundRect(ctx, this.gx, this.gTop, this.gw, gh, 6); ctx.fill();
    ctx.strokeStyle = "#8a6d2a"; ctx.lineWidth = 2; ctx.stroke();
    const bandTop = this.gBot - (this.bandC + this.bandHalf) * gh;
    ctx.fillStyle = "rgba(90,211,90,0.28)";
    ctx.fillRect(this.gx + 2, bandTop, this.gw - 4, this.bandHalf * 2 * gh);
    const fillH = this.tension * gh;
    const inBand = this.inBand();
    ctx.fillStyle = this.tension >= 0.95 ? PALETTE.red : (inBand ? PALETTE.green : "#7f9a70");
    ctx.fillRect(this.gx + 4, this.gBot - fillH, this.gw - 8, fillH);
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
    } else if ( this.target ) {
      const pr = 7 + Math.sin(this.pulse * 6) * 1.5;
      const g = ctx.createRadialGradient(this.target.x, this.target.y, 0, this.target.x, this.target.y, 30);
      g.addColorStop(0, "rgba(255,230,120,0.7)");
      g.addColorStop(1, "rgba(255,230,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.target.x, this.target.y, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = inBand ? "#ffe066" : "#b89a3a";
      ctx.beginPath(); ctx.arc(this.target.x, this.target.y, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#120d06"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  right() { return { value: this.count / this.need, text: `${this.count}/${this.need}` }; }
}

/* ------------------------------------------------------------------ */
/*  6. Ward Trace — guide the cursor along the keyway                  */
/* ------------------------------------------------------------------ */

export class WardTraceGame extends MiniGame {
  static id = "trace";
  static rightLabel = "LPM.Bar.Progress";
  static hintKey = "LPM.Hint.trace";

  setup() {
    const k = Math.round(lerp(5, 10, this.t));
    this.halfW = lerp(28, 12, this.t);
    const x0 = 60, x1 = this.W - 60;
    this.pts = [];
    for ( let i = 0; i <= k; i++ ) {
      const x = x0 + (x1 - x0) * i / k;
      let y;
      if ( i === 0 || i === k ) y = this.H / 2;
      else y = i % 2 ? rnd(60, this.H / 2 - 30) : rnd(this.H / 2 + 30, this.H - 60);
      this.pts.push({ x, y });
    }
    this.total = 0;
    this.lens = [];
    for ( let i = 1; i < this.pts.length; i++ ) {
      const l = Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y);
      this.lens.push(l);
      this.total += l;
    }
    this.state = "idle";
    this.progress = 0;
    this.hitDmg = lerp(34, 100, this.t);
    this.flash = 0;
  }

  nearest(x, y) {
    let best = { d: Infinity, s: 0 };
    let acc = 0;
    for ( let i = 1; i < this.pts.length; i++ ) {
      const a = this.pts[i - 1], b = this.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      let u = l2 ? ((x - a.x) * dx + (y - a.y) * dy) / l2 : 0;
      u = clamp(u, 0, 1);
      const px = a.x + dx * u, py = a.y + dy * u;
      const d = Math.hypot(x - px, y - py);
      if ( d < best.d ) best = { d, s: (acc + this.lens[i - 1] * u) / this.total };
      acc += this.lens[i - 1];
    }
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
    if ( n.d > this.halfW ) {
      this.flash = 1;
      this.damage(this.hitDmg);
      if ( this.running ) {
        this.state = "idle";
        this.progress = 0;
        this.hint("LPM.Hint.traceHit");
      }
      return;
    }
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
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(this.pts[0].x, this.pts[0].y);
      for ( let i = 1; i < this.pts.length; i++ ) ctx.lineTo(this.pts[i].x, this.pts[i].y);
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
