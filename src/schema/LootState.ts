import { Schema, type } from "@colyseus/schema";

export class LootState extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "chest"; // Can be 'chest' or 'tree'
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") scale: number = 1.0;
  @type("number") rotation: number = 0;
  @type("boolean") isOpen: boolean = false;
}