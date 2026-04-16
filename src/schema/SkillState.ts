import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

// Layer 2: The specific Awakening Stone upgrades inside an ability
export class SkillUpgrade extends Schema {
    @type("string") id: string = "";
    @type("boolean") unlocked: boolean = false;
    @type("number") currentRank: number = 0;
    @type("number") maxRank: number = 0;
}

// Layer 1: The Active Ability itself (Unlocked via Essences)
export class ActiveAbility extends Schema {
    @type("string") id: string = "";
    @type("number") baseLevel: number = 1;
    
    // --- HWFWM Progression Stats ---
    @type("string") rank: string = "Iron";     // Iron, Bronze, Silver, Gold, Diamond
    @type("number") level: number = 0;         // Level within the current rank (0 to 9)
    
    // The visual UI bar (Permanent progress locked in via meditation)
    @type("number") proficiency: number = 0.0; // 0.0 to 100.0
    
    // The hidden backlog of combat experience waiting to be meditated on
    @type("number") unconsolidatedProficiency: number = 0.0;
    // -------------------------------

    @type({ map: SkillUpgrade }) upgrades = new MapSchema<SkillUpgrade>();
}

// The root holder for the player's entire progression
export class PlayerSkillTree extends Schema {
    @type("number") unspentEssencePoints: number = 0;    // Used for the main trunk
    @type("number") unspentAwakeningPoints: number = 0;  // Used for the ability sub-trees
    
    // Flat stat boosts (e.g., +10 Health Points)
    @type({ map: "number" }) unlockedPassives = new MapSchema<number>(); 
    
    // The player's current loadout and sub-trees
    @type({ map: ActiveAbility }) activeAbilities = new MapSchema<ActiveAbility>(); 
}