# lockpick-minigames — Changelog

All notable changes to this module. Newest version first.
Older packaged zips are kept in `backups/` and are never deleted.

## 1.5.0 — 2026-10-02
- New seventh minigame, Arcane Lock: runes orbit a sigil and flare in a sequence that grows each round; click them back in order while they keep moving. Wrong runes damage the pick and replay the sequence; a mana ring drains while casting and ends the attempt when empty. Higher tiers add runes and rounds, spin and flip the orbit, and shuffle rune positions between rounds.
- Arcane Locks are never part of the random pick; choose them on a lock or in the playground. They ignore thieves' tools; on dnd5e Arcana plus the spellcasting ability modifier lower the tier (doubled when proficient in Arcana and a caster), other systems use the new arcane skill path setting.

## 1.4.1 — 2026-10-02
- Sweet Spot: the dial no longer glows on the sweet spot above tier 2, so the partial turn is the only feedback.
- Tension: the gauge falls about half as fast when released.

## 1.4.0 — 2026-10-02
- Pin Tumbler: pins bind in a hidden random order that changes every attempt; only the binding pin pauses at its notch, the others spring straight back and turn dull once tested this round.
- Two test pushes per round are free, further pushes cost pick health; up to tier 9 a wrong push makes the binding pin's base glow for a moment, on the lowest tiers it glows all the time.
- Set pins advance the order; errors still drop the last or all set pins at higher tiers. How-to text and README updated.

## 1.3.0 — 2026-10-02
- Pin Tumbler: every pin has its own rise speed and pause length, rhythms re-roll after each set pin, the first push of a pin is free and later re-tests cost pick health, and an error drops the last set pin from tier 6 and every set pin from tier 11.
- Sweet Spot: from tier 7 the mechanism settles after a strained push and the sweet spot shifts a little.
- Dual Rotation: from tier 9 the spot blinks out briefly while you track it.
- Skill Check: a red trap arc makes a miss cost half again as much, and from tier 8 the needle speeds up and slows down.
- Tension: the band breathes from tier 7, and from tier 10 the pick slips and tension drops suddenly.
- Ward Trace: from tier 9 the walls breathe and a timer runs; running out resets the wards.
- How-to texts and README updated; README lists an Arcane Lock (locked by magic) as a written idea.

## 1.2.0 — 2026-10-02
- Dual Rotation: the hidden spot is now a blue ring with a white core and a dark halo, and the search glow is cool blue-white, so it stands out on the brass dial.
- Harder difficulty curve: mid tiers are eased upward (tier 10 plays at about 73 percent of the scale instead of 64) and the top-end values are harsher in every game (tighter sweet spot and tracking radius, faster pins with shorter pauses and earlier fakes, narrower and faster-drifting skill arc with more hits, thinner tension band with faster drift and more targets, narrower keyways with earlier fog).

## 1.1.1 — 2026-10-02
- dnd5e skill formula: the flat amount of a carried thieves' tool now joins the skill points (Sleight of Hand + tool proficiency bonus + carried tool, doubled when proficient in both), so an unproficient character with tools still benefits; carried tools are no longer a separate reduction on dnd5e.

## 1.1.0 — 2026-10-02
- Sweet Spot: the pick travels the full circle, one pick, strain reddens it before it breaks.
- Dual Rotation: new hot/cold search phase before tracking the wandering spot.
- Pin Tumbler: Oblivion-style pins with hidden notch heights, test pushes, pauses, fewer errors and fake pauses at high tiers.
- Skill Check: blue double-value caps at both ends of a drifting arc; Tension: Space, right mouse button or the gauge build tension, marker and countdown rings, works reliably.
- Ward Trace: ten keyway families including grid mazes with safe dead ends; narrower, longer and fogged at high tiers.
- Harder tuning across all tiers, a How-to text in every lock window, dnd5e skill formula (Sleight of Hand + thieves' tools proficiency, doubled with both).

## 1.0.0 — 2026-10-02
- Initial release: six lock-picking minigames (Sweet Spot, Dual Rotation, Pin Tumbler, Skill Check, Tension, Ward Trace) on locked doors and container tokens.
- Fifteen difficulty tiers, scaled by a skill attribute path and carried tools.
- Keys (optionally consumed), attempt limits, failure cooldowns, jamming, tool breakage, success/failure macros.
- Wall config and token HUD lock settings, Item Piles container support, L hotkey, chat whispers, settings playground.
