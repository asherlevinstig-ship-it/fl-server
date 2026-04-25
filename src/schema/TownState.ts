import { Schema, type, MapSchema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { SceneryState } from "./SceneryState";
import { LandPlotState } from "./LandPlotState";
import { BuildingState } from "./BuildingState";
import { StoreState } from "./StoreState";
import { DecorationState } from "./DecorationState";
import { EnemyState } from "./EnemyState";
import { LootState } from "./LootState"; 
import { RealmEventState } from "./RealmEventState"; 
import { FamiliarState } from "./FamiliarState";

export class TownState extends Schema {
  // --- ADDED: Authoritative Zone Name ---
  @type("string") zoneName: string = "The Wilderness";

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: SceneryState }) scenery = new MapSchema<SceneryState>();
  @type({ map: LandPlotState }) landPlots = new MapSchema<LandPlotState>();
  @type({ map: BuildingState }) buildings = new MapSchema<BuildingState>();
  @type({ map: StoreState }) stores = new MapSchema<StoreState>();
  @type({ map: DecorationState }) decorations = new MapSchema<DecorationState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>(); 
  @type({ map: LootState }) lootItems = new MapSchema<LootState>(); 
  @type({ map: RealmEventState }) realmEvents = new MapSchema<RealmEventState>(); 
  @type({ map: FamiliarState }) familiars = new MapSchema<FamiliarState>();
}