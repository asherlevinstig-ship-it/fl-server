// ==========================================
// CLIENT UI META (Tooltips, Targeting, Costs)
// ==========================================
export const CARD_META: Record<
  string, 
  { label: string; apCost: number; description: string; range: number; aoeRadius: number; kind: "melee" | "ranged" | "heal" | "ultimate" | "debuff" }
> = {
  // --- DUELIST ---
  quick_slash: { label: "Quick Slash", apCost: 1, description: "Fast melee strike", range: 2, aoeRadius: 0, kind: "melee" },
  dash_strike: { label: "Dash Strike", apCost: 2, description: "Leap and strike", range: 4, aoeRadius: 0, kind: "melee" },
  riposte: { label: "Riposte", apCost: 2, description: "Heavy tactical strike", range: 2, aoeRadius: 0, kind: "melee" },
  blade_storm: { label: "Blade Storm", apCost: 0, description: "Requires 5 Stacks. Strike ALL adjacent enemies.", range: 0, aoeRadius: 2, kind: "ultimate" },

  // --- VANGUARD ---
  heavy_blow: { label: "Heavy Blow", apCost: 2, description: "Crushing melee strike.", range: 2, aoeRadius: 0, kind: "melee" },
  cleave: { label: "Cleave", apCost: 3, description: "Wide sweeping arc.", range: 2, aoeRadius: 1, kind: "melee" },
  earthquake: { label: "Earthquake", apCost: 4, description: "Stuns enemies for 2 seconds.", range: 0, aoeRadius: 3, kind: "ultimate" },

  // --- ARCANIST ---
  arcane_bolt: { label: "Arcane Bolt", apCost: 1, description: "Fast homing magic.", range: 8, aoeRadius: 0, kind: "ranged" },
  fireball: { label: "Fireball", apCost: 3, description: "Ranged explosion.", range: 7, aoeRadius: 1, kind: "ranged" },
  frost_nova: { label: "Frost Nova", apCost: 3, description: "Roots enemies in ice for 3s.", range: 6, aoeRadius: 2, kind: "ranged" },
  meteor: { label: "Meteor", apCost: 5, description: "Devastating cosmic impact.", range: 8, aoeRadius: 3, kind: "ultimate" },

  // --- SHADOW PATHWAY ---
  mark_of_weakness: { label: "Mark of Weakness", apCost: 1, description: "Apply 2 Shadow Marks to target.", range: 5, aoeRadius: 0, kind: "debuff" },
  void_execute: { label: "Void Execute", apCost: 3, description: "Deals 5 base + 15 DMG per mark.", range: 2, aoeRadius: 0, kind: "melee" },
  life_drain: { label: "Life Drain", apCost: 2, description: "Steal 10 HP from target.", range: 5, aoeRadius: 0, kind: "ranged" },

  // --- LIGHT PATHWAY ---
  flash_heal: { label: "Flash Heal", apCost: 1, description: "Quick burst of healing.", range: 0, aoeRadius: 0, kind: "heal" },
  holy_nova: { label: "Holy Nova", apCost: 3, description: "Massive AoE team heal.", range: 0, aoeRadius: 3, kind: "heal" },
  smite: { label: "Smite", apCost: 2, description: "Call down a pillar of light.", range: 6, aoeRadius: 0, kind: "ranged" },

  // --- BERSERKER PATHWAY ---
  reckless_swing: { label: "Reckless Swing", apCost: 1, description: "Wild, high-damage attack.", range: 2, aoeRadius: 0, kind: "melee" },
  bloodthirst: { label: "Bloodthirst", apCost: 2, description: "Heal through sheer rage.", range: 0, aoeRadius: 0, kind: "heal" },
};

// ==========================================
// SERVER LOGIC DEFS (Damage, Status Effects)
// ==========================================
export type CardDefinition = {
  id: string;
  apCost: number;
  range: number;
  aoeRadius: number;
  kind: "melee" | "ranged" | "heal" | "ultimate" | "debuff";
  damage?: number;
  heal?: number;
  stun?: number; // Duration in seconds/ticks
  root?: number; // Duration in seconds/ticks
};

