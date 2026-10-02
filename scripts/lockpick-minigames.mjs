/**
 * Lockpick Minigames — main module.
 * Doors (walls) and container tokens carry a lock configuration in flags.
 * Players click a locked door or double-click a locked token, play a minigame,
 * and the result is sent to the active GM through the module socket, which is the
 * only client allowed to change the door / token.
 */
import { GAMES, TIERS, tierLabel, gameLabel, randomGameId } from "./minigames.mjs";
import { MOD, LockGameApp, LockConfigApp, DemoApp, LockWatchApp } from "./apps.mjs";

const SOCKET = `module.${MOD}`;
const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);
const S = key => game.settings.get(MOD, key);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const norm = s => String(s ?? "").toLowerCase().replace(/[‘’ʼ]/g, "'").trim();

/** Attempt windows currently open, keyed by document uuid. */
const openApps = new Map();
/** Player-side promises waiting for the GM's acknowledgement, keyed by request id. */
const pending = new Map();
/** Spectator windows, keyed by attempt id. */
const watchApps = new Map();

/* ------------------------------------------------------------------ */
/*  Settings                                                            */
/* ------------------------------------------------------------------ */

function registerSettings() {
  const isDnd = game.system.id === "dnd5e";
  const reg = (key, data) => game.settings.register(MOD, key, {
    name: `LPM.Setting.${key}.Name`,
    hint: `LPM.Setting.${key}.Hint`,
    scope: "world",
    config: true,
    ...data
  });

  game.settings.registerMenu(MOD, "demo", {
    name: "LPM.Setting.demo.Name",
    label: "LPM.Setting.demo.Label",
    hint: "LPM.Setting.demo.Hint",
    icon: "fa-solid fa-gamepad",
    type: DemoApp,
    restricted: false
  });

  reg("doorsDefault", { type: Boolean, default: true });
  reg("defaultGame", {
    type: String, default: "random",
    choices: Object.fromEntries(["random", ...Object.keys(GAMES)].map(id => [id, `LPM.Game.${id}`]))
  });
  reg("defaultTier", {
    type: Number, default: 5,
    choices: Object.fromEntries(Array.from({ length: TIERS }, (_, i) => [i + 1, `LPM.TierChoice.${i + 1}`]))
  });
  reg("interactionDistance", { type: Number, default: 10, range: { min: 0, max: 120, step: 5 } });
  reg("maxAttempts", { type: Number, default: 0, range: { min: 0, max: 20, step: 1 } });
  reg("jam", { type: Boolean, default: true });
  reg("cooldown", { type: Number, default: 0, range: { min: 0, max: 600, step: 5 } });
  reg("dndFormula", { type: Boolean, default: isDnd, config: isDnd });
  reg("skillPath", { type: String, default: isDnd ? "system.skills.slt.total" : "" });
  reg("arcanePath", { type: String, default: isDnd ? "system.skills.arc.total" : "" });
  reg("skillDivisor", { type: Number, default: 2, range: { min: 1, max: 10, step: 1 } });
  reg("tools", { type: String, default: isDnd ? "Thieves' Tools=2" : "" });
  reg("requireTool", { type: Boolean, default: false });
  reg("toolBreakChance", { type: Number, default: 0, range: { min: 0, max: 100, step: 5 } });
  reg("openOnSuccess", { type: Boolean, default: false });
  reg("chat", { type: Boolean, default: true });
  reg("spectate", {
    type: String, default: "all",
    choices: { off: "LPM.Setting.spectate.Off", gm: "LPM.Setting.spectate.GM", all: "LPM.Setting.spectate.All" }
  });
  reg("watchOthers", { type: Boolean, default: true, scope: "client" });
  reg("fpsWhilePicking", { type: Number, default: 20, range: { min: 0, max: 60, step: 5 }, scope: "client" });
}

/* ------------------------------------------------------------------ */
/*  Lock data                                                           */
/* ------------------------------------------------------------------ */

const isDoor = doc => doc?.documentName === "Wall";

function docName(doc) {
  if ( isDoor(doc) ) return F("LPM.DoorName", { n: doc.id.slice(0, 4) });
  return doc?.name ?? doc?.id ?? "?";
}

