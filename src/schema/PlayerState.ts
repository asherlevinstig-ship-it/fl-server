import { Schema, MapSchema, type } from "@colyseus/schema";
import { InventoryItemState } from "./InventoryItemState";
import { PlayerSkillTree } from "./SkillState";

export class PlayerState extends Schema {
    // --- Core Identity ---
    @type("string") sessionId: string = "";
    @type("string") name: string = "";
    @type("string") classId: string = "";
    @type("string") pathwayId: string = "";

    // --- HWFWM Progression ---
    @type("string") rank: string = "Iron";
    @type("number") level: number = 1;
    @type("number") experience: number = 0;
    @type("number") experienceToNextLevel: number = 500;
    
    @type("number") manaLevel: number = 1;
    @type("number") auraStrength: number = 1.0;
    @type("number") auraControl: number = 1.0;

    // --- Active Aura Styles ---
    @type("string") auraStyle: string = "tyrant"; // e.g., "tyrant", "sanctuary", "void", "storm"
    @type("boolean") isAuraActive: boolean = false;

    // --- Position & Vitals ---
    @type("number") x: number = 0;
    @type("number") y: number = 0; // Represents the Z-axis in the 3D scene
    
    // NEW: Used to acknowledge client movement packets for smooth reconciliation
    @type("uint32") lastProcessedInput: number = 0; 
    
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") mp: number = 100;
    @type("number") maxMp: number = 100;
    @type("number") stamina: number = 100;
    @type("number") maxStamina: number = 100;
    @type("number") hunger: number = 100;
    @type("number") maxHunger: number = 100;

    // --- Economy & Combat Stats ---
    @type("number") coins: number = 0;
    @type("number") attackSpeed: number = 1.0;
    @type("number") movementSpeed: number = 12.0;

    // --- Equipment ---
    @type("string") equippedItem: string = "";
    @type("string") equipHead: string = "";
    @type("string") equipChest: string = "";
    @type("string") equipBack: string = "";
    @type("string") equipLegs: string = "";
    @type("string") equipFeet: string = "";
    @type("string") equipOffHand: string = "";

    // --- Team System ---
    @type("number") teamId: number = 0; // 0 means no team
    @type("boolean") isTeamLeader: boolean = false;

    // --- Animation & Action States ---
    @type("boolean") isSleeping: boolean = false;
    @type("number") sleepRot: number = 0;
    @type("boolean") isMeditating: boolean = false;
    @type("number") meditationCount: number = 0; // Tracks questions answered for Aura upgrades
    @type("boolean") isSprinting: boolean = false;
    @type("boolean") isSpiritAnimal: boolean = false;
    

    // --- Mount System ---
    @type("string") mountedFamiliarId: string = ""; // Empty string means not mounted
    @type("boolean") isFlying: boolean = false; // For Z-axis/Y-axis lifting
    // --- Fishing Mechanics ---
    @type("string") fishingState: string = "none"; // "none", "casting", "waiting", "reeling"
    @type("number") bobberX: number = 0;
    @type("number") bobberZ: number = 0;

    // --- NEW: Status Effects ---
    @type("number") rootedUntil: number = 0; // Locks movement if they hit the wrong crystal

    // --- Collections & Nested States ---
    @type({ map: InventoryItemState }) inventory = new MapSchema<InventoryItemState>();
    @type(PlayerSkillTree) skillTree = new PlayerSkillTree();
}