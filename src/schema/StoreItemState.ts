import { Schema, type } from "@colyseus/schema";

export class StoreItemState extends Schema {
  @type("string") name: string = "";
  @type("number") price: number = 0;
  @type("number") wholesalePrice: number = 0;
  @type("string") desc: string = "";
  @type("number") stock: number = 0;
}