/** Effective configuration of a lock: flag values with world defaults filled in. */
function getLock(doc) {
  const f = doc.getFlag(MOD, "lock") ?? {};
  const enabled = f.enabled === true || (f.enabled !== false && isDoor(doc) && S("doorsDefault"));
  return {
    enabled,
    game: f.game && f.game !== "default" ? f.game : S("defaultGame"),
    tier: f.tier > 0 ? clamp(Number(f.tier), 1, TIERS) : S("defaultTier"),
    key: f.key ?? "",
    consumeKey: !!f.consumeKey,
    maxAttempts: Number(f.maxAttempts) >= 0 ? Number(f.maxAttempts) : S("maxAttempts"),
    cooldown: Number(f.cooldown) >= 0 ? Number(f.cooldown) : S("cooldown"),
    successMacro: f.successMacro ?? "",
    failMacro: f.failMacro ?? ""
  };
}

function getState(doc) {
  const st = foundry.utils.deepClone(doc.getFlag(MOD, "state") ?? {});
  st.attempts ??= {};
  st.cooldownUntil ??= {};
  st.jammed ??= false;
  return st;
}

function isLocked(doc) {
  if ( isDoor(doc) ) return doc.ds === CONST.WALL_DOOR_STATES.LOCKED;
  return doc.getFlag(MOD, "locked") === true;
}

function isPickable(doc) {
  if ( isDoor(doc) && !(doc.door > 0) ) return false;
  return getLock(doc).enabled;
}

/** Should a click on this document start a pick attempt for the current user? */
function shouldIntercept(doc) {
  if ( !doc || !isLocked(doc) || !isPickable(doc) ) return false;
  if ( game.user.isGM ) return game.keyboard.isModifierActive("CONTROL");
  return true;
}

/* ------------------------------------------------------------------ */
/*  Actor helpers: distance, keys, tools, skill                         */
/* ------------------------------------------------------------------ */

function userActor() {
  const tok = canvas.tokens?.controlled[0]
    ?? canvas.tokens?.placeables.find(t => t.actor && game.user.character && t.actor === game.user.character);
  return { actor: tok?.actor ?? game.user.character ?? null, token: tok ?? null };
}

function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  u = clamp(u, 0, 1);
  return Math.hypot(px - (x1 + dx * u), py - (y1 + dy * u));
}

/** Distance in scene units between a token (placeable) and a wall / token document, edge to edge. */
function distanceTo(token, doc) {
  const gs = canvas.scene.grid.size, gd = canvas.scene.grid.distance;
  const c = token.center;
  let px;
  if ( isDoor(doc) ) {
    const [x1, y1, x2, y2] = doc.c;
    px = pointSegDist(c.x, c.y, x1, y1, x2, y2) - Math.max(token.w, token.h) / 2;
  } else {
    const tc = doc.object?.center ?? { x: doc.x + doc.width * gs / 2, y: doc.y + doc.height * gs / 2 };
    px = Math.hypot(c.x - tc.x, c.y - tc.y) - Math.max(token.w, token.h) / 2 - Math.max(doc.width, doc.height) * gs / 2;
  }
  return Math.max(0, px) * gd / gs;
}

const hasQuantity = item => (item.system?.quantity ?? 1) > 0;

function findKey(actor, keyStr) {
  const names = String(keyStr).split(",").map(norm).filter(Boolean);
  if ( !names.length ) return null;
  return actor.items.find(i => names.includes(norm(i.name)) && hasQuantity(i)) ?? null;
}

function parseTools() {
  return String(S("tools")).split(/[\n;]+/).map(line => {
    const m = line.match(/^\s*(.+?)\s*[=:]\s*(-?\d+(?:\.\d+)?)\s*$/);
    return m ? { name: norm(m[1]), reduction: Number(m[2]) } : null;
  }).filter(Boolean);
}

function bestTool(actor) {
  const tools = parseTools();
  let best = null;
  for ( const item of actor.items ) {
    const def = tools.find(t => t.name === norm(item.name));
    if ( !def || !hasQuantity(item) ) continue;
    if ( !best || def.reduction > best.reduction ) best = { name: item.name, reduction: def.reduction, itemId: item.id };
  }
  return best;
}

