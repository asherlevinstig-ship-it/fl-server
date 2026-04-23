export type ItemType = "consumable" | "weapon" | "armor" | "tool" | "material" | "utility" | "decoration" | "cosmetic";

// Define the specific body slots for the 3D procedural armor rendering
export type EquipSlot = "head" | "chest" | "back" | "legs" | "feet" | "mainhand" | "offhand";

// The official rarity/progression system
export type ItemRank = "Iron" | "Bronze" | "Silver" | "Gold" | "Diamond";

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  rank: ItemRank; // Required for glowing materials and UI styling
  equipSlot?: EquipSlot; // Tells the inventory which slot this goes into
  icon: string;
  desc: string;
  buyPrice: number;
  wholesalePrice: number;
  stats?: {
    hp?: number;
    mp?: number;
    ap?: number;
    atk?: number;
    def?: number;
    spd?: number;
    gatherDamage?: number;
    hunger?: number; // <-- Added to support food mechanics
  };
}

// Helper to get the hex color for UI text and 3D emissive glowing effects
export const RANK_COLORS: Record<ItemRank, string> = {
    "Iron": "#cccccc",    // Standard Grey/White
    "Bronze": "#cd7f32",  // Bronze/Orange
    "Silver": "#c0c0c0",  // Bright Silver
    "Gold": "#ffd700",    // Brilliant Yellow
    "Diamond": "#00ffff"  // Cyan/Diamond Blue
};

