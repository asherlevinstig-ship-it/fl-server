import { Schema, type } from "@colyseus/schema";

export class CardState extends Schema {
  @type("string") id: string = "";
}