/**
 * How much the character's ability lowers the tier.
 * dnd5e formula (default on dnd5e): Sleight of Hand total + thieves' tools proficiency bonus,
 * doubled when proficient in both, divided by the skill divisor.
 * Otherwise: the number at the skill path divided by the divisor.
 */
const usesDndFormula = () => game.system.id === "dnd5e" && S("dndFormula");

/**
 * Arcane locks ignore thieves' tools. dnd5e: Arcana total + the spellcasting ability modifier
 * (casters only), doubled when proficient in Arcana and a caster. Otherwise the arcane path.
 */
function arcaneReduction(actor, div) {
  if ( usesDndFormula() ) {
    const sys = actor.system ?? {};
    const arc = sys.skills?.arc;
    const abl = sys.attributes?.spellcasting;
    const mod = abl ? Number(sys.abilities?.[abl]?.mod ?? 0) : 0;
    let points = Number(arc?.total ?? 0) + mod;
    if ( Number(arc?.value ?? 0) >= 1 && abl ) points *= 2;
    return Math.floor(points / div);
  }
  const path = String(S("arcanePath") ?? "").trim();
  if ( !path ) return 0;
  const v = Number(foundry.utils.getProperty(actor, path));
  return Number.isFinite(v) ? Math.floor(v / div) : 0;
}

/**
 * How much the character's ability lowers the tier.
 * dnd5e formula (default on dnd5e): Sleight of Hand total + thieves' tools proficiency bonus
 * + the flat amount of the best carried tool (from the tools setting), doubled when proficient
 * in both the skill and the tools, divided by the skill divisor. The carried tool is part of
 * the points here, not a separate reduction.
 * Otherwise: the number at the skill path divided by the divisor (the carried tool is a separate reduction).
 */
function skillReduction(actor, tool = null, arcane = false) {
  const div = Math.max(1, S("skillDivisor"));
  if ( arcane ) return arcaneReduction(actor, div);
  if ( usesDndFormula() ) {
    const sys = actor.system ?? {};
    const slt = sys.skills?.slt;
    const thief = sys.tools?.thief;
    const prof = Number(sys.attributes?.prof ?? 0);
    const sltTotal = Number(slt?.total ?? 0);
    const toolMult = Number(thief?.value ?? thief?.prof?.multiplier ?? 0);
    let points = sltTotal + Math.floor(toolMult * prof) + Number(tool?.reduction ?? 0);
    if ( Number(slt?.value ?? 0) >= 1 && toolMult >= 1 ) points *= 2;
    return Math.floor(points / div);
  }
  const path = String(S("skillPath") ?? "").trim();
  if ( !path ) return 0;
  const v = Number(foundry.utils.getProperty(actor, path));
  if ( !Number.isFinite(v) ) return 0;
  return Math.floor(v / div);
}

/* ------------------------------------------------------------------ */
/*  Attempting a lock (any client)                                      */
/* ------------------------------------------------------------------ */