export const ITEM_DB: Record<string, ItemDef> = {
  // --- CONSUMABLES ---
  "Crispy Apple": {
    id: "itm_apple", name: "Crispy Apple", type: "consumable", rank: "Iron", icon: "🍎",
    desc: "Restores 10 HP.", buyPrice: 5, wholesalePrice: 2, stats: { hp: 10 }
  },
  "Rye Bread": {
    id: "itm_bread", name: "Rye Bread", type: "consumable", rank: "Iron", icon: "🍞",
    desc: "Restores 30 HP.", buyPrice: 15, wholesalePrice: 7, stats: { hp: 30 }
  },
  "Roasted Boar Meat": {
    id: "itm_meat", name: "Roasted Boar Meat", type: "consumable", rank: "Iron", icon: "🍖",
    desc: "Restores 100 HP.", buyPrice: 40, wholesalePrice: 20, stats: { hp: 100 }
  },
  "Minor Health Potion": {
    id: "itm_hp_pot", name: "Minor Health Potion", type: "consumable", rank: "Iron", icon: "🧪",
    desc: "Instantly restores 50 HP.", buyPrice: 25, wholesalePrice: 12, stats: { hp: 50 }
  },
  "Mana Vial": {
    id: "itm_mp_pot", name: "Mana Vial", type: "consumable", rank: "Iron", icon: "🧪",
    desc: "Restores 2 MP.", buyPrice: 30, wholesalePrice: 15, stats: { mp: 2 }
  },
  "Stamina Elixir": {
    id: "itm_ap_pot", name: "Stamina Elixir", type: "consumable", rank: "Iron", icon: "🧪",
    desc: "Restores 3 AP.", buyPrice: 50, wholesalePrice: 25, stats: { ap: 3 }
  },

  // --- FISHING CATCHES (Consumables/Utility) ---
  "Common Carp": {
    id: "itm_fish_carp", name: "Common Carp", type: "consumable", rank: "Iron", icon: "🐟",
    desc: "A very common fish. Restores 25 Hunger.", buyPrice: 10, wholesalePrice: 4, stats: { hunger: 25 }
  },
  "Silver Trout": {
    id: "itm_fish_trout", name: "Silver Trout", type: "consumable", rank: "Silver", icon: "🐠",
    desc: "A shimmering fish from clear waters. Restores 50 Hunger and 5 MP.", buyPrice: 45, wholesalePrice: 20, stats: { hunger: 50, mp: 5 }
  },
  "Golden Koi": {
    id: "itm_fish_koi", name: "Golden Koi", type: "consumable", rank: "Gold", icon: "🐡",
    desc: "A rare, beautiful fish. Restores 100 Hunger and grants 10 AP.", buyPrice: 250, wholesalePrice: 120, stats: { hunger: 100, ap: 10 }
  },
  "Old Boot": {
    id: "itm_fish_boot", name: "Old Boot", type: "utility", rank: "Iron", icon: "👢",
    desc: "Waterlogged and smelly. Utterly useless.", buyPrice: 1, wholesalePrice: 0
  },

  // --- WEAPONS & OFFHAND ---
  "Wooden Sword": {
    id: "itm_wood_sword", name: "Wooden Sword", type: "weapon", rank: "Iron", equipSlot: "mainhand", icon: "🗡️",
    desc: "A basic training sword made of wood. Better than your fists. +2 ATK.", buyPrice: 50, wholesalePrice: 25, stats: { atk: 2 }
  },
  "Iron Sword": {
    id: "itm_iron_sword", name: "Iron Sword", type: "weapon", rank: "Iron", equipSlot: "mainhand", icon: "⚔️",
    desc: "Basic melee weapon. +5 ATK.", buyPrice: 150, wholesalePrice: 75, stats: { atk: 5 }
  },
  "Bronze-Forged Battleaxe": {
    id: "itm_bronze_axe", name: "Bronze-Forged Battleaxe", type: "weapon", rank: "Bronze", equipSlot: "mainhand", icon: "🪓",
    desc: "A heavy axe humming with faint magic. +15 ATK.", buyPrice: 500, wholesalePrice: 250, stats: { atk: 15 }
  },
  "Golden Sunblade": {
    id: "itm_gold_sword", name: "Golden Sunblade", type: "weapon", rank: "Gold", equipSlot: "mainhand", icon: "🗡️",
    desc: "Radiates intense heat. +50 ATK.", buyPrice: 10000, wholesalePrice: 5000, stats: { atk: 50 }
  },
  "Legendary Void Blade": {
    id: "itm_void_blade", name: "Legendary Void Blade", type: "weapon", rank: "Diamond", equipSlot: "mainhand", icon: "🌌",
    desc: "An apocalyptic weapon forged from concentrated shadow essence. +150 ATK.", buyPrice: 50000, wholesalePrice: 25000, stats: { atk: 150 }
  },
  "Wooden Shield": {
    id: "itm_wood_shield", name: "Wooden Shield", type: "armor", rank: "Iron", equipSlot: "offhand", icon: "🛡️",
    desc: "Basic defense. +2 DEF.", buyPrice: 100, wholesalePrice: 50, stats: { def: 2 }
  },

  // --- TOOLS ---
  "Iron Axe": {
    id: "itm_iron_axe", name: "Iron Axe", type: "tool", rank: "Iron", equipSlot: "mainhand", icon: "🪓",
    desc: "Chops wood faster.", buyPrice: 120, wholesalePrice: 60, stats: { gatherDamage: 3 }
  },
  "Iron Pickaxe": {
    id: "itm_iron_pick", name: "Iron Pickaxe", type: "tool", rank: "Iron", equipSlot: "mainhand", icon: "⛏️",
    desc: "Mines stone faster.", buyPrice: 120, wholesalePrice: 60, stats: { gatherDamage: 3 }
  },

  // --- ARMOR: HEAD ---
  "Silk Bandana": {
    id: "itm_bandana", name: "Silk Bandana", type: "armor", rank: "Iron", equipSlot: "head", icon: "🧣",
    desc: "Keeps sweat out of eyes.", buyPrice: 40, wholesalePrice: 20, stats: { spd: 1 }
  },

  // --- ARMOR: CHEST ---
  "Leather Tunic": {
    id: "itm_leather_chest", name: "Leather Tunic", type: "armor", rank: "Iron", equipSlot: "chest", icon: "🦺",
    desc: "Basic leather protection. +2 DEF.", buyPrice: 100, wholesalePrice: 50, stats: { def: 2 }
  },
  "Iron Chestplate": {
    id: "itm_iron_chest", name: "Iron Chestplate", type: "armor", rank: "Iron", equipSlot: "chest", icon: "👕",
    desc: "Sturdy iron armor. +5 DEF.", buyPrice: 200, wholesalePrice: 100, stats: { def: 5 }
  },
  "Silverweave Vestments": {
    id: "itm_silver_chest", name: "Silverweave Vestments", type: "armor", rank: "Silver", equipSlot: "chest", icon: "🥋",
    desc: "Woven with moonlight. +10 DEF, +5 SPD.", buyPrice: 2500, wholesalePrice: 1250, stats: { def: 10, spd: 5 }
  },

  // --- ARMOR: BACK ---
  "Traveler's Cloak": {
    id: "itm_cloak", name: "Traveler's Cloak", type: "armor", rank: "Iron", equipSlot: "back", icon: "🧥",
    desc: "Lightweight back covering.", buyPrice: 80, wholesalePrice: 40, stats: { def: 1, spd: 2 }
  },
  "Essence Weaver Cloak": {
    id: "itm_weaver_cloak", name: "Essence Weaver Cloak", type: "armor", rank: "Diamond", equipSlot: "back", icon: "🌌",
    desc: "Shifts and writhes like a starry night sky. +50 DEF, +20 SPD.", buyPrice: 50000, wholesalePrice: 25000, stats: { def: 50, spd: 20 }
  },

  // --- ARMOR: LEGS ---
  "Leather Pants": {
    id: "itm_leather_legs", name: "Leather Pants", type: "armor", rank: "Iron", equipSlot: "legs", icon: "👖",
    desc: "Durable leg protection. +1 DEF.", buyPrice: 70, wholesalePrice: 35, stats: { def: 1 }
  },

  // --- ARMOR: FEET ---
  "Leather Boots": {
    id: "itm_boots", name: "Leather Boots", type: "armor", rank: "Iron", equipSlot: "feet", icon: "👢",
    desc: "Comfortable footwear.", buyPrice: 60, wholesalePrice: 30, stats: { spd: 3 }
  },

  // --- COSMETICS (Visual only, no stats) ---
  "Golden Crown": {
    id: "itm_crown", name: "Golden Crown", type: "cosmetic", rank: "Gold", equipSlot: "head", icon: "👑",
    desc: "A shiny crown fit for a king. Purely cosmetic.", buyPrice: 500, wholesalePrice: 250
  },
  "Shutter Shades": {
    id: "itm_shades", name: "Shutter Shades", type: "cosmetic", rank: "Bronze", equipSlot: "head", icon: "🕶️",
    desc: "Block out the haters.", buyPrice: 150, wholesalePrice: 75
  },
  "Demon Wings": {
    id: "itm_demon_wings", name: "Demon Wings", type: "cosmetic", rank: "Diamond", equipSlot: "back", icon: "🦇",
    desc: "Edgy cosmetic back attachment.", buyPrice: 800, wholesalePrice: 400
  },

  // --- MATERIALS & UTILITY ---
  "Repair Kit": {
    id: "itm_repair", name: "Repair Kit", type: "utility", rank: "Iron", icon: "🧰",
    desc: "Restores durability.", buyPrice: 75, wholesalePrice: 35
  },
  "Wood": {
    id: "itm_wood", name: "Wood", type: "material", rank: "Iron", icon: "🪵",
    desc: "Building material used for construction.", buyPrice: 20, wholesalePrice: 10
  },
  "Stone": {
    id: "itm_stone", name: "Stone", type: "material", rank: "Iron", icon: "🪨",
    desc: "Building material used for construction.", buyPrice: 30, wholesalePrice: 15
  },

  // --- INTERIOR DESIGN / DECORATION ---
  "Oak Bed": {
    id: "itm_bed_oak", name: "Oak Bed", type: "decoration", rank: "Iron", icon: "🛏️",
    desc: "A comfortable wooden bed.", buyPrice: 300, wholesalePrice: 150
  },
  "Cozy Rug": {
    id: "itm_rug_cozy", name: "Cozy Rug", type: "decoration", rank: "Iron", icon: "🧶",
    desc: "A soft red rug.", buyPrice: 100, wholesalePrice: 50
  },
  "Wooden Chair": {
    id: "itm_chair_wood", name: "Wooden Chair", type: "decoration", rank: "Iron", icon: "🪑",
    desc: "A simple place to sit.", buyPrice: 75, wholesalePrice: 35
  },
  "Dining Table": {
    id: "itm_table_wood", name: "Dining Table", type: "decoration", rank: "Iron", icon: "🪵",
    desc: "A sturdy wooden table.", buyPrice: 150, wholesalePrice: 75
  },
  "Storage Chest": {
    id: "itm_chest", name: "Storage Chest", type: "decoration", rank: "Iron", icon: "🧰",
    desc: "A sturdy wooden chest for storing items.", buyPrice: 150, wholesalePrice: 75
  },
  "Wardrobe": {
    id: "itm_wardrobe", name: "Wardrobe", type: "decoration", rank: "Iron", icon: "🚪",
    desc: "A tall wooden wardrobe for the bedroom.", buyPrice: 200, wholesalePrice: 100
  },
  "Nightstand": {
    id: "itm_nightstand", name: "Nightstand", type: "decoration", rank: "Iron", icon: "🗄️",
    desc: "A small bedside table with a drawer.", buyPrice: 80, wholesalePrice: 40
  },
  // --- MATERIALS & UTILITY ---
  "Dire Wolf Pelt": {
    id: "itm_wolf_pelt", name: "Dire Wolf Pelt", type: "material", rank: "Iron", icon: "🐺",
    desc: "Thick fur from a Dire Wolf. Holds intrinsic wind magic. +3 SPD if equipped/crafted.", buyPrice: 45, wholesalePrice: 20,
    stats: { spd: 3 }
  },
  "Plague Toad Skin": {
    id: "itm_toad_skin", name: "Plague Toad Skin", type: "material", rank: "Bronze", icon: "🐸",
    desc: "A toxic, warty skin. Grants passive vitality and defense.", buyPrice: 60, wholesalePrice: 30,
    stats: { hp: 20, def: 2 }
  },
  "Sand Crawler Chitin": {
    id: "itm_sand_chitin", name: "Sand Crawler Chitin", type: "material", rank: "Bronze", icon: "🦂",
    desc: "A hardened desert shell. Exceptional for physical resistance.", buyPrice: 70, wholesalePrice: 35,
    stats: { def: 6 }
  },
  "Frost Elemental Core": {
    id: "itm_frost_core", name: "Frost Elemental Core", type: "material", rank: "Silver", icon: "❄️",
    desc: "A freezing heart that radiates pure mana.", buyPrice: 150, wholesalePrice: 75,
    stats: { mp: 50, atk: 10 }
  },
  "Ent Bark": {
    id: "itm_ent_bark", name: "Ent Bark", type: "material", rank: "Silver", icon: "🌳",
    desc: "Ancient enchanted bark. Heavy but incredibly durable.", buyPrice: 120, wholesalePrice: 60,
    stats: { hp: 100, def: 10, spd: -2 }
  },
  // --- BIOME-EXCLUSIVE MATERIALS ---
  "Glacial Ore": {
    id: "itm_glacial_ore", name: "Glacial Ore", type: "material", rank: "Silver", icon: "🧊",
    desc: "Extremely cold to the touch. Found only by mining rocks in the deep Winter biome.", buyPrice: 200, wholesalePrice: 100
  },
  "Sun-baked Clay": {
    id: "itm_sun_clay", name: "Sun-baked Clay", type: "material", rank: "Silver", icon: "🏺",
    desc: "Hardened by the harsh desert sun. Essential for advanced structures.", buyPrice: 200, wholesalePrice: 100
  },
  "Ironwood": {
    id: "itm_ironwood", name: "Ironwood", type: "material", rank: "Silver", icon: "🌲",
    desc: "Dense, dark wood harvested from the toxic swamps. Harder than steel.", buyPrice: 200, wholesalePrice: 100
  },
  "Aethelgard Crystal": {
    id: "itm_elven_crystal", name: "Aethelgard Crystal", type: "material", rank: "Gold", icon: "💠",
    desc: "A humming, magical gemstone found only in the Elven Kingdom.", buyPrice: 500, wholesalePrice: 250
  },

  // --- TREASURE HUNTING ---
  "Tattered Map": {
    id: "itm_treasure_map", name: "Tattered Map", type: "consumable", rank: "Gold", icon: "🗺️",
    desc: "An old map with a faint 'X'. Use it to reveal a hidden treasure location.", buyPrice: 1000, wholesalePrice: 500
  },

  // --- DUNGEON ARTIFACTS (Un-craftable Loot) ---
  "Tome of Awakening": {
    id: "itm_tome_awakening", name: "Tome of Awakening", type: "consumable", rank: "Diamond", icon: "📖",
    desc: "An ancient book pulsing with energy. Consuming it grants 1 Awakening Point.", buyPrice: 25000, wholesalePrice: 12500
  },
  "Lantern of the Ancients": {
    id: "itm_ancient_lantern", name: "Lantern of the Ancients", type: "weapon", rank: "Diamond", equipSlot: "offhand", icon: "🏮",
    desc: "Emits a warm, permanent glow. Found only in the deepest ruins. +15 DEF, +10 SPD.", buyPrice: 15000, wholesalePrice: 7500, 
    stats: { def: 15, spd: 10 }
  },
  "Aegis of the Forgotten": {
    id: "itm_aegis_forgotten", name: "Aegis of the Forgotten", type: "armor", rank: "Diamond", equipSlot: "chest", icon: "🛡️",
    desc: "A legendary chestplate salvaged from a Mega Mansion. +80 DEF, +500 Max HP.", buyPrice: 40000, wholesalePrice: 20000, 
    stats: { def: 80, hp: 500 }
  },
  
};