export const WORLD_RADIUS = 2500; 
export const TOWN_RADIUS = 65;   

export const TOWN_COLLIDERS = [
  { minX: -62, maxX: -58, minY: -62, maxY: 62 }, 
  { minX: 58, maxX: 62, minY: -62, maxY: 62 },   
  { minX: -62, maxX: -8, minY: -62, maxY: -58 }, 
  { minX: 8, maxX: 62, minY: -62, maxY: -58 },   
  { minX: -62, maxX: -8, minY: 58, maxY: 62 },   
  { minX: 8, maxX: 62, minY: 58, maxY: 62 },     
  { minX: -4.0, maxX: 4.0, minY: 4.0, maxY: 12.0 }, 
  { minX: -12.6, maxX: -11.4, minY: -20.6, maxY: -4.0 },  
  { minX: -12.6, maxX: -11.4, minY: 4.0, maxY: 20.6 },   
  { minX: -62.6, maxX: -11.4, minY: -20.6, maxY: -19.4 }, 
  { minX: -42.6, maxX: -11.4, minY: 19.4, maxY: 20.6 },   
  { minX: -42.6, maxX: -41.4, minY: -0.6, maxY: 20.6 },   
  { minX: -62.6, maxX: -41.4, minY: -0.6, maxY: 0.6 },   
  { minX: -62.6, maxX: -61.4, minY: -20.6, maxY: 0.6 },   
  { minX: -54.5, maxX: -45.5, minY: -14.5, maxY: -9.5 },  
  { minX: -30.0, maxX: -24.0, minY: -13.5, maxY: -10.5 }, 
  { minX: -29.5, maxX: -24.5, minY: -3.5,  maxY: -0.5 },  
  { minX: -28.5, maxX: -25.5, minY: 6.5,   maxY: 9.5 },   
  { minX: -39.0, maxX: -37.0, minY: -11.0, maxY: -9.0 },  
  { minX: 13.0, maxX: 15.0, minY: -36.0, maxY: -32.0 }, 
  { minX: 13.0, maxX: 15.0, minY: -24.0, maxY: -20.0 }, 
  { minX: 13.0, maxX: 15.0, minY: -12.0, maxY: -8.0 },  
  { minX: 13.0, maxX: 15.0, minY: 0.0,   maxY: 4.0 },   
  { minX: 13.0, maxX: 15.0, minY: 12.0,  maxY: 16.0 },  
];

export const VILLAGE_COLLIDERS: { minX: number, maxX: number, minY: number, maxY: number }[] = [];

function addVillageAreaBox(cx: number, cz: number) {
    VILLAGE_COLLIDERS.push({ minX: cx - 15, maxX: cx - 14.5, minY: cz - 3, maxY: cz + 7 }); 
    VILLAGE_COLLIDERS.push({ minX: cx - 15, maxX: cx - 5, minY: cz - 3, maxY: cz - 2.5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx - 15, maxX: cx - 5, minY: cz + 6.5, maxY: cz + 7 }); 
    VILLAGE_COLLIDERS.push({ minX: cx - 5.5, maxX: cx - 5, minY: cz - 3, maxY: cz + 0.5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx - 5.5, maxX: cx - 5, minY: cz + 3.5, maxY: cz + 7 }); 
    
    VILLAGE_COLLIDERS.push({ minX: cx + 14.5, maxX: cx + 15, minY: cz - 3, maxY: cz + 7 }); 
    VILLAGE_COLLIDERS.push({ minX: cx + 5, maxX: cx + 15, minY: cz - 3, maxY: cz - 2.5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx + 5, maxX: cx + 15, minY: cz + 6.5, maxY: cz + 7 }); 
    VILLAGE_COLLIDERS.push({ minX: cx + 5, maxX: cx + 5.5, minY: cz - 3, maxY: cz + 0.5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx + 5, maxX: cx + 5.5, minY: cz + 3.5, maxY: cz + 7 }); 
}

function addVillageColliders(cx: number, cz: number) {
    VILLAGE_COLLIDERS.push({ minX: cx - 5, maxX: cx + 5, minY: cz - 15, maxY: cz - 14.5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx - 5, maxX: cx - 4.5, minY: cz - 15, maxY: cz - 5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx + 4.5, maxX: cx + 5, minY: cz - 15, maxY: cz - 5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx - 5, maxX: cx - 1.5, minY: cz - 5.5, maxY: cz - 5 }); 
    VILLAGE_COLLIDERS.push({ minX: cx + 1.5, maxX: cx + 5, minY: cz - 5.5, maxY: cz - 5 }); 
    addVillageAreaBox(cx, cz);
}

addVillageColliders(250, 250);
addVillageColliders(-300, 400);
addVillageColliders(500, -150);

// --- MEGA MANSION COLLIDERS ---
export const MANSION_WALLS: { minX: number, maxX: number, minY: number, maxY: number }[] = [];
export const MANSION_POS = { x: -400, z: -400 }; 
const CELL_SIZE = 4.0;

