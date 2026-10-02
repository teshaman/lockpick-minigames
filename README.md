# Lockpick Minigames

Turns locked doors and container tokens in Foundry VTT into interactive lock-picking minigames.
System agnostic; sensible defaults for dnd5e.

## What players get

Click a locked door (or double-click a locked container token) within reach of your token and a lock window opens.
Beat the minigame and the GM's client unlocks the door or container; fail and the attempt is recorded.
Press **L** to pick the nearest lock in reach.

| Minigame | How it plays |
|---|---|
| Sweet Spot Lock | Move the pick around the dial to find the sweet spot, hold the mouse button to turn the lock. Turning in the wrong place strains the pick. |
| Dual Rotation Lock | Hold Space (or the mouse button) while keeping the cursor on a drifting glow. |
| Pin Tumbler Lock | Click each bouncing pin at the top of its travel. Limited errors. |
| Skill Check Lock | Click or press Space when the sweeping needle is inside the highlighted arc; the blue centre counts double. |
| Tension Lock | Hold Space to build tension inside a moving green band while clicking the glowing targets on the dial. |
| Ward Trace Lock | Click S, then trace the cursor along a winding keyway to E without touching the walls. |

Fifteen difficulty tiers (Trivial to Legendary) scale every game: narrower zones, faster movement, more pins and targets, fewer spare picks.

## What GMs get

- **Door locks**: lock a door as usual (right-click its control). With *Locked doors are pickable* on, every locked door uses the world defaults. Open the wall's config sheet and press **Lock settings…** to give a door its own minigame, tier, key item, attempt limit, cooldown and macros.
- **Container locks**: select a token, press the lock button in its HUD, set *Pickable* to Yes and press **Lock**. Locked Item Piles containers open their inventory automatically after a successful pick, and *Lock* / *Unlock* also lock or unlock the pile.
- **Keys**: a character carrying an item named like the lock's key opens it without a minigame (optionally consuming the item).
- **Tools**: list tool item names with a tier reduction in the settings (`Thieves' Tools=2; Masterwork Picks=4`). The best tool carried lowers the tier; tools can be required, and can break on failure.
- **Skill**: an actor data path (default `system.skills.slt.total` on dnd5e) lowers the tier by `floor(value / divisor)`.
- **Attempts, cooldowns, jamming**: per-player attempt limits and failure cooldowns, globally or per lock. When attempts run out the lock can jam until the GM resets it from the lock settings.
- **Macros**: name a macro to run on success or failure; it receives `actor`, `token`, `lockDocument`, `user`, `success`, `via` and `jammed`.
- **Playground**: *Module Settings → Lockpick Minigames → Open the playground* runs any game at any tier with no lock. GMs can also Ctrl-click a locked door to try its minigame for real.
- **Chat**: every outcome is whispered to the GM and the player.

An active GM client must be connected; players never write to the scene themselves.

## API

```js
const api = game.modules.get("lockpick-minigames").api;
api.attempt(doc);              // start an attempt on a WallDocument or TokenDocument
api.configure(doc);            // open the lock settings window
api.lock(doc); api.unlock(doc);
api.resetState(doc);           // clear attempts, cooldowns and jam
api.getLock(doc);              // effective configuration
api.demo();                    // playground
```

Lock configuration lives in `flags.lockpick-minigames.lock`, attempt state in `flags.lockpick-minigames.state`, and a token's locked state in `flags.lockpick-minigames.locked`.

## Install

Paste this manifest URL into Foundry's **Install Module** dialog:

`https://github.com/teshaman/lockpick-minigames/releases/latest/download/module.json`

Or upload the packaged zip to The Forge. Optional: lib-wrapper, Item Piles.
