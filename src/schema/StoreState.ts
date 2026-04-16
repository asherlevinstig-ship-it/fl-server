import { Schema, type, MapSchema } from "@colyseus/schema";
import { StoreItemState } from "./StoreItemState";

export class StoreState extends Schema {
  @type("string") id: string = "";
  @type("string") type: string = "";
  
  // Coordinates required for server-side distance validation
  @type("number") x: number = 0;
  @type("number") y: number = 0;

  @type("string") ownerId: string = "";
  @type("string") ownerName: string = "";
  @type("number") ownershipUntil: number = 0;
  @type("number") vault: number = 0;
  
  @type({ map: StoreItemState }) inventory = new MapSchema<StoreItemState>();
}