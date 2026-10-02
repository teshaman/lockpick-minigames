# Lockpick Minigames

Turns locked doors and container tokens in Foundry VTT into interactive lock-picking minigames.
System agnostic; sensible defaults for dnd5e.

## What players get

Click a locked door (or double-click a locked container token) within reach of your token and a lock window opens.
Beat the minigame and the GM's client unlocks the door or container; fail and the attempt is recorded.
Press **L** to pick the nearest lock in reach.

| Minigame | How it plays |
|---|---|
| Sweet Spot Lock | The pick follows the mouse through a full circle. Hold the left button to turn the cylinder; on the sweet spot it turns all the way, elsewhere it stops part-way and the pick strains, reddens and breaks. One pick. |
| Dual Rotation Lock | Two phases. Sweep the cursor over the dial: a glow grows warmer near a hidden spot; hold still on it. Then the spot wanders: hold Space (or the left button) and keep the cursor on it while the rotation fills. |
| Pin Tumbler Lock | Oblivion-style pins. Click a column to push its pin up; it pauses briefly at its own notch height, then drops. Click again during the pause to set it. Wrong-time clicks are errors; the first push reveals the notch. Higher tiers add pins, shorten the pause, cut the allowed errors and add fake pauses. |
| Skill Check Lock | A needle sweeps the ring while the highlighted arc drifts the other way. Click or press Space inside the arc: yellow counts one, the thin blue caps count two. |
| Tension Lock | Click the dial to start. Hold Space, the right mouse button, or the left button on the gauge to build tension; keep the marker in the moving green band and left-click the glowing targets before their ring runs out. The red cap burns the pick. |
| Ward Trace Lock | Click S and trace the keyway to E without touching the walls. Ten pattern families (zigzag, wave, stairs, switchbacks, hairpins, orbits, petals, spirals, grid walks, grid mazes with safe dead ends); higher tiers are narrower, longer and fogged except near the cursor. |

Every lock window shows a short "How to" text under the bars. Fifteen difficulty tiers (Trivial to Legendary) scale every game: narrower zones, faster movement, more pins and targets, shorter pauses, fewer allowed errors.

## What GMs get

- **Door locks**: lock a door as usual (right-click its control). With *Locked doors are pickable* on, every locked door uses the world defaults. Open the wall's config sheet and press **Lock settings…** to give a door its own minigame, tier, key item, attempt limit, cooldown and macros.
- **Container locks**: select a token, press the lock button in its HUD, set *Pickable* to Yes and press **Lock**. Locked Item Piles containers open their inventory automatically after a successful pick, and *Lock* / *Unlock* also lock or unlock the pile.
- **Keys**: a character carrying an item named like the lock's key opens it without a minigame (optionally consuming the item).
- **Tools**: list tool item names with a tier reduction in the settings (`Thieves' Tools=2; Masterwork Picks=4`). The best tool carried lowers the tier; tools can be required, and can break on failure.
- **Skill**: on dnd5e the character's points are Sleight of Hand total plus the thieves' tools proficiency bonus, doubled when proficient in both; the tier drops by `floor(points / divisor)` (divisor 2 by default). Other systems, or with the dnd5e formula switched off, use an actor data path such as `system.abilities.dex.mod`. This applies to every minigame, on top of the carried tool reduction.
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
