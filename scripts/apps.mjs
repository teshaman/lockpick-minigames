/**
 * Lockpick Minigames — ApplicationV2 windows: the game panel, the attempt window,
 * the demo playground and the per-lock configuration form.
 */
import { GAMES, TIERS, tierLabel, gameLabel, randomGameId } from "./minigames.mjs";

export const MOD = "lockpick-minigames";
const { ApplicationV2 } = foundry.applications.api;
const L = key => game.i18n.localize(key);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/* ------------------------------------------------------------------ */
/*  GamePanel: canvas + hint + bars + result overlay                   */
/* ------------------------------------------------------------------ */

export class GamePanel {
  constructor() {
    const root = document.createElement("div");
    root.className = "lpm-panel";
    root.innerHTML = `
      <div class="lpm-stage">
        <canvas width="520" height="400"></canvas>
        <div class="lpm-overlay"></div>
      </div>
      <p class="lpm-hint"></p>
      <div class="lpm-bars">
        <div class="lpm-barbox"><span class="lpm-barlabel">${L("LPM.Bar.Health")}</span><div class="lpm-bar green"><div style="width:100%"></div></div></div>
        <div class="lpm-barbox right"><span class="lpm-barlabel lpm-rightlabel"></span><span class="lpm-righttext"></span><div class="lpm-bar blue"><div style="width:0%"></div></div></div>
      </div>
      <div class="lpm-howto"><b>${L("LPM.HowTo.Label")}</b> <span></span></div>`;
    this.howto = root.querySelector(".lpm-howto span");
    this.root = root;
    this.canvas = root.querySelector("canvas");
    this.overlay = root.querySelector(".lpm-overlay");
    this.hintEl = root.querySelector(".lpm-hint");
    this.healthEl = root.querySelector(".lpm-bar.green > div");
    this.rightEl = root.querySelector(".lpm-bar.blue > div");
    this.rightLabel = root.querySelector(".lpm-rightlabel");
    this.rightText = root.querySelector(".lpm-righttext");
    this.game = null;
  }

  play(gameId, tier, onResult) {
    this.stop();
    const Cls = GAMES[gameId] ?? GAMES[randomGameId()];
    this.overlay.className = "lpm-overlay";
    this.overlay.textContent = "";
    this.hintEl.textContent = "";
    this.howto.textContent = L(`LPM.HowTo.${Cls.id}`);
    const host = {
      hint: text => { this.hintEl.textContent = text; },
      bars: ({ health, right, rightLabel }) => {
        this.healthEl.style.width = `${Math.round(health * 100)}%`;
        this.rightEl.style.width = `${Math.round((right?.value ?? 0) * 100)}%`;
        this.rightLabel.textContent = rightLabel ?? "";
        this.rightText.textContent = right?.text ?? "";
      },
      done: success => {
        this.overlay.textContent = L(success ? "LPM.Result.Win" : "LPM.Result.Lose");
        this.overlay.className = `lpm-overlay ${success ? "win" : "lose"}`;
        onResult?.(success);
      }
    };
    this.game = new Cls(this.canvas, tier, host);
    this.game.start();
  }

  stop() {
    this.game?.stop();
    this.game = null;
  }

  get started() {
    const g = this.game;
    if ( !g ) return false;
    return g.rot > 0 || g.hits > 0 || g.count > 0 || g.started || g.progress > 0 || g.health < 100
      || g.phase === "track" || (g.pins?.some(p => p.set) ?? false);
  }
}

/* ------------------------------------------------------------------ */
/*  LockGameApp: one attempt on one lock                               */
/* ------------------------------------------------------------------ */

export class LockGameApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "lpm-game-{id}",
    classes: ["lpm", "lpm-game"],
    window: { title: "LPM.Window.Game", icon: "fa-solid fa-unlock-keyhole", resizable: false, minimizable: false },
    position: { width: 560 }
  };

  /**
   * @param {object} cfg
   * @param {string} cfg.gameId
   * @param {number} cfg.tier           effective tier
   * @param {object} cfg.info           { name, baseTier, skill, tool }
   * @param {Function} cfg.onResult     (success:boolean, {cancelled}) => void
   */
  constructor(cfg, options = {}) {
    super(options);
    this.cfg = cfg;
    this.panel = new GamePanel();
    this.resolved = false;
  }

  get title() {
    return `${L("LPM.Window.Game")} — ${this.cfg.info?.name ?? ""}`;
  }

  async _renderHTML() {
    const info = this.cfg.info ?? {};
    const mods = [];
    if ( info.skill ) mods.push(`${L("LPM.Mod.Skill")} ${info.skill > 0 ? "−" : "+"}${Math.abs(info.skill)}`);
    if ( info.tool?.reduction ) mods.push(`${esc(info.tool.name)} −${info.tool.reduction}`);
    const sub = `${gameLabel(this.cfg.gameId)} · ${tierLabel(this.cfg.tier)}`
      + (info.baseTier && info.baseTier !== this.cfg.tier ? ` <span class="lpm-dim">(${L("LPM.Mod.Base")} ${info.baseTier}${mods.length ? ": " + mods.join(", ") : ""})</span>` : "");
    const wrap = document.createElement("div");
    wrap.className = "lpm-wrap";
    wrap.innerHTML = `<div class="lpm-head"><span class="lpm-title">${esc(info.name ?? "")}</span><span class="lpm-sub">${sub}</span></div>`;
    wrap.append(this.panel.root);
    return wrap;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onRender() {
    this.panel.play(this.cfg.gameId, this.cfg.tier, success => {
      if ( this.resolved ) return;
      this.resolved = true;
      this.cfg.onResult?.(success, { cancelled: false });
      setTimeout(() => this.close(), 1400);
    });
  }

  _onClose() {
    const started = this.panel.started;
    this.panel.stop();
    if ( !this.resolved ) {
      this.resolved = true;
      this.cfg.onResult?.(false, { cancelled: true, started });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  DemoApp: the playground from the settings menu                     */
/* ------------------------------------------------------------------ */

export class DemoApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "lpm-demo",
    classes: ["lpm", "lpm-demo"],
    window: { title: "LPM.Window.Demo", icon: "fa-solid fa-gamepad", resizable: false },
    position: { width: 560 },
    actions: { play: DemoApp.#play }
  };

  constructor(options = {}) {
    super(options);
    this.panel = new GamePanel();
  }

  async _renderHTML() {
    const games = ["random", ...Object.keys(GAMES)].map(id => `<option value="${id}">${gameLabel(id)}</option>`).join("");
    const tiers = Array.from({ length: TIERS }, (_, i) => `<option value="${i + 1}" ${i + 1 === 5 ? "selected" : ""}>${tierLabel(i + 1)}</option>`).join("");
    const wrap = document.createElement("div");
    wrap.className = "lpm-wrap";
    wrap.innerHTML = `
      <div class="lpm-toolbar">
        <label><span>${L("LPM.Demo.Game")}</span><select name="game">${games}</select></label>
        <label><span>${L("LPM.Demo.Tier")}</span><select name="tier">${tiers}</select></label>
        <button type="button" data-action="play"><i class="fa-solid fa-play"></i> ${L("LPM.Demo.Play")}</button>
      </div>`;
    wrap.append(this.panel.root);
    return wrap;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static #play() {
    const el = this.element;
    let gameId = el.querySelector("select[name=game]").value;
    const tier = Number(el.querySelector("select[name=tier]").value);
    if ( gameId === "random" ) gameId = randomGameId();
    this.panel.play(gameId, tier, () => {});
  }

  _onClose() {
    this.panel.stop();
  }
}

/* ------------------------------------------------------------------ */
/*  LockConfigApp: per-door / per-token configuration                  */
/* ------------------------------------------------------------------ */

export class LockConfigApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "lpm-config-{id}",
    classes: ["lpm", "lpm-config", "standard-form"],
    tag: "form",
    window: { title: "LPM.Window.Config", icon: "fa-solid fa-lock", resizable: false },
    position: { width: 480 },
    form: { handler: LockConfigApp.#onSubmit, closeOnSubmit: true },
    actions: {
      test: LockConfigApp.#test,
      reset: LockConfigApp.#reset,
      toggleLock: LockConfigApp.#toggleLock
    }
  };

  constructor(doc, options = {}) {
    super(options);
    this.document = doc;
  }

  get api() { return game.modules.get(MOD).api; }
  get isDoor() { return this.document.documentName === "Wall"; }

  get title() {
    return `${L("LPM.Window.Config")} — ${this.api.docName(this.document)}`;
  }

  async _renderHTML() {
    const f = this.document.getFlag(MOD, "lock") ?? {};
    const st = this.document.getFlag(MOD, "state") ?? {};
    const api = this.api;
    const locked = api.isLocked(this.document);
    const opt = (v, cur, text) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${text}</option>`;
    const enabledCur = f.enabled === true ? "yes" : (f.enabled === false ? "no" : "default");
    const games = [opt("default", f.game ?? "default", L("LPM.Config.UseDefault")), opt("random", f.game, gameLabel("random"))]
      .concat(Object.keys(GAMES).map(id => opt(id, f.game, gameLabel(id)))).join("");
    const tiers = [opt(0, f.tier ?? 0, L("LPM.Config.UseDefault"))]
      .concat(Array.from({ length: TIERS }, (_, i) => opt(i + 1, f.tier ?? 0, tierLabel(i + 1)))).join("");
    const attempts = Object.values(st.attempts ?? {}).reduce((a, b) => a + b, 0);
    const group = (labelKey, field, hintKey) => `
      <div class="form-group">
        <label>${L(labelKey)}</label>
        <div class="form-fields">${field}</div>
        ${hintKey ? `<p class="hint">${L(hintKey)}</p>` : ""}
      </div>`;
    const wrap = document.createElement("div");
    wrap.className = "lpm-config-body";
    wrap.innerHTML = `
      <div class="lpm-status">
        <span><i class="fa-solid ${locked ? "fa-lock" : "fa-lock-open"}"></i> ${L(locked ? "LPM.Config.StateLocked" : "LPM.Config.StateUnlocked")}</span>
        <span>${st.jammed ? `<i class="fa-solid fa-triangle-exclamation"></i> ${L("LPM.Config.StateJammed")}` : ""}</span>
        <span>${L("LPM.Config.Attempts")}: ${attempts}</span>
      </div>
      ${group("LPM.Config.Enabled", `<select name="enabled">
          ${opt("default", enabledCur, L(this.isDoor ? "LPM.Config.EnabledDefaultDoor" : "LPM.Config.EnabledDefaultToken"))}
          ${opt("yes", enabledCur, L("Yes"))}${opt("no", enabledCur, L("No"))}
        </select>`, "LPM.Config.EnabledHint")}
      ${group("LPM.Config.Game", `<select name="game">${games}</select>`)}
      ${group("LPM.Config.Tier", `<select name="tier">${tiers}</select>`, "LPM.Config.TierHint")}
      ${group("LPM.Config.Key", `<input type="text" name="key" value="${esc(f.key)}" placeholder="${L("LPM.Config.KeyPlaceholder")}">`, "LPM.Config.KeyHint")}
      ${group("LPM.Config.ConsumeKey", `<input type="checkbox" name="consumeKey" ${f.consumeKey ? "checked" : ""}>`)}
      ${group("LPM.Config.MaxAttempts", `<input type="number" name="maxAttempts" min="-1" step="1" value="${Number.isFinite(f.maxAttempts) ? f.maxAttempts : -1}">`, "LPM.Config.MaxAttemptsHint")}
      ${group("LPM.Config.Cooldown", `<input type="number" name="cooldown" min="-1" step="1" value="${Number.isFinite(f.cooldown) ? f.cooldown : -1}">`, "LPM.Config.CooldownHint")}
      ${group("LPM.Config.SuccessMacro", `<input type="text" name="successMacro" value="${esc(f.successMacro)}">`)}
      ${group("LPM.Config.FailMacro", `<input type="text" name="failMacro" value="${esc(f.failMacro)}">`, "LPM.Config.MacroHint")}
      <footer class="form-footer">
        <button type="button" data-action="toggleLock"><i class="fa-solid ${locked ? "fa-lock-open" : "fa-lock"}"></i> ${L(locked ? "LPM.Config.Unlock" : "LPM.Config.Lock")}</button>
        <button type="button" data-action="reset"><i class="fa-solid fa-rotate-left"></i> ${L("LPM.Config.Reset")}</button>
        <button type="button" data-action="test"><i class="fa-solid fa-play"></i> ${L("LPM.Config.Test")}</button>
        <button type="submit"><i class="fa-solid fa-save"></i> ${L("Save")}</button>
      </footer>`;
    return wrap;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  static async #onSubmit(event, form, formData) {
    const d = foundry.utils.expandObject(formData.object);
    const lock = {
      enabled: d.enabled === "yes" ? true : (d.enabled === "no" ? false : null),
      game: d.game ?? "default",
      tier: Number(d.tier) || 0,
      key: String(d.key ?? "").trim(),
      consumeKey: !!d.consumeKey,
      maxAttempts: Number.isFinite(Number(d.maxAttempts)) ? Number(d.maxAttempts) : -1,
      cooldown: Number.isFinite(Number(d.cooldown)) ? Number(d.cooldown) : -1,
      successMacro: String(d.successMacro ?? "").trim(),
      failMacro: String(d.failMacro ?? "").trim()
    };
    await this.api.setLock(this.document, lock);
    ui.notifications.info(L("LPM.Notify.Saved"));
  }

  static async #test() {
    await this.submit?.().catch?.(() => {});
    this.api.attempt(this.document, { test: true });
  }

  static async #reset() {
    await this.api.resetState(this.document);
    ui.notifications.info(L("LPM.Notify.Reset"));
    this.render();
  }

  static async #toggleLock() {
    if ( this.api.isLocked(this.document) ) await this.api.unlock(this.document, { silent: true });
    else await this.api.lock(this.document);
    this.render();
  }
}
