// RecipeDatabase.ts

export interface RecipeRequirement {
  n: string; // Item Name
  q: number; // Quantity Required
}

export interface CraftingRecipe {
  id: string;
  name: string;
  icon: string;
  cost: number; // Coin cost to craft
  reqs: RecipeRequirement[];
}

export interface StoreRecipe {
  yield: number; // How many items are produced per craft
  reqs: RecipeRequirement[];
}

// --- BLACKSMITH / NPC CRAFTING RECIPES ---
export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // --- Weapons ---
  { id: "recipe_frostbite_dagger", name: "Frostbite Dagger", icon: "🗡️", cost: 500, reqs: [{n: "Glacial Ore", q: 2}, {n: "Stone", q: 10}] },
  { id: "recipe_aethelgard_bow", name: "Aethelgard Longbow", icon: "🏹", cost: 1500, reqs: [{n: "Ironwood", q: 5}, {n: "Aethelgard Crystal", q: 1}] },
  { id: "recipe_golden_sunblade", name: "Golden Sunblade", icon: "⚔️", cost: 2500, reqs: [{n: "Sun-baked Clay", q: 10}, {n: "Stone", q: 20}] },
  { id: "recipe_iron_sword", name: "Iron Sword", icon: "🗡️", cost: 50, reqs: [{n: "Stone", q: 5}, {n: "Wood", q: 2}] },
  { id: "recipe_bronze_axe", name: "Bronze-Forged Battleaxe", icon: "🪓", cost: 150, reqs: [{n: "Stone", q: 15}, {n: "Wood", q: 5}, {n: "Sand Crawler Chitin", q: 2}] },
  
  // --- Armor & Shields ---
  { id: "recipe_wooden_shield", name: "Wooden Shield", icon: "🛡️", cost: 25, reqs: [{n: "Wood", q: 8}] },
  { id: "recipe_iron_chest", name: "Iron Chestplate", icon: "👕", cost: 200, reqs: [{n: "Stone", q: 25}, {n: "Dire Wolf Pelt", q: 2}] },
  { id: "recipe_silverweave_vest", name: "Silverweave Vestments", icon: "🥋", cost: 1200, reqs: [{n: "Plague Toad Skin", q: 5}, {n: "Glacial Ore", q: 2}, {n: "Frost Elemental Core", q: 1}] },

  // --- Utility ---
  { id: "recipe_repair_kit", name: "Repair Kit", icon: "🛠️", cost: 15, reqs: [{n: "Wood", q: 2}, {n: "Stone", q: 2}] }
];

// --- PLAYER-OWNED STORE PRODUCTION RECIPES ---
export const STORE_RECIPES: Record<string, StoreRecipe> = {
  // --- Food & Potions ---
  "Roasted Boar Meat": { yield: 5, reqs: [{ n: "Raw Meat", q: 5 }, { n: "Wood", q: 2 }] },
  "Crispy Apple": { yield: 3, reqs: [{ n: "Apple", q: 3 }] },
  "Rye Bread": { yield: 5, reqs: [{ n: "Wheat", q: 5 }, { n: "Water Flask", q: 1 }] },
  "Minor Health Potion": { yield: 3, reqs: [{ n: "Red Berry", q: 3 }, { n: "Water Flask", q: 1 }] },
  "Mana Vial": { yield: 3, reqs: [{ n: "Blue Mushroom", q: 3 }, { n: "Water Flask", q: 1 }] },
  "Stamina Elixir": { yield: 3, reqs: [{ n: "Apple", q: 2 }, { n: "Water Flask", q: 1 }] },

  // --- Basic Gear & Tools ---
  "Iron Sword": { yield: 1, reqs: [{ n: "Stone", q: 10 }, { n: "Wood", q: 3 }] },
  "Iron Pickaxe": { yield: 1, reqs: [{ n: "Stone", q: 5 }, { n: "Wood", q: 5 }] },
  "Iron Axe": { yield: 1, reqs: [{ n: "Stone", q: 5 }, { n: "Wood", q: 5 }] },
  "Wooden Shield": { yield: 1, reqs: [{ n: "Wood", q: 8 }] },
  "Repair Kit": { yield: 3, reqs: [{ n: "Stone", q: 2 }, { n: "Wood", q: 2 }] },

  // --- Tailoring & Leatherworking ---
  "Leather Tunic": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 4 }] },
  "Leather Pants": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 3 }] },
  "Traveler's Cloak": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 5 }] },
  "Leather Boots": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 3 }] },
  "Silk Bandana": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 1 }] },

  // --- Cosmetics ---
  "Golden Crown": { yield: 1, reqs: [{ n: "Sun-baked Clay", q: 5 }, { n: "Aethelgard Crystal", q: 1 }] },
  "Shutter Shades": { yield: 1, reqs: [{ n: "Wood", q: 2 }, { n: "Sand Crawler Chitin", q: 1 }] },
  "Demon Wings": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 10 }, { n: "Plague Toad Skin", q: 5 }] },

  // --- Furniture & Interior Design ---
  "Oak Bed": { yield: 1, reqs: [{ n: "Wood", q: 10 }, { n: "Dire Wolf Pelt", q: 2 }] },
  "Cozy Rug": { yield: 1, reqs: [{ n: "Dire Wolf Pelt", q: 3 }] },
  "Wooden Chair": { yield: 2, reqs: [{ n: "Wood", q: 5 }] },
  "Dining Table": { yield: 1, reqs: [{ n: "Wood", q: 15 }] },
  "Storage Chest": { yield: 1, reqs: [{ n: "Wood", q: 10 }, { n: "Stone", q: 2 }] },
  "Wardrobe": { yield: 1, reqs: [{ n: "Wood", q: 20 }] },
  "Nightstand": { yield: 1, reqs: [{ n: "Wood", q: 8 }] }
};