async function attempt(doc, { test = false } = {}) {
  if ( !doc ) return;
  const lock = getLock(doc);
  const warn = (key, data) => { ui.notifications.warn(F(key, data)); return false; };
  const { actor, token } = userActor();

  if ( !test ) {
    if ( game.paused && !game.user.isGM ) return ui.notifications.warn("GAME.PausedWarning", { localize: true });
    if ( !game.users.activeGM ) return warn("LPM.Notify.NoGM");
    const st = getState(doc);
    if ( st.jammed ) return warn("LPM.Notify.Jammed");
    const until = st.cooldownUntil[game.user.id] ?? 0;
    if ( Date.now() < until ) return warn("LPM.Notify.Cooldown", { s: Math.ceil((until - Date.now()) / 1000) });
    if ( lock.maxAttempts > 0 && (st.attempts[game.user.id] ?? 0) >= lock.maxAttempts ) return warn("LPM.Notify.NoAttempts");
    if ( !actor ) return warn("LPM.Notify.NoActor");
    const maxDist = S("interactionDistance");
    if ( maxDist > 0 ) {
      if ( !token ) return warn("LPM.Notify.NoToken");
      const d = distanceTo(token, doc);
      if ( d > maxDist ) return warn("LPM.Notify.TooFar", { d: Math.round(d), max: maxDist, units: canvas.scene.grid.units });
    }
    if ( lock.key ) {
      const key = findKey(actor, lock.key);
      if ( key ) {
        ui.notifications.info(F("LPM.Notify.UsedKey", { key: key.name }));
        return send({ type: "key", itemId: key.id }, doc, actor, token);
      }
    }
  }

  const gameId = lock.game === "random" || !(lock.game in GAMES) ? randomGameId() : lock.game;
  const arcane = gameId === "arcane";
  const tool = actor && !arcane ? bestTool(actor) : null;
  if ( !test && !arcane && S("requireTool") && !tool ) return warn("LPM.Notify.NeedTool");
  const skill = actor ? skillReduction(actor, tool, arcane) : 0;
  const toolRed = usesDndFormula() || arcane ? 0 : (tool?.reduction ?? 0);
  const tier = clamp(lock.tier - skill - toolRed, 1, TIERS);

  if ( openApps.has(doc.uuid) ) return openApps.get(doc.uuid).bringToFront?.();
  const watch = !test && S("spectate") !== "off" ? {
    actorName: actor?.name ?? game.user.name,
    emit: data => game.socket.emit(SOCKET, { type: "watch", userId: game.user.id, ...data })
  } : null;
  const app = new LockGameApp({
    gameId, tier, watch,
    info: { name: docName(doc), baseTier: lock.tier, skill, tool: toolRed ? tool : (tool ? { name: tool.name, reduction: 0 } : null) },
    onResult: (success, { cancelled, started } = {}) => {
      openApps.delete(doc.uuid);
      if ( test ) return;
      if ( cancelled && !started ) return;
      send({ type: "result", success, gameId, tier, toolItemId: tool?.itemId ?? null }, doc, actor, token);
    }
  });
  openApps.set(doc.uuid, app);
  app.render(true);
  return true;
}

/** Send a request to the active GM (or handle it locally if we are that GM). */
async function send(data, doc, actor, token) {
  const msg = {
    ...data,
    requestId: foundry.utils.randomID(),
    userId: game.user.id,
    sceneId: doc.parent.id,
    docType: doc.documentName,
    docId: doc.id,
    actorId: actor?.id ?? null,
    tokenId: token?.id ?? null
  };
  const wait = new Promise(resolve => {
    pending.set(msg.requestId, resolve);
    setTimeout(() => { if ( pending.delete(msg.requestId) ) resolve(null); }, 15000);
  });
  if ( game.users.activeGM?.isSelf ) applyRequest(msg);
  else game.socket.emit(SOCKET, msg);
  const ack = await wait;
  if ( ack ) onApplied(ack, doc, actor);
  return ack;
}

function onApplied(ack, doc, actor) {
  if ( ack.success ) {
    ui.notifications.info(L(ack.via === "key" ? "LPM.Notify.Unlocked" : "LPM.Notify.Picked"));
    if ( !isDoor(doc) && game.itempiles?.API ) {
      try {
        const API = game.itempiles.API;
        if ( API.isValidItemPile?.(doc) ) API.renderItemPileInterface?.(doc, { inspectingTarget: actor ?? undefined });
      } catch(err) { console.warn(`${MOD} | Item Piles interface`, err); }
    }
  } else {
    if ( ack.jammed ) ui.notifications.warn(L("LPM.Notify.NowJammed"));
    else ui.notifications.warn(L("LPM.Notify.Failed"));
    if ( ack.broke ) ui.notifications.warn(F("LPM.Notify.ToolBroke", { name: ack.broke }));
  }
}

/* ------------------------------------------------------------------ */
/*  Applying results (active GM only)                                   */
/* ------------------------------------------------------------------ */

function onWatch(msg) {
  if ( msg.userId === game.user.id ) return;
  const mode = S("spectate");
  if ( mode === "off" || (mode === "gm" && !game.user.isGM) || !S("watchOthers") ) return;
  const app = watchApps.get(msg.attemptId);
  if ( msg.action === "start" ) {
    if ( app ) app.close();
    const w = new LockWatchApp(msg);
    watchApps.set(msg.attemptId, w);
    w.render(true);
  } else if ( msg.action === "state" ) {
    app?.applyState(msg);
  } else if ( msg.action === "end" ) {
    watchApps.delete(msg.attemptId);
    app?.finish(msg);
  }
}

