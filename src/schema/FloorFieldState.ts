import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { EnemyState } from "./EnemyState";
import { LootState } from "./LootState";
import { FamiliarState } from "./FamiliarState";

export class FloorFieldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
  @type({ map: FamiliarState }) familiars = new MapSchema<FamiliarState>();
  // NEW: The interactive loot and environment map
  @type({ map: LootState }) lootItems = new MapSchema<LootState>();
  
  @type("string") activeEnemyId: string = "";
}