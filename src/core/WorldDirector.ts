type FloorProgress = {
  floor: number;
  unlocked: boolean;
  relicsRequired: string[];
  relicsCollected: string[];
  bossUnlocked: boolean;
  bossDefeated: boolean;
};

type ZoneInfo = {
  roomId: string;
  roomType: "town" | "field" | "dungeon" | "boss";
  floor: number;
  currentPlayers: number;
  maxPlayers: number;
};

class WorldDirector {
  getAvailableTownRoom(floor: number) {}
  getAvailableFieldRoom(floor: number) {}
  recordRelicTurnIn(floor: number, relicId: string) {}
  unlockBoss(floor: number) {}
  unlockNextFloor(floor: number) {}
}