function onSocket(msg) {
  if ( !msg?.type ) return;
  if ( msg.type === "watch" ) return onWatch(msg);
  if ( msg.type === "applied" ) {
    if ( msg.to !== game.user.id ) return;
    const resolve = pending.get(msg.requestId);
    if ( resolve ) { pending.delete(msg.requestId); resolve(msg); }
    return;
  }
  if ( !game.users.activeGM?.isSelf ) return;
  applyRequest(msg).catch(err => console.error(`${MOD} | apply failed`, err));
}

function reply(msg, ack) {
  const out = { type: "applied", to: msg.userId, requestId: msg.requestId, ...ack };
  if ( msg.userId === game.user.id ) {
    const resolve = pending.get(msg.requestId);
    if ( resolve ) { pending.delete(msg.requestId); resolve(out); }
  } else {
    game.socket.emit(SOCKET, out);
  }
}

async function consume(item) {
  const q = item.system?.quantity;
  if ( Number.isFinite(q) && q > 1 ) await item.update({ "system.quantity": q - 1 });
  else await item.delete();
}

async function applyRequest(msg) {
  const scene = game.scenes.get(msg.sceneId);
  const doc = msg.docType === "Wall" ? scene?.walls.get(msg.docId) : scene?.tokens.get(msg.docId);
  if ( !doc ) return reply(msg, { success: false });
  const lock = getLock(doc);
  const st = getState(doc);
  const user = game.users.get(msg.userId);
  const actor = (msg.tokenId ? scene.tokens.get(msg.tokenId)?.actor : null) ?? game.actors.get(msg.actorId) ?? null;
  const token = msg.tokenId ? scene.tokens.get(msg.tokenId) : null;
  const ctx = { actor, token: token?.object ?? null, tokenDocument: token, lockDocument: doc, user, lock };

  if ( msg.type === "key" ) {
    const item = actor?.items.get(msg.itemId);
    if ( !item ) return reply(msg, { success: false });
    if ( lock.consumeKey ) await consume(item);
    await unlock(doc);
    await doc.setFlag(MOD, "state", { attempts: {}, cooldownUntil: {}, jammed: false });
    runMacro(lock.successMacro, { ...ctx, success: true, via: "key" });
    chat("LPM.Chat.Key", { actor: actor?.name ?? user?.name, lock: docName(doc), key: item.name }, msg.userId);
    return reply(msg, { success: true, via: "key" });
  }

  if ( msg.success ) {
    await unlock(doc);
    st.attempts[msg.userId] = 0;
    delete st.cooldownUntil[msg.userId];
    await doc.setFlag(MOD, "state", st);
    runMacro(lock.successMacro, { ...ctx, success: true, via: "pick" });
    chat("LPM.Chat.Success", { actor: actor?.name ?? user?.name, lock: docName(doc), game: gameLabel(msg.gameId), tier: tierLabel(msg.tier) }, msg.userId);
    return reply(msg, { success: true, via: "pick" });
  }

  st.attempts[msg.userId] = (st.attempts[msg.userId] ?? 0) + 1;
  if ( lock.cooldown > 0 ) st.cooldownUntil[msg.userId] = Date.now() + lock.cooldown * 1000;
  let jammed = false;
  if ( lock.maxAttempts > 0 && st.attempts[msg.userId] >= lock.maxAttempts && S("jam") ) {
    st.jammed = true;
    jammed = true;
  }
  await doc.setFlag(MOD, "state", st);
  let broke = null;
  const chance = S("toolBreakChance");
  if ( chance > 0 && msg.toolItemId && actor ) {
    const item = actor.items.get(msg.toolItemId);
    if ( item && Math.random() * 100 < chance ) {
      broke = item.name;
      await consume(item);
    }
  }
  runMacro(lock.failMacro, { ...ctx, success: false, via: "pick", jammed, broke });
  chat(jammed ? "LPM.Chat.Jammed" : "LPM.Chat.Fail", {
    actor: actor?.name ?? user?.name, lock: docName(doc), game: gameLabel(msg.gameId), tier: tierLabel(msg.tier),
    n: st.attempts[msg.userId]
  }, msg.userId, broke ? F("LPM.Chat.ToolBroke", { name: broke }) : "");
  return reply(msg, { success: false, jammed, broke });
}

