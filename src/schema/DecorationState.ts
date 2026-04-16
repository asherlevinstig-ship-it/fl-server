import { Schema, type, MapSchema } from "@colyseus/schema";
import { InventoryItemState } from "./InventoryItemState";

export class DecorationState extends Schema {
  @type("string") id: string = "";
  @type("string") ownerId: string = "";
  @type("string") type: string = ""; 
  @type("number") x: number = 0;
  @type("number") y: number = 0; 
  @type("number") z: number = 0; 
  @type("number") rotation: number = 0;
  
  // Add this line so chests can hold items!
  @type({ map: InventoryItemState }) inventory = new MapSchema<InventoryItemState>();
}