import { Schema, type } from "@colyseus/schema";

export class InventoryItemState extends Schema {
  @type("string") name: string = "";
  @type("number") quantity: number = 0;
  @type("string") desc: string = "";
}