async function unlock(doc, { silent = false } = {}) {
  if ( isDoor(doc) ) {
    const states = CONST.WALL_DOOR_STATES;
    const ds = S("openOnSuccess") ? states.OPEN : states.CLOSED;
    await doc.update({ ds }, { sound: !silent });
  } else {
    await doc.setFlag(MOD, "locked", false);
    try {
      const API = game.itempiles?.API;
      if ( API?.isItemPileLocked?.(doc) ) await API.unlockItemPile(doc);
    } catch(err) { console.warn(`${MOD} | Item Piles unlock`, err); }
  }
}

async function lock(doc) {
  if ( isDoor(doc) ) {
    if ( doc.ds === CONST.WALL_DOOR_STATES.OPEN ) await doc.update({ ds: CONST.WALL_DOOR_STATES.CLOSED }, { sound: false });
    await doc.update({ ds: CONST.WALL_DOOR_STATES.LOCKED }, { sound: false });
  } else {
    await doc.setFlag(MOD, "locked", true);
    try {
      const API = game.itempiles?.API;
      if ( API?.isValidItemPile?.(doc) && !API.isItemPileLocked?.(doc) ) await API.lockItemPile(doc);
    } catch(err) { console.warn(`${MOD} | Item Piles lock`, err); }
  }
}

function runMacro(name, scope) {
  if ( !name ) return;
  const macro = game.macros.getName(name);
  if ( !macro ) return console.warn(`${MOD} | macro "${name}" not found`);
  try { macro.execute(scope); } catch(err) { console.error(`${MOD} | macro "${name}" failed`, err); }
}

function chat(key, data, userId, extra = "") {
  if ( !S("chat") ) return;
  const whisper = new Set(ChatMessage.getWhisperRecipients("GM").map(u => u.id));
  if ( userId ) whisper.add(userId);
  const content = `<div class="lpm-chat"><i class="fa-solid fa-unlock-keyhole"></i> ${F(key, data)}${extra ? `<br>${extra}` : ""}</div>`;
  ChatMessage.create({ content, whisper: [...whisper], speaker: { alias: L("LPM.Title") } });
}

/* ------------------------------------------------------------------ */
/*  Entry points: door click, token double-click, Item Piles, hotkey    */
/* ------------------------------------------------------------------ */

function wrapMethod(path, fn) {
  if ( game.modules.get("lib-wrapper")?.active ) {
    libWrapper.register(MOD, path, fn, "MIXED");
    return;
  }
  const parts = path.split(".");
  const name = parts.pop();
  const target = parts.reduce((o, k) => o?.[k], globalThis);
  const orig = target[name];
  target[name] = function(...args) { return fn.call(this, orig.bind(this), ...args); };
}

function wrapInteractions() {
  wrapMethod("foundry.canvas.containers.DoorControl.prototype._onMouseDown", function(wrapped, event) {
    const doc = this.wall?.document;
    if ( event.button === 0 && shouldIntercept(doc) ) {
      event.stopPropagation();
      attempt(doc);
      return false;
    }
    return wrapped(event);
  });
  wrapMethod("foundry.canvas.placeables.Token.prototype._onClickLeft2", function(wrapped, event) {
    const doc = this.document;
    if ( shouldIntercept(doc) ) {
      attempt(doc);
      return;
    }
    return wrapped(event);
  });
}

function resolveTokenDoc(target) {
  if ( !target ) return null;
  if ( target instanceof TokenDocument ) return target;
  if ( target.document instanceof TokenDocument ) return target.document;
  if ( target instanceof Actor ) return target.token ?? target.getActiveTokens?.()[0]?.document ?? null;
  return null;
}

function onItemPilesOpen(target) {
  const doc = resolveTokenDoc(target);
  if ( !doc || !shouldIntercept(doc) ) return;
  if ( !openApps.has(doc.uuid) ) attempt(doc);
  return false;
}

