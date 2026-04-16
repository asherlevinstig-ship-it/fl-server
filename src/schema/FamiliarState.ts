import { Schema, type, MapSchema } from "@colyseus/schema";
import { AfflictionState } from "./EnemyState"; // Assuming you have this exported from your EnemyState file

export class FamiliarState extends Schema {
    // --- Core Identity ---
    @type("string") id: string = "";
    @type("string") ownerId: string = "";
    @type("string") type: string = ""; // e.g., "apocalyptic_swarm", "orbital_arbiter", "primal_beast"
    @type("string") name: string = "";

    // --- Progression ---
    @type("number") rank: number = 1; // 1-5 (Iron to Diamond/Tier 1-5)
    @type("number") level: number = 1;

    // --- Spatial Data ---
    @type("number") x: number = 0;
    @type("number") y: number = 0; // Represents the Z-axis in the 3D scene
    @type("number") targetX: number = 0;
    @type("number") targetY: number = 0;

    // --- State Machine ---
    // Actions: "orbiting" (follows player), "chasing" (moving to target), 
    // "attacking" (melee engagement), "deployed" (stationary AoE/Wall)
    @type("string") action: string = "orbiting"; 
    
    // --- Vitals (Used by physical familiars like Beast, Monarch Shadows) ---
    @type("number") hp: number = 0;
    @type("number") maxHp: number = 0;

    // --- Combat Stats ---
    @type("number") speed: number = 8.0;
    @type("number") attackRadius: number = 2.0;

    // --- Universal Timers & Triggers ---
    // Used for interval actions (e.g., Swarm biting every 1s, Arbiter shooting every 5s)
    @type("number") tickTimer: number = 0; 
    
    // Used for duration abilities (e.g., Devour lasts 8s, Seraph Wall lasts 5s)
    @type("number") actionTimer: number = 0; 
    
    // Used to track target lock-ons (e.g., Beast Kill Command, Arbiter Annihilation beam)
    @type("string") currentTargetId: string = ""; 

    // Used to flag if the familiar is currently separated from the player's orbit
    @type("boolean") isDetached: boolean = false; 

    // --- Status Effects (For physical familiars that can be attacked) ---
    @type("number") stunnedTimer: number = 0;
    @type("number") rootedTimer: number = 0;
    @type({ map: AfflictionState }) afflictions = new MapSchema<AfflictionState>();
}