export const CARD_DEFS: Record<string, CardDefinition> = {
  // --- DUELIST ---
  quick_slash: { id: "quick_slash", apCost: 1, range: 2, aoeRadius: 0, kind: "melee", damage: 15 },
  dash_strike: { id: "dash_strike", apCost: 2, range: 4, aoeRadius: 0, kind: "melee", damage: 20 },
  riposte: { id: "riposte", apCost: 2, range: 2, aoeRadius: 0, kind: "melee", damage: 25 },
  blade_storm: { id: "blade_storm", apCost: 0, range: 0, aoeRadius: 2.5, kind: "ultimate", damage: 40 },

  // --- VANGUARD ---
  heavy_blow: { id: "heavy_blow", apCost: 2, range: 2, aoeRadius: 0, kind: "melee", damage: 22 },
  cleave: { id: "cleave", apCost: 3, range: 2, aoeRadius: 1.5, kind: "melee", damage: 18 },
  earthquake: { id: "earthquake", apCost: 4, range: 0, aoeRadius: 3, kind: "ultimate", damage: 15, stun: 2 },

  // --- ARCANIST ---
  arcane_bolt: { id: "arcane_bolt", apCost: 1, range: 8, aoeRadius: 0, kind: "ranged", damage: 12 },
  fireball: { id: "fireball", apCost: 3, range: 7, aoeRadius: 1.5, kind: "ranged", damage: 25 },
  frost_nova: { id: "frost_nova", apCost: 3, range: 6, aoeRadius: 2, kind: "ranged", damage: 10, root: 3 },
  meteor: { id: "meteor", apCost: 5, range: 8, aoeRadius: 3, kind: "ultimate", damage: 50 },

  // --- SHADOW PATHWAY ---
  mark_of_weakness: { id: "mark_of_weakness", apCost: 1, range: 5, aoeRadius: 0, kind: "debuff" },
  void_execute: { id: "void_execute", apCost: 3, range: 2, aoeRadius: 0, kind: "melee", damage: 5 }, // +15 per mark calculated in room
  life_drain: { id: "life_drain", apCost: 2, range: 5, aoeRadius: 0, kind: "ranged", damage: 15, heal: 15 },

  // --- LIGHT PATHWAY ---
  flash_heal: { id: "flash_heal", apCost: 1, range: 0, aoeRadius: 0, kind: "heal", heal: 25 },
  holy_nova: { id: "holy_nova", apCost: 3, range: 0, aoeRadius: 3, kind: "heal", heal: 40 },
  smite: { id: "smite", apCost: 2, range: 6, aoeRadius: 0, kind: "ranged", damage: 20 },

  // --- BERSERKER PATHWAY ---
  reckless_swing: { id: "reckless_swing", apCost: 1, range: 2, aoeRadius: 0, kind: "melee", damage: 30 },
  bloodthirst: { id: "bloodthirst", apCost: 2, range: 0, aoeRadius: 0, kind: "heal", heal: 35 },
};

// ==========================================
// STARTING DECKS
// ==========================================
export const CLASS_DECKS: Record<string, string[]> = {
  duelist: ["quick_slash", "quick_slash", "dash_strike", "riposte", "blade_storm"],
  vanguard: ["heavy_blow", "heavy_blow", "cleave", "cleave", "earthquake"],
  arcanist: ["arcane_bolt", "arcane_bolt", "fireball", "frost_nova", "meteor"]
};

export const PATHWAY_DECKS: Record<string, string[]> = {
  shadow: ["mark_of_weakness", "mark_of_weakness", "void_execute", "life_drain"],
  light: ["flash_heal", "flash_heal", "smite", "holy_nova"],
  berserker: ["reckless_swing", "reckless_swing", "bloodthirst", "bloodthirst"]
};