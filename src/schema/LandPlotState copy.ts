import { Schema, type } from "@colyseus/schema";

export class LandPlotState extends Schema {
  @type("string") id: string = "";
  @type("string") ownerId: string = "";
  @type("string") ownerName: string = "";
  @type("number") gridX: number = 0;
  @type("number") gridY: number = 0;
  @type("number") price: number = 100;
}