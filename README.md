# Lockpick Minigames

**Info page:** https://teshaman.github.io/lockpick-minigames/ · Free and open source (MIT) · see [Credits and disclaimer](#credits-and-disclaimer)

Turns locked doors and container tokens in Foundry VTT into interactive lock-picking minigames.
System agnostic; sensible defaults for dnd5e.

## What players get

Click a locked door (or double-click a locked container token) within reach of your token and a lock window opens.
Beat the minigame and the GM's client unlocks the door or container; fail and the attempt is recorded.
Press **L** to pick the nearest lock in reach.

| Minigame | How it plays |
|---|---|
| Sweet Spot Lock | The pick follows the mouse through a full circle. Hold the left button to turn the cylinder; on the sweet spot it turns all the way, elsewhere it stops part-way and the pick strains, reddens and breaks. One pick. From tier 7 the mechanism settles after a strained push and the spot shifts. |
| Dual Rotation Lock | Two phases. Sweep the cursor over the dial: a blue glow grows brighter near a hidden spot; hold still on it. Then the spot wanders: hold Space (or the left button) and keep the cursor on it while the rotation fills. From tier 9 it blinks out briefly. |
| Pin Tumbler Lock | Pins bind in a hidden random order. Push a pin to test it: only the binding pin pauses at its own notch height, the rest spring back (and turn dull once tested). Click the binder during its pause to set it. A pin's first push per round is free, re-pushing a tested pin costs health; up to tier 9 a wrong push makes the binder glow briefly. Wrong-time clicks are errors and, at higher tiers, drop the last or all set pins. Low tiers glow the binder; fake pauses from tier 7. |
| Skill Check Lock | A needle sweeps the ring while the highlighted arc drifts the other way. Click or press Space inside the arc: yellow counts one, the thin blue caps count two. A red trap arc makes a miss cost half again as much, and from tier 8 the needle breathes. |
| Tension Lock | Click the dial to start. Hold Space, the right mouse button, or the left button on the gauge to build tension; keep the marker in the moving (and, from tier 7, breathing) green band and left-click the glowing targets before their ring runs out. From tier 10 the pick slips and tension drops suddenly. The red cap burns the pick. |
| Ward Trace Lock | Click S and trace the keyway to E without touching the walls. Ten pattern families (zigzag, wave, stairs, switchbacks, hairpins, orbits, petals, spirals, grid walks, grid mazes with safe dead ends); higher tiers are narrower, longer and fogged except near the cursor, and from tier 9 the walls breathe and a timer runs. |
| Arcane Lock | A magical ward. Runes orbit a sigil and flare in a sequence that grows each round; click them back in order while they keep moving. Wrong runes damage the pick and replay the sequence; the mana ring drains while you cast and ends the attempt when empty. Not part of the random pick: choose it on a lock. Tools do not apply; on dnd5e Arcana plus the spellcasting modifier lower the tier (doubled when proficient in Arcana and a caster). Higher tiers add runes and rounds, spin and flip the orbit, and shuffle rune positions between rounds. |

Every lock window shows a short "How to" text under the bars. A failed Arcane Lock can alert the caster who placed it through the lock's failure macro. Fifteen difficulty tiers (Trivial to Legendary) scale every game: narrower zones, faster movement, more pins and targets, shorter pauses, fewer allowed errors.

## What GMs get

- **Door locks**: lock a door as usual (right-click its control). With *Locked doors are pickable* on, every locked door uses the world defaults. Open the wall's config sheet and press **Lock settings…** to give a door its own minigame, tier, key item, attempt limit, cooldown and macros.
- **Item locks**: open an item's sheet (a collar, manacles, a strongbox in a pack) and press the lock button in its header to configure it, set *Pickable* to Yes and press **Lock**. The wearer, or anyone within reach of the wearer's token, can pick it: owners get a **Pick lock** header button on the item sheet, everyone can use the **L** hotkey. On success the item can simply be marked unlocked, unequipped, or removed from the inventory, and the success macro runs.
- **Container locks**: select a token, press the lock button in its HUD, set *Pickable* to Yes and press **Lock**. Locked Item Piles containers open their inventory automatically after a successful pick, and *Lock* / *Unlock* also lock or unlock the pile.
- **Keys**: a character carrying an item named like the lock's key opens it without a minigame (optionally consuming the item).
- **Tools**: list tool item names with a tier reduction in the settings (`Thieves' Tools=2; Masterwork Picks=4`). The best tool carried lowers the tier; tools can be required, and can break on failure.
- **Skill**: on dnd5e the character's points are Sleight of Hand total, plus the thieves' tools proficiency bonus, plus the flat amount of the best carried tool from the tools list (so an unproficient character still gains from carrying tools), doubled when proficient in both the skill and the tools; the tier drops by `floor(points / divisor)` (divisor 2 by default). Other systems, or with the dnd5e formula switched off, use an actor data path such as `system.abilities.dex.mod` with carried tools as a separate reduction. This applies to every minigame.
- **Attempts, cooldowns, jamming**: per-player attempt limits and failure cooldowns, globally or per lock. When attempts run out the lock can jam until the GM resets it from the lock settings.
- **Macros**: name a macro to run on success or failure; it receives `actor`, `token`, `lockDocument`, `user`, `success`, `via` and `jammed`.
- **Playground**: *Module Settings → Lockpick Minigames → Open the playground* runs any game at any tier with no lock. GMs can also Ctrl-click a locked door to try its minigame for real.
- **Chat**: every outcome is whispered to the GM and the player.
- **Smoothness**: while a lock window is open the client caps Foundry's scene canvas at 20 FPS (per-client setting, 0 to disable) so the minigame gets the frames on heavy scenes.
- **Spectators**: while a player picks a lock, everyone else (or only the GM, or nobody, per the world setting) gets a small prompt at the top of the screen: "X is picking Y — Watch". Pressing Watch opens a live read-only window of the same game, joining at the current state; each client can instead choose to open it automatically or never. The window closes itself two seconds after the result.

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

## Credits and disclaimer

**The idea is Reslin's.** Lock-picking minigames on Foundry doors come from the paid *Lock Picking* module by Reslin
(https://foundryvtt.com/packages/lock-picking). This module is an independent, from-scratch take on that idea for my own
table; it contains none of Reslin's code or assets and is not affiliated with or endorsed by Reslin. If you like the concept,
support the original: **https://www.patreon.com/cw/Reslinfvtt**.

**I own none of this code.** I claim no ownership of it and release the whole module as free, open-source software. No code or asset from any other module or author has been copied into it. No warranty;
use at your own risk.

## License

[MIT](LICENSE).
