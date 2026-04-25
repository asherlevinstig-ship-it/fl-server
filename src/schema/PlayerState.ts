import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";
import { InventoryItemState } from "./InventoryItemState";
import { PlayerSkillTree } from "./SkillState";

export class QuestProgressState extends Schema {
    @type("string") questId: string = "";
    @type("number") currentAmount: number = 0;
    @type("boolean") isCompleted: boolean = false;
}

export class PlayerState extends Schema {
    // --- Core Identity ---
    @type("string") sessionId: string = "";
    @type("string") name: string = "";
    @type("string") classId: string = "";
    @type("string") pathwayId: string = "";

    // --- Progressive Unlocks (Onboarding) ---
    @type("boolean") hasUnlockedAura: boolean = false;
    @type("boolean") hasUnlockedBuilding: boolean = false;
    @type("boolean") hasUnlockedSkillTree: boolean = false;

    // --- HWFWM Progression ---
    @type("string") rank: string = "Iron";
    @type("number") level: number = 1;
    @type("number") experience: number = 0;
    @type("number") experienceToNextLevel: number = 500;
    
    @type("number") manaLevel: number = 1;
    @type("number") auraStrength: number = 1.0;
    @type("number") auraControl: number = 1.0;

    // --- Active Aura Styles ---
    @type("string") auraStyle: string = "tyrant";
    @type("boolean") isAuraActive: boolean = false;

    // --- Position & Vitals ---
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    
    @type("uint32") lastProcessedInput: number = 0; 
    
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") mp: number = 100;
    @type("number") maxMp: number = 100;
    
    // Note: Stamina is now slaved to Hunger in the server engine, 
    // but the properties remain synced for the client UI representation.
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
    @type("number") teamId: number = 0;
    @type("boolean") isTeamLeader: boolean = false;

    // --- Animation & Action States ---
    @type("boolean") isSleeping: boolean = false;
    @type("number") sleepRot: number = 0;
    @type("boolean") isMeditating: boolean = false;
    @type("number") meditationCount: number = 0;
    @type("boolean") isSprinting: boolean = false;
    @type("boolean") isSpiritAnimal: boolean = false;

    // --- Mount System ---
    @type("string") mountedFamiliarId: string = "";
    @type("boolean") isFlying: boolean = false; 
    
    // --- Fishing Mechanics ---
    @type("string") fishingState: string = "none"; 
    @type("number") bobberX: number = 0;
    @type("number") bobberZ: number = 0;

    @type("number") rootedUntil: number = 0;
    
    // --- Monarch Class Specifics ---
    @type("number") shadowSouls: number = 0;

    // --- Collections & Nested States ---
    @type({ map: InventoryItemState }) inventory = new MapSchema<InventoryItemState>();
    @type(PlayerSkillTree) skillTree = new PlayerSkillTree();
    
    // --- NEW: Quests ---
    @type({ map: QuestProgressState }) activeQuests = new MapSchema<QuestProgressState>();
    @type(["string"]) completedQuests = new ArraySchema<string>();
}