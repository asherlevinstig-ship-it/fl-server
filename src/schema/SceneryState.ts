import { Schema, type } from "@colyseus/schema";

export class SceneryState extends Schema {
  @type("string") id: string = "";
  @type("string") kind: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") scale: number = 1;
  @type("number") rotation: number = 0;
  @type("number") hp: number = 3;
  @type("number") maxHp: number = 3;
}