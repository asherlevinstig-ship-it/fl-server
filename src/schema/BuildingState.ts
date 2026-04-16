import { Schema, type } from "@colyseus/schema";

export class BuildingState extends Schema {
  @type("string") id: string = "";
  @type("string") ownerId: string = "";
  @type("number") x: number = 0;
  @type("number") z: number = 0;
  
  @type("string") type: string = "house"; 
  @type("number") progress: number = 0;
  @type("number") targetProgress: number = 10;
  @type("boolean") isConstructed: boolean = false;
}