import { Schema, type, MapSchema } from "@colyseus/schema";

export class AfflictionState extends Schema {
    @type("string") type: string = "";
    @type("number") duration: number = 0;
    @type("number") damagePerTick: number = 0;
    @type("number") tickTimer: number = 0;
}

export class EnemyState extends Schema {
    @type("string") id: string = "";
    @type("string") type: string = ""; // Added to sync the visual model type with the frontend
    @type("number") x: number = 0;
    @type("number") y: number = 0;
    @type("number") targetX: number = 0;
    @type("number") targetY: number = 0;
    @type("string") action: string = "idle";
    @type("string") name: string = "";
    @type("number") maxHp: number = 100;
    @type("number") hp: number = 100;
    @type("number") damage: number = 10;
    @type("number") speed: number = 4.0;
    @type("number") attackCooldown: number = 0;
    @type("number") stunnedTimer: number = 0;
    @type("number") rootedTimer: number = 0;

    // NEW: Smarter AI Combat Stats
    @type("boolean") isAttacking: boolean = false;
    @type("number") attackWindupTimer: number = 0;
    @type("number") maxAttackWindup: number = 1.0;
    @type("number") maxAttackCooldown: number = 2.0;
    @type("string") attackType: string = "melee";
    @type("number") attackRadius: number = 2.5;

    @type({ map: AfflictionState }) afflictions = new MapSchema<AfflictionState>();
}