const MANSION_GRID = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,1,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,1,0,1,1,1,1,0,1,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,0,1,0,1,1,1,0,1,0,1,1,1],
    [1,0,0,0,1,0,1,0,1,0,1,0,0,0,1],
    [1,0,1,0,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,1,1,1,1,1,1],
];

export const MANSION_BOUNDS = {
    minX: MANSION_POS.x - (MANSION_GRID[0].length * CELL_SIZE) / 2,
    maxX: MANSION_POS.x + (MANSION_GRID[0].length * CELL_SIZE) / 2,
    minY: MANSION_POS.z - (MANSION_GRID.length * CELL_SIZE) / 2,
    maxY: MANSION_POS.z + (MANSION_GRID.length * CELL_SIZE) / 2,
};

for (let r = 0; r < MANSION_GRID.length; r++) {
    for (let c = 0; c < MANSION_GRID[r].length; c++) {
        if (MANSION_GRID[r][c] === 1) {
            const wx = MANSION_BOUNDS.minX + (c * CELL_SIZE) + (CELL_SIZE / 2);
            const wz = MANSION_BOUNDS.minY + (r * CELL_SIZE) + (CELL_SIZE / 2);
            MANSION_WALLS.push({
                minX: wx - CELL_SIZE / 2, maxX: wx + CELL_SIZE / 2,
                minY: wz - CELL_SIZE / 2, maxY: wz + CELL_SIZE / 2
            });
        }
    }
}

// --- MATH HELPERS ---

