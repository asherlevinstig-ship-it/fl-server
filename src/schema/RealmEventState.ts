import { Schema, type } from "@colyseus/schema";

export class RealmEventState extends Schema {
  @type("string") id: string = "";
  @type("string") type: string = "abyssal_portal";
  @type("string") state: string = "waiting"; // "waiting", "active", "completed", "failed"
  @type("string") eventName: string = "Abyssal Portal";
  
  @type("number") x: number = 0;
  @type("number") y: number = 0; // Represents Z-axis in 3D space
  @type("number") radius: number = 15.0;
  
  @type("number") timer: number = 0;
  @type("number") maxTimer: number = 120;
  
  @type("number") progress: number = 0; // Current Wave
  @type("number") targetProgress: number = 5; // Max Waves
}