function pickNearest() {
  if ( !canvas.ready ) return;
  const { token } = userActor();
  if ( !token ) return ui.notifications.warn(L("LPM.Notify.NoToken"));
  const maxDist = S("interactionDistance");
  const docs = [
    ...canvas.walls.placeables.map(w => w.document).filter(d => d.door > 0),
    ...canvas.tokens.placeables.map(t => t.document)
  ].filter(d => isLocked(d) && isPickable(d));
  let best = null;
  for ( const d of docs ) {
    const dist = distanceTo(token, d);
    if ( maxDist > 0 && dist > maxDist ) continue;
    if ( !best || dist < best.dist ) best = { doc: d, dist };
  }
  if ( !best ) return ui.notifications.warn(L("LPM.Notify.NothingNear"));
  attempt(best.doc);
}

/* ------------------------------------------------------------------ */
/*  GM UI: wall config button, token HUD button                         */
/* ------------------------------------------------------------------ */

function lockSummary(doc) {
  const l = getLock(doc);
  if ( !l.enabled ) return L("LPM.Config.SummaryOff");
  return `${gameLabel(l.game)} · ${tierLabel(l.tier)}${l.key ? ` · ${L("LPM.Config.Key")}: ${l.key}` : ""}`;
}

function onRenderWallConfig(app, element) {
  if ( !game.user.isGM ) return;
  const el = element instanceof HTMLElement ? element : element?.[0];
  const doc = app.document;
  if ( !el || !doc || !(doc.door > 0) || el.querySelector(".lpm-wall-group") ) return;
  const group = document.createElement("div");
  group.className = "form-group lpm-wall-group";
  group.innerHTML = `<label>${L("LPM.Title")}</label><div class="form-fields"></div><p class="hint">${foundry.utils.escapeHTML(lockSummary(doc))}</p>`;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = `<i class="fa-solid fa-unlock-keyhole"></i> ${L("LPM.Config.Open")}`;
  btn.addEventListener("click", () => new LockConfigApp(doc).render(true));
  group.querySelector(".form-fields").append(btn);
  const footer = el.querySelector("footer.form-footer, .form-footer");
  if ( footer ) footer.before(group);
  else (el.querySelector("form") ?? el).append(group);
  app.setPosition?.({ height: "auto" });
}

function onRenderTokenHUD(app, element) {
  if ( !game.user.isGM ) return;
  const el = element instanceof HTMLElement ? element : element?.[0];
  const doc = app.document ?? app.object?.document;
  const col = el?.querySelector(".col.right");
  if ( !doc || !col || col.querySelector(".lpm-hud") ) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon lpm-hud";
  btn.dataset.tooltip = L("LPM.Config.Open");
  btn.innerHTML = `<i class="fa-solid ${isLocked(doc) ? "fa-lock" : "fa-lock-open"}"></i>`;
  btn.addEventListener("click", event => {
    event.preventDefault();
    new LockConfigApp(doc).render(true);
  });
  col.append(btn);
}

/* ------------------------------------------------------------------ */
/*  Hooks + API                                                          */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  registerSettings();
  game.keybindings.register(MOD, "pickNearest", {
    name: "LPM.Key.PickNearest.Name",
    hint: "LPM.Key.PickNearest.Hint",
    editable: [{ key: "KeyL" }],
    onDown: () => { pickNearest(); return true; }
  });
  wrapInteractions();
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET, onSocket);
  game.modules.get(MOD).api = {
    GAMES, TIERS, tierLabel, gameLabel,
    attempt, pickNearest,
    configure: doc => new LockConfigApp(doc).render(true),
    demo: () => new DemoApp().render(true),
    getLock, getState, isLocked, isPickable, docName,
    setLock: (doc, data) => doc.setFlag(MOD, "lock", data),
    resetState: doc => doc.setFlag(MOD, "state", { attempts: {}, cooldownUntil: {}, jammed: false }),
    lock, unlock
  };
  console.log(`${MOD} | ready`);
});

Hooks.on("renderWallConfig", onRenderWallConfig);
Hooks.on("renderTokenHUD", onRenderTokenHUD);
Hooks.on("item-piles-preOpenInterface", onItemPilesOpen);