// NEW: Exported distSq so other files can use it!
export function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number { 
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

export function distToSegmentSquared(px: number, py: number, vx: number, vy: number, wx: number, wy: number): number {
    const l2 = (vx - wx) ** 2 + (vy - wy) ** 2;
    if (l2 === 0) return distance(px, py, vx, vy) ** 2;
    let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
    t = Math.max(0, Math.min(1, t));
    return distance(px, py, vx + t * (wx - vx), vy + t * (wy - vy)) ** 2;
}

// --- COLLISION DETECTION ---
export function checkTownCollision(x: number, y: number, r: number = 0.85): boolean {
  for (const box of TOWN_COLLIDERS) {
    if (x + r > box.minX && x - r < box.maxX && y + r > box.minY && y - r < box.maxY) return true;
  }
  for (const box of VILLAGE_COLLIDERS) {
      if (x + r > box.minX && x - r < box.maxX && y + r > box.minY && y - r < box.maxY) return true;
  }
  for (const box of MANSION_WALLS) {
      if (x + r > box.minX && x - r < box.maxX && y + r > box.minY && y - r < box.maxY) return true;
  }
  return false;
}

export function checkDynamicCollision(state: any, x: number, y: number, r: number = 0.85): boolean {
  if (!state) return false;

  if (distance(x, y, 35, -35) < r + 12.0) return true;
  if (distance(x, y, 1200, 0) < r + 16.0) return true;

  if (state.buildings) {
      for (const bldg of state.buildings.values()) {
          if (bldg.type === "farm") continue; 
          
          if (Math.abs(bldg.x - x) > 20 || Math.abs(bldg.z - y) > 20) continue;

          let hw = 0; let hd = 0;
          if (bldg.type === "house") { hw = 4; hd = 4; }
          else if (bldg.type === "shop") { hw = 5; hd = 4; }

          const t = 1.0; 
          const doorHalfWidth = 1.5; 

          const walls = [
              { minX: bldg.x - hw, maxX: bldg.x - hw + t, minY: bldg.z - hd, maxY: bldg.z + hd },
              { minX: bldg.x + hw - t, maxX: bldg.x + hw, minY: bldg.z - hd, maxY: bldg.z + hd },
              { minX: bldg.x - hw, maxX: bldg.x + hw, minY: bldg.z - hd, maxY: bldg.z - hd + t },
              { minX: bldg.x - hw, maxX: bldg.x - doorHalfWidth, minY: bldg.z + hd - t, maxY: bldg.z + hd },
              { minX: bldg.x + doorHalfWidth, maxX: bldg.x + hw, minY: bldg.z + hd - t, maxY: bldg.z + hd }
          ];

          if (bldg.type === "shop") {
              walls.push({
                  minX: bldg.x - 3, maxX: bldg.x + 3,
                  minY: bldg.z + 0.25, maxY: bldg.z + 1.75
              });
          }

          for (const wall of walls) {
              if (x + r > wall.minX && x - r < wall.maxX && y + r > wall.minY && y - r < wall.maxY) return true; 
          }
      }
  }

  if (state.scenery) {
      for (const scenery of state.scenery.values()) {
          if (Math.abs(scenery.x - x) > 10 || Math.abs(scenery.y - y) > 10) continue;
          const obstacleRadius = scenery.kind.includes("rock") ? scenery.scale * 1.0 : 0.8;
          if (distance(x, y, scenery.x, scenery.y) < r + obstacleRadius) {
              return true;
          }
      }
  }

  if (state.decorations) {
      for (const deco of state.decorations.values()) {
          if (Math.abs(deco.x - x) > 10 || Math.abs(deco.z - y) > 10) continue;

          const isGiant = deco.type && deco.type.toLowerCase().includes("giant");
          const solidRadius = isGiant ? 4.5 : 1.0; 
          
          if (distance(x, y, deco.x, deco.z) < r + solidRadius) {
              return true;
          }
      }
  }

  return false;
}

// --- SPATIAL GRID SYSTEM ---
export class SpatialGrid<T> {
    cellSize: number;
    cells: Map<string, Set<T>>;

    constructor(cellSize: number) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    private getKey(x: number, z: number): string {
        return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
    }

    add(item: T, x: number, z: number) {
        const key = this.getKey(x, z);
        if (!this.cells.has(key)) {
            this.cells.set(key, new Set());
        }
        this.cells.get(key)!.add(item);
    }

    remove(item: T, x: number, z: number) {
        const key = this.getKey(x, z);
        const cell = this.cells.get(key);
        if (cell) {
            cell.delete(item);
            if (cell.size === 0) {
                this.cells.delete(key);
            }
        }
    }

    update(item: T, oldX: number, oldZ: number, newX: number, newZ: number) {
        const oldKey = this.getKey(oldX, oldZ);
        const newKey = this.getKey(newX, newZ);
        if (oldKey !== newKey) {
            this.remove(item, oldX, oldZ);
            this.add(item, newX, newZ);
        }
    }

    getNearby(x: number, z: number, radius: number): Set<T> {
        const result = new Set<T>();
        const minX = Math.floor((x - radius) / this.cellSize);
        const maxX = Math.floor((x + radius) / this.cellSize);
        const minZ = Math.floor((z - radius) / this.cellSize);
        const maxZ = Math.floor((z + radius) / this.cellSize);

        for (let cx = minX; cx <= maxX; cx++) {
            for (let cz = minZ; cz <= maxZ; cz++) {
                const key = `${cx},${cz}`;
                const cell = this.cells.get(key);
                if (cell) {
                    for (const item of cell) {
                        result.add(item);
                    }
                }
            }
        }
        return result;
    }
}

// --- MAZE COLLISION SYSTEM ---
export let MAZE_COLLIDERS: {minX: number, maxX: number, minY: number, maxY: number}[] = [];

// A seeded random number generator so Client and Server generate the exact same maze
function seededRandom(seed: number) {
    return function() {
        seed = Math.imul(48271, seed) | 0 % 2147483647;
        return (seed & 2147483647) / 2147483648;
    }
}

export function generateMaze(seed: number) {
    MAZE_COLLIDERS = [];
    const random = seededRandom(seed);
    const renderData = [];

    for (let i = 0; i < 1500; i++) {
        const x = (random() - 0.5) * 800;
        const z = (random() - 0.5) * 800;

        // Keep the spawn and exit clear
        const distToSpawn = Math.sqrt(x * x + z * z);
        const distToExit = Math.sqrt((x - 350) ** 2 + (z - 350) ** 2);
        if (distToSpawn < 20 || distToExit < 20) continue;

        const scaleX = 1 + random() * 2;
        const scaleZ = 1 + random() * 2;

        const halfW = (10 * scaleX) / 2;
        const halfD = (10 * scaleZ) / 2;

        MAZE_COLLIDERS.push({
            minX: x - halfW,
            maxX: x + halfW,
            minY: z - halfD,
            maxY: z + halfD
        });

        renderData.push({ x, z, scaleX, scaleZ });
    }
    return renderData; // Return data so the client can render the meshes
}

export function checkMazeCollision(x: number, y: number, r: number = 0.85): boolean {
    for (const box of MAZE_COLLIDERS) {
        if (x + r > box.minX && x - r < box.maxX && y + r > box.minY && y - r < box.maxY) {
            return true;
        }
    }
    return false;
}

// ==========================================
// UNDERWORLD COLLISION (Pillars)
// ==========================================
export const UNDERWORLD_COLLIDERS: { minX: number, maxX: number, minY: number, maxY: number }[] = [];

export function generateUnderworldColliders() {
    UNDERWORLD_COLLIDERS.length = 0;
    
    const rings = [
        { radius: 80, count: 6 },
        { radius: 150, count: 12 },
        { radius: 220, count: 18 }
    ];

    rings.forEach(ring => {
        for (let i = 0; i < ring.count; i++) {
            const angle = (i / ring.count) * Math.PI * 2;
            const px = Math.cos(angle) * ring.radius;
            const pz = Math.sin(angle) * ring.radius;

            UNDERWORLD_COLLIDERS.push({
                minX: px - 5,
                maxX: px + 5,
                minY: pz - 5,
                maxY: pz + 5
            });
        }
    });
}

generateUnderworldColliders();

export function checkUnderworldCollision(x: number, y: number, r: number = 0.85): boolean {
    for (const box of UNDERWORLD_COLLIDERS) {
        if (x + r > box.minX && x - r < box.maxX && y + r > box.minY && y - r < box.maxY) {
            return true;
        }
    }
    return false;
}