import { Client } from "colyseus";
import { TownState } from "../schema/TownState";
import { SceneryState } from "../schema/SceneryState";
import { LandPlotState } from "../schema/LandPlotState";
import { BuildingState } from "../schema/BuildingState";
import { StoreState } from "../schema/StoreState";
import { StoreItemState } from "../schema/StoreItemState";
import { DecorationState } from "../schema/DecorationState";
import { EnemyState } from "../schema/EnemyState";
import { LootState } from "../schema/LootState"; 
import { RealmEventState } from "../schema/RealmEventState";
import { InventoryItemState } from "../schema/InventoryItemState";
import { ITEM_DB } from "../ItemDatabase";
import { db } from "../db/firebase";

import { BaseRoom } from "./BaseRoom";
import { handleCrafting } from "../CraftingController";

// --- PERFORMANCE: Fast Squared Distance Helper ---
import { WORLD_RADIUS, TOWN_RADIUS } from "../game/CollisionSystem";
function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

type PlaceBuildingMessage = { x: number; z: number; type: string; };
type PlaceDecorationMessage = { type: string, x: number, z: number, rotation: number };

export const STORE_RECIPES: Record<string, { ingredients: { name: string, quantity: number }[], yield: number }> = {
    "Roasted Boar Meat": { yield: 5, ingredients: [{ name: "Raw Meat", quantity: 5 }, { name: "Wood", quantity: 2 }] },
    "Crispy Apple": { yield: 3, ingredients: [{ name: "Apple", quantity: 3 }] },
    "Rye Bread": { yield: 5, ingredients: [{ name: "Wheat", quantity: 5 }, { name: "Water Flask", quantity: 1 }] },
    "Minor Health Potion": { yield: 3, ingredients: [{ name: "Red Berry", quantity: 3 }, { name: "Water Flask", quantity: 1 }] },
    "Mana Vial": { yield: 3, ingredients: [{ name: "Blue Mushroom", quantity: 3 }, { name: "Water Flask", quantity: 1 }] },
    "Stamina Elixir": { yield: 3, ingredients: [{ name: "Apple", quantity: 2 }, { name: "Water Flask", quantity: 1 }] },
    "Iron Sword": { yield: 1, ingredients: [{ name: "Stone", quantity: 10 }, { name: "Wood", quantity: 3 }] },
    "Iron Pickaxe": { yield: 1, ingredients: [{ name: "Stone", quantity: 5 }, { name: "Wood", quantity: 5 }] },
    "Iron Axe": { yield: 1, ingredients: [{ name: "Stone", quantity: 5 }, { name: "Wood", quantity: 5 }] },
    "Wooden Shield": { yield: 1, ingredients: [{ name: "Wood", quantity: 8 }] },
    "Repair Kit": { yield: 3, ingredients: [{ name: "Stone", quantity: 2 }, { name: "Wood", quantity: 2 }] },
    "Traveler's Cloak": { yield: 1, ingredients: [{ name: "Dire Wolf Pelt", quantity: 5 }] },
    "Leather Boots": { yield: 1, ingredients: [{ name: "Dire Wolf Pelt", quantity: 3 }] },
    "Silk Bandana": { yield: 1, ingredients: [{ name: "Dire Wolf Pelt", quantity: 1 }] },
    "Oak Bed": { yield: 1, ingredients: [{ name: "Wood", quantity: 10 }, { name: "Dire Wolf Pelt", quantity: 2 }] },
    "Cozy Rug": { yield: 1, ingredients: [{ name: "Dire Wolf Pelt", quantity: 3 }] },
    "Wooden Chair": { yield: 2, ingredients: [{ name: "Wood", quantity: 5 }] },
    "Dining Table": { yield: 1, ingredients: [{ name: "Wood", quantity: 15 }] },
    "Storage Chest": { yield: 1, ingredients: [{ name: "Wood", quantity: 10 }, { name: "Stone", quantity: 2 }] },
    "Wardrobe": { yield: 1, ingredients: [{ name: "Wood", quantity: 20 }] },
    "Nightstand": { yield: 1, ingredients: [{ name: "Wood", quantity: 8 }] }
};

export class TownRoom extends BaseRoom<TownState> {
    maxClients = 100;
    private sceneryCounter = 0;
    private enemyCounter = 0;
    private lootCounter = 0;
    private eventCounter = 0;
    
    // PERFORMANCE: Background saving sets
    private dirtyStores = new Set<string>();
    private dirtyDecorations = new Set<string>();
    
    // PERFORMANCE: Reduced enemy caps to maintain solid TPS
    private maxEnemiesPerBiome = { elven: 40, winter: 50, desert: 60, swamp: 75, forest: 75 };
    
    // Engine Tick Trackers
    private tickCounter = 0;
    private eventSpawnTimer = 0;

    // --- CASINO STATE TRACKERS ---
    private activeBlackjackGames = new Map<string, { bet: number, pHand: number[], dHand: number[] }>();

    // --- PROGRESSIVE DISCLOSURE HANDLER ---
    private checkProgressionUnlocks(player: any, client: any) {
        let unlockedSomething = false;

        // Unlock Skill Tree & Aura at Level 2
        if (player.level >= 2 && !player.hasUnlockedSkillTree) {
            player.hasUnlockedSkillTree = true;
            player.hasUnlockedAura = true;
            unlockedSomething = true;
            client.send("server_event_log", { 
                html: `✨ You reached Level 2! Press <span class="hud-key">K</span> to open your Skill Tree and <span class="hud-key">Z</span> to Meditate.`, 
                type: "event-win" 
            });
        }

        // Unlock Land Purchasing at 100 coins
        if (player.coins >= 100 && !player.hasUnlockedBuilding) {
            player.hasUnlockedBuilding = true;
            unlockedSomething = true;
            client.send("server_event_log", { 
                html: `🏡 You have 100 Coins! Press <span class="hud-key">B</span> in the Wilderness to purchase Land.`, 
                type: "event-win" 
            });
        }

        if (unlockedSomething) {
            this.markPlayerDirty(client.sessionId);
        }
    }

    private drawCard() {
        const val = Math.floor(Math.random() * 13) + 1; // 1 to 13
        if (val === 1) return 11; // Ace
        if (val >= 10) return 10; // Face cards
        return val;
    }

    private calcScore(hand: number[]) {
        let score = 0; let aces = 0;
        for (const card of hand) {
            if (card === 11) { aces += 1; score += 11; }
            else if (card >= 10) { score += 10; }
            else { score += card; }
        }
        while (score > 21 && aces > 0) { score -= 10; aces -= 1; }
        return score;
    }

    async onCreate(options: any) {
        console.log(`\n[TownRoom] ---------------------------------`);
        console.log(`[TownRoom] onCreate started...`);
        const startTime = Date.now();

        this.setState(new TownState());
        this.state.zoneName = "Aethelgard";

        await super.onCreate(options); 

        try {
            console.log(`[TownRoom] Generating world scenery...`);
            this.generateWorld();
            
            console.log(`[TownRoom] Spawning enemies and loot...`);
            this.spawnEnemies(); 
            this.spawnVillageLoot();
            this.initializeStores();
            
            console.log(`[TownRoom] Loading database data...`);
            await this.loadWorldData();
            
            console.log(`[TownRoom] ✅ Room fully initialized in ${Date.now() - startTime}ms`);
            console.log(`[TownRoom] ---------------------------------\n`);
        } catch (err) {
            console.error(`[TownRoom] ❌ FATAL ERROR during initialization:`, err);
        }

        // --- PERFORMANCE: Background I/O Loop ---
        setInterval(() => {
            this.flushDirtyDatabases();
        }, 15000);
        
        // Spawn one event immediately for testing/startup
        setTimeout(() => this.spawnRealmEvent(), 10000);

        // --- ECONOMY & TOWN BUILDING ---
        this.onMessage("interactDecoration", (client, message: { id: string }) => {
            const p = this.state.players.get(client.sessionId);
            const deco = this.state.decorations.get(message.id);
            
            if (!p || !deco || distSq(p.x, p.y, deco.x, deco.z) > 9.0 || p.isMeditating) return; // 3.0^2
            
            if (deco.type === "Oak Bed" && !p.isSleeping) {
                p.isSleeping = true;
                p.sleepRot = deco.rotation;
                
                const oX = p.x; const oY = p.y;
                p.x = deco.x; p.y = deco.z;
                this.playerGrid.update(p, oX, oY, p.x, p.y);
                
                setTimeout(() => {
                    const me = this.state.players.get(client.sessionId);
                    if (me?.isSleeping) {
                        me.isSleeping = false;
                        me.hp = me.maxHp; me.mp = me.maxMp; me.stamina = me.maxStamina;
                        this.markPlayerDirty(client.sessionId); 
                    }
                }, 30000);
            }
        });

        // ==========================================
        // DYNAMIC CASINO & MINI-GAMES
        // ==========================================

        this.onMessage("playSlotMachine", (client, message: { bet: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || message.bet <= 0 || player.coins < message.bet) return;

            player.coins -= message.bet;
            
            const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
            const r1 = symbols[Math.floor(Math.random() * symbols.length)];
            const r2 = symbols[Math.floor(Math.random() * symbols.length)];
            const r3 = symbols[Math.floor(Math.random() * symbols.length)];

            let winnings = 0;
            let resultText = "";
            if (r1 === r2 && r2 === r3) { winnings = message.bet * 10; resultText = `🌟 JACKPOT!`; } 
            else if (r1 === r2 || r2 === r3 || r1 === r3) { winnings = message.bet * 2; resultText = `🎉 Small Win!`; } 
            else { resultText = `💀 Loss.`; }

            // Tell frontend exactly where the reels should stop
            this.broadcastNearby(player.x, player.y, 40, "playCasinoVisual", { 
                game: "Slot Machine", action: "spin", payload: { target: [r1, r2, r3] } 
            });

            setTimeout(() => {
                const p = this.state.players.get(client.sessionId);
                if (p) {
                    p.coins += winnings; this.markPlayerDirty(client.sessionId);
                    this.checkProgressionUnlocks(p, client);
                    client.send("casinoResult", { game: "Slot Machine", winnings, text: resultText, newBalance: p.coins });
                }
            }, 2000); // 2 second spin
        });

        this.onMessage("playCoinToss", (client, message: { bet: number, guess: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || message.bet <= 0 || player.coins < message.bet) return;

            player.coins -= message.bet;
            this.broadcastNearby(player.x, player.y, 40, "playCasinoVisual", { game: "Coin Toss" });

            const isHeads = Math.random() < 0.5;
            const result = isHeads ? "heads" : "tails";
            const won = message.guess === result;
            const winnings = won ? message.bet * 2 : 0;
            const resultText = won ? `🎉 You won! Landed on ${result.toUpperCase()}.` : `💀 You lost. Landed on ${result.toUpperCase()}.`;

            setTimeout(() => {
                const p = this.state.players.get(client.sessionId);
                if (p) {
                    p.coins += winnings; this.markPlayerDirty(client.sessionId);
                    this.checkProgressionUnlocks(p, client);
                    client.send("casinoResult", { game: "Coin Toss", winnings, text: resultText, newBalance: p.coins });
                }
            }, 1000);
        });

        this.onMessage("playRoulette", (client, message: { bet: number, guess: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || message.bet <= 0 || player.coins < message.bet) return;

            player.coins -= message.bet;
            this.broadcastNearby(player.x, player.y, 40, "playCasinoVisual", { game: "Roulette" });

            const roll = Math.floor(Math.random() * 37);
            const isRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(roll);
            const color = roll === 0 ? "green" : (isRed ? "red" : "black");

            let winnings = 0;
            let resultText = "";

            if (message.guess === "red" && isRed) { winnings = message.bet * 2; resultText = `🎉 Won! Rolled Red ${roll}.`; } 
            else if (message.guess === "black" && !isRed && roll !== 0) { winnings = message.bet * 2; resultText = `🎉 Won! Rolled Black ${roll}.`; } 
            else if (message.guess === String(roll)) { winnings = message.bet * 35; resultText = `🔥 MASSIVE WIN! EXACTLY ${roll}!`; } 
            else { resultText = `💀 Lost. Rolled ${color} ${roll}.`; }

            setTimeout(() => {
                const p = this.state.players.get(client.sessionId);
                if (p) {
                    p.coins += winnings; this.markPlayerDirty(client.sessionId);
                    this.checkProgressionUnlocks(p, client);
                    client.send("casinoResult", { game: "Roulette", winnings, text: resultText, newBalance: p.coins });
                }
            }, 2000);
        });

        // --- BLACKJACK STATE MACHINE ---
        this.onMessage("blackjack_start", (client, message: { bet: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || message.bet <= 0 || player.coins < message.bet) return;
            if (this.activeBlackjackGames.has(client.sessionId)) return; // Game already in progress

            player.coins -= message.bet;
            this.markPlayerDirty(client.sessionId);

            const pHand = [this.drawCard(), this.drawCard()];
            const dHand = [this.drawCard(), this.drawCard()];

            this.activeBlackjackGames.set(client.sessionId, { bet: message.bet, pHand, dHand });

            // Tell 3D scene to render holographic cards
            this.broadcastNearby(player.x, player.y, 40, "playCasinoVisual", { 
                game: "Blackjack", action: "deal", payload: { pHand, dHand } 
            });

            // Send private game state to the player's UI
            client.send("blackjack_state", {
                status: "playing",
                pHand: pHand,
                dHand: [dHand[0], 0], // Hide second dealer card from UI
                pScore: this.calcScore(pHand),
                dScore: this.calcScore([dHand[0]])
            });
        });

        this.onMessage("blackjack_action", (client, message: { action: "hit" | "stand" }) => {
            const game = this.activeBlackjackGames.get(client.sessionId);
            const player = this.state.players.get(client.sessionId);
            if (!game || !player) return;

            if (message.action === "hit") {
                const newCard = this.drawCard();
                game.pHand.push(newCard);
                const pScore = this.calcScore(game.pHand);

                this.broadcastNearby(player.x, player.y, 40, "playCasinoVisual", { 
                    game: "Blackjack", action: "hit", payload: { newCard } 
                });

                if (pScore > 21) {
                    client.send("blackjack_state", { status: "bust", pHand: game.pHand, dHand: game.dHand, pScore, dScore: this.calcScore(game.dHand), winnings: 0 });
                    this.activeBlackjackGames.delete(client.sessionId);
                } else {
                    client.send("blackjack_state", { status: "playing", pHand: game.pHand, dHand: [game.dHand[0], 0], pScore, dScore: this.calcScore([game.dHand[0]]) });
                }
            } 
            else if (message.action === "stand") {
                let dScore = this.calcScore(game.dHand);
                
                while (dScore < 17) {
                    game.dHand.push(this.drawCard());
                    dScore = this.calcScore(game.dHand);
                }

                const pScore = this.calcScore(game.pHand);
                let winnings = 0;
                let finalStatus = "lose";

                if (dScore > 21 || pScore > dScore) { winnings = game.bet * 2; finalStatus = "win"; } 
                else if (pScore === dScore) { winnings = game.bet; finalStatus = "push"; }

                player.coins += winnings;
                this.markPlayerDirty(client.sessionId);
                this.checkProgressionUnlocks(player, client);

                this.broadcastNearby(player.x, player.y, 40, "playCasinoVisual", { 
                    game: "Blackjack", action: "reveal", payload: { pHand: game.pHand, dHand: game.dHand } 
                });

                client.send("blackjack_state", { status: finalStatus, pHand: game.pHand, dHand: game.dHand, pScore, dScore, winnings });
                client.send("casinoResult", { game: "Blackjack", winnings, text: `Blackjack ${finalStatus.toUpperCase()}`, newBalance: player.coins });
                this.activeBlackjackGames.delete(client.sessionId);
            }
        });

        this.onMessage("buyLand", async (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating) return;

            const plotX = Math.floor(player.x / 20);
            const plotY = Math.floor(player.y / 20);
            const plotId = `${plotX}_${plotY}`;

            if (Math.abs(player.x) < 62 && Math.abs(player.y) < 62) return; 
            if (this.state.landPlots.has(plotId)) return; 

            if (player.coins >= 100) {
                player.coins -= 100;
                const newPlot = new LandPlotState();
                newPlot.id = plotId; newPlot.ownerId = client.sessionId; newPlot.ownerName = player.name;
                newPlot.gridX = plotX; newPlot.gridY = plotY; newPlot.price = 100;
                
                this.state.landPlots.set(plotId, newPlot);
                this.markPlayerDirty(client.sessionId);
                
                // Keep immediate save here as land is high value, low frequency
                try {
                    await db.collection("landPlots").doc(newPlot.id).set({ 
                        id: newPlot.id, ownerId: newPlot.ownerId, ownerName: newPlot.ownerName, 
                        gridX: newPlot.gridX, gridY: newPlot.gridY, price: newPlot.price 
                    }); 
                } catch (err) {}
            }
        });

        this.onMessage("placeBuilding", async (client, message: PlaceBuildingMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating) return;

            const plotX = Math.floor(message.x / 20);
            const plotY = Math.floor(message.z / 20);
            const plotId = `${plotX}_${plotY}`;

            const plot = this.state.landPlots.get(plotId);
            if (!plot || plot.ownerName !== player.name) return; 
            if (Math.abs(message.x) < 62 && Math.abs(message.z) < 62) return; 

            const buildingId = `bldg_${player.name}_${Date.now()}`;
            const newBuilding = new BuildingState();
            
            newBuilding.id = buildingId; newBuilding.ownerId = player.name;
            newBuilding.x = message.x; newBuilding.z = message.z; 
            newBuilding.type = message.type || "house";
            
            if (newBuilding.type === "house") newBuilding.targetProgress = 10; 
            else if (newBuilding.type === "farm") newBuilding.targetProgress = 5; 
            else if (newBuilding.type === "shop") newBuilding.targetProgress = 20;
            
            newBuilding.progress = 0; newBuilding.isConstructed = false;

            this.state.buildings.set(buildingId, newBuilding);
            this.buildingGrid.add(newBuilding, newBuilding.x, newBuilding.z);

            try { 
                await db.collection("buildings").doc(newBuilding.id).set({ 
                    id: newBuilding.id, ownerId: newBuilding.ownerId, x: newBuilding.x, z: newBuilding.z, 
                    type: newBuilding.type, progress: newBuilding.progress, targetProgress: newBuilding.targetProgress, isConstructed: newBuilding.isConstructed 
                }); 
            } catch (err) {}
        });

        this.onMessage("placeDecoration", async (client, message: PlaceDecorationMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating) return;

            const plotX = Math.floor(message.x / 20); const plotY = Math.floor(message.z / 20);
            const plotId = `${plotX}_${plotY}`;
            const plot = this.state.landPlots.get(plotId);

            if (!plot || plot.ownerName !== player.name) return; 

            const invItem = player.inventory.get(message.type);
            if (!invItem || invItem.quantity <= 0) return;

            invItem.quantity -= 1;
            if (invItem.quantity <= 0) {
                if (player.equippedItem === message.type) player.equippedItem = "";
                player.inventory.delete(message.type);
            }

            const decoId = `dec_${player.name}_${Date.now()}`;
            const newDeco = new DecorationState();
            
            newDeco.id = decoId; newDeco.ownerId = player.name; newDeco.type = message.type;
            newDeco.x = message.x; newDeco.z = message.z; newDeco.rotation = message.rotation; newDeco.y = 0.05; 

            this.state.decorations.set(decoId, newDeco);
            this.decoGrid.add(newDeco, newDeco.x, newDeco.z);

            this.markPlayerDirty(client.sessionId);
            this.dirtyDecorations.add(newDeco.id);
        });

        this.onMessage("contributeResource", async (client, message: { buildingId: string }) => {
            const player = this.state.players.get(client.sessionId);
            const building = this.state.buildings.get(message.buildingId);
            
            if (!player || !building || building.isConstructed || player.isSleeping || player.isMeditating) return;
            if (distSq(player.x, player.y, building.x, building.z) > 64.0) return; // 8^2

            let usedItem = "";
            if (player.inventory.has("Wood") && player.inventory.get("Wood")!.quantity > 0) usedItem = "Wood";
            else if (player.inventory.has("Stone") && player.inventory.get("Stone")!.quantity > 0) usedItem = "Stone";

            if (usedItem) {
                const invItem = player.inventory.get(usedItem)!;
                invItem.quantity -= 1;
                
                if (invItem.quantity <= 0) {
                    if (player.equippedItem === usedItem) player.equippedItem = "";
                    player.inventory.delete(usedItem);
                }

                building.progress += 1;
                if (building.progress >= building.targetProgress) {
                    building.progress = building.targetProgress; building.isConstructed = true;
                }

                try { await db.collection("buildings").doc(building.id).update({ progress: building.progress, isConstructed: building.isConstructed }); } catch (err) {}
            }
        });

        this.onMessage("craftStoreStock", (client, message: { storeId: string, itemName: string }) => {
            const player = this.state.players.get(client.sessionId);
            const store = this.state.stores.get(message.storeId);
            
            if (!player || !store || store.ownerId !== player.name) return;
            const item = store.inventory.get(message.itemName);
            if (!item) return;

            const recipe = STORE_RECIPES[message.itemName];
            if (!recipe) {
                client.send("hud_message", `<span style="color: #ff4444;">No known recipe to craft ${message.itemName}.</span>`);
                return;
            }

            let hasAllIngredients = true;
            let missingItem = "";

            for (const req of recipe.ingredients) {
                const playerItem = player.inventory.get(req.name);
                if (!playerItem || playerItem.quantity < req.quantity) {
                    hasAllIngredients = false;
                    missingItem = req.name;
                    break;
                }
            }

            if (!hasAllIngredients) {
                client.send("hud_message", `<span style="color: #ff4444;">Missing materials: Need more ${missingItem}.</span>`);
                return;
            }

            for (const req of recipe.ingredients) {
                const playerItem = player.inventory.get(req.name)!;
                playerItem.quantity -= req.quantity;
                if (playerItem.quantity <= 0) {
                    if (player.equippedItem === req.name) player.equippedItem = "";
                    player.inventory.delete(req.name);
                }
            }

            item.stock += recipe.yield;
            
            this.dirtyStores.add(store.id);
            this.markPlayerDirty(client.sessionId);
            
            client.send("hud_message", `<span style="color: #00ffaa;">Successfully produced ${recipe.yield}x ${message.itemName} for your store!</span>`);
            this.broadcastNearby(player.x, player.y, 40, "abilityUsed", { id: player.sessionId, abilityId: "bull_rush_fire", targetX: player.x, targetZ: player.y });
        });

        this.onMessage("craftItem", (client, message: { recipeId: string }) => {
            handleCrafting(this, client, message);
        });

        // ==========================================
        // DYNAMIC FISHING STATE MACHINE
        // ==========================================
        this.onMessage("startFishing", (client, message: { dx: number, dy: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || player.fishingState !== "none") return;

            if (player.mp < 5) {
                client.send("fishingResult", { success: false, message: "Not enough mana to fish." });
                return;
            }

            const lakeX = -180;
            const lakeZ = 180;
            const distanceToLakeSq = distSq(player.x, player.y, lakeX, lakeZ);
            
            if (distanceToLakeSq > 2500.0) return; // 50^2 

            // Deduct Mana and start the process
            player.mp -= 5;
            this.markPlayerDirty(client.sessionId);

            // Phase 1: Casting
            player.fishingState = "casting";
            
            // Calculate where the bobber lands based on player's facing direction
            // Normalizing the vector and throwing the bobber ~12 units away
            const length = Math.sqrt(message.dx * message.dx + message.dy * message.dy) || 1;
            player.bobberX = player.x + (message.dx / length) * 12.0;
            player.bobberZ = player.y + (message.dy / length) * 12.0;
            
            // Wait 1 second for the cast animation to complete before waiting for a fish
            this.clock.setTimeout(() => {
                const p = this.state.players.get(client.sessionId);
                if (!p || p.fishingState !== "casting") return; // They cancelled it

                // Phase 2: Waiting
                p.fishingState = "waiting";

                const catchTime = 3000 + Math.random() * 4000;
                
                this.clock.setTimeout(() => {
                    const p2 = this.state.players.get(client.sessionId);
                    if (!p2 || p2.fishingState !== "waiting") return;

                    // Phase 3: Reeling
                    p2.fishingState = "reeling";

                    // Wait 1 second for the reeling animation to finish, then give loot
                    this.clock.setTimeout(() => {
                        const p3 = this.state.players.get(client.sessionId);
                        if (!p3 || p3.fishingState !== "reeling") return;

                        p3.fishingState = "none";
                        
                        const roll = Math.random();
                        let caughtItem = "";
                        if (roll < 0.5) caughtItem = "Common Carp";
                        else if (roll < 0.8) caughtItem = "Silver Trout";
                        else if (roll < 0.95) caughtItem = "Golden Koi";
                        else caughtItem = "Old Boot"; 

                        if (!p3.inventory.has(caughtItem)) {
                            const newItem = new InventoryItemState();
                            newItem.name = caughtItem;
                            newItem.quantity = 0;
                            newItem.desc = ITEM_DB[caughtItem]?.desc || "A catch from the lake.";
                            p3.inventory.set(caughtItem, newItem);
                        }
                        
                        const itemRef = p3.inventory.get(caughtItem)!;
                        itemRef.quantity += 1;
                        
                        this.markPlayerDirty(client.sessionId);
                        client.send("fishingResult", { success: true, item: caughtItem });
                        
                        this.progressQuest(p3, "action", "catch_fish", 1, client);
                        
                    }, 1000); // 1 second reel time

                }, catchTime); // Random wait time
                
            }, 1000); // 1 second cast time
        });
    }

    async onJoin(client: Client, options: any) {
        console.log(`[TownRoom] 📥 Client ${client.sessionId} attempting to JOIN...`);
        try {
            await super.onJoin(client, options);
            console.log(`[TownRoom] ✅ Client ${client.sessionId} joined successfully.`);
        } catch (err) {
            console.error(`[TownRoom] ❌ Error during onJoin for ${client.sessionId}:`, err);
        }
    }

    // UPDATED: Standardized signature for disconnects using code?: number
    async onDrop(client: Client, code?: number) {
        console.log(`[TownRoom] ⚠️ UNGRACEFUL DISCONNECT: Client ${client.sessionId} dropped. (Code: ${code})`);
        
        try {
            await this.allowReconnection(client, 15);
            (this as any).onClientReconnected?.(client);
            console.log(`[TownRoom] 🔄 Client ${client.sessionId} reconnected successfully.`);
            return;
        } catch (e) {
            console.warn(`[TownRoom] ⏳ Reconnection window expired for ${client.sessionId}`);
        }

        // Final cleanup if reconnection window fails
        await this.finalizeClientLeave(client, code);
    }

    // UPDATED: Standardized signature matching BaseRoom using code?: number
    async onLeave(client: Client, code?: number) {
        console.log(`[TownRoom] 🚪 Client ${client.sessionId} LEFT gracefully. (Code: ${code})`);
        await this.finalizeClientLeave(client, code);
    }

    // UPDATED: Forwards the code properly
    protected async finalizeClientLeave(client: Client, code?: number) {
        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        try {
            // Forward the leave event to BaseRoom for core state cleanup
            if (typeof super.onLeave === "function") {
                await super.onLeave(client, code); 
            }
        } catch (err) {
            console.error(`[TownRoom] ❌ Error during BaseRoom cleanup for ${client.sessionId}:`, err);
        }

        // save to DB
        // remove from grids
        // remove from state
        // clean teams/familiars/etc
    }

    onDispose() {
        console.log(`[TownRoom] 🗑️ TownRoom Disposed.`);
    }

    protected universalUpdate(deltaTime: number) {
        this.tickCounter++;
        super.universalUpdate(deltaTime); 

        const dtSec = deltaTime / 1000;

        this.eventSpawnTimer += dtSec;
        if (this.eventSpawnTimer > 900) { // 15 mins
            this.spawnRealmEvent();
            this.eventSpawnTimer = 0;
        }

        // Throttle expensive global checks
        if (this.tickCounter % 20 === 0) { // Every 1 sec
            this.checkStoreLeases();
            
            // NEW: Periodic progression check for all players (catches EXP/Loot gains from BaseRoom)
            this.state.players.forEach((player, sessionId) => {
                const client = this.clients.find(c => c.sessionId === sessionId);
                if (client) this.checkProgressionUnlocks(player, client);
            });
        }

        if (this.tickCounter % 100 === 0) { // Every 5 sec
            this.maintainPopulation();
        }

        this.updateRealmEvents(dtSec);
    }
    
    // ==========================================
    // DYNAMIC REALM EVENTS
    // ==========================================
    private spawnRealmEvent() {
        if (this.state.realmEvents.size >= 3) return;

        let x = 0, z = 0;
        let valid = false;
        
        for (let i = 0; i < 50; i++) {
            x = (Math.random() - 0.5) * (WORLD_RADIUS * 2);
            z = (Math.random() - 0.5) * (WORLD_RADIUS * 2);
            if (distSq(x, z, 0, 0) > 640000) { // 800^2
                valid = true;
                break;
            }
        }
        
        if (!valid) return;

        const event = new RealmEventState();
        event.id = `realm_event_${this.eventCounter++}`;
        event.x = x;
        event.y = z;
        event.type = "abyssal_portal";
        event.eventName = "Abyssal Portal Invasion";
        event.state = "waiting";
        event.radius = 18.0;
        event.timer = 0; 
        event.progress = 0; 
        event.targetProgress = 5; 

        this.state.realmEvents.set(event.id, event);
        
        const biome = this.getBiome(x, z);
        const biomeNames = { "winter": "Frozen Wastes", "desert": "Scorching Sands", "swamp": "Toxic Marsh", "elven": "Aethelgard Woods", "forest": "Deep Forest" };
        const bName = biomeNames[biome as keyof typeof biomeNames] || "Wilderness";

        let direction = "";
        if (z < -200) direction += "North";
        if (z > 200) direction += "South";
        if (x > 200) direction += direction === "" ? "East" : "east";
        if (x < -200) direction += direction === "" ? "West" : "west";
        if (direction === "") direction = "Central";

        this.broadcast("server_event_log", {
            html: `⚠️ <b>A Realm Event has appeared in the ${direction} ${bName}!</b> Look for the beacon in the sky.`,
            type: "event-info"
        });
    }

    private updateRealmEvents(dtSec: number) {
        for (const [eventId, event] of this.state.realmEvents.entries()) {
            
            if (event.state === "waiting") {
                const rSq = event.radius * event.radius;
                for (const player of this.state.players.values()) {
                    if (distSq(player.x, player.y, event.x, event.y) <= rSq) {
                        event.state = "active";
                        event.timer = 180; 
                        event.progress = 1; 
                        
                        this.broadcast("server_event_log", {
                            html: `⚔️ The <b>${event.eventName}</b> has been triggered! Survive the onslaught.`,
                            type: "event-info"
                        });
                        
                        this.spawnEventWave(event);
                        break;
                    }
                }
            }
            
            else if (event.state === "active") {
                event.timer -= dtSec;
                
                if (event.timer <= 0) {
                    event.state = "failed";
                    this.broadcast("server_event_log", {
                        html: `💀 The <b>${event.eventName}</b> has dissipated. The heroes were too slow.`,
                        type: "event-info"
                    });
                    
                    for (const enemy of this.state.enemies.values()) {
                        if ((enemy as any).eventId === event.id) {
                            this.removeEnemy(enemy.id);
                        }
                    }
                    
                    setTimeout(() => { if (this.state.realmEvents.has(eventId)) this.state.realmEvents.delete(eventId); }, 5000);
                    continue;
                }

                let enemiesAlive = 0;
                for (const enemy of this.state.enemies.values()) {
                    if ((enemy as any).eventId === event.id && enemy.hp > 0) enemiesAlive++;
                }

                if (enemiesAlive === 0) {
                    event.progress += 1;
                    if (event.progress > event.targetProgress) {
                        event.state = "completed";
                        this.broadcast("server_event_log", {
                            html: `🏆 The <b>${event.eventName}</b> was successfully conquered!`,
                            type: "event-info"
                        });
                        
                        const chest = new LootState();
                        chest.id = `radiant_chest_${eventId}`;
                        chest.kind = "chest"; 
                        chest.x = event.x;
                        chest.y = event.y;
                        chest.isOpen = false;
                        
                        for(let i=0; i<5; i++) {
                            const drops = ["Golden Sunblade", "Minor Health Potion", "Tome of Awakening", "Bronze-Forged Battleaxe"];
                            this.spawnDrop(event.x + (Math.random()-0.5)*4, event.y + (Math.random()-0.5)*4, drops[Math.floor(Math.random() * drops.length)]);
                        }

                        this.state.lootItems.set(chest.id, chest);
                        
                        setTimeout(() => { if (this.state.realmEvents.has(eventId)) this.state.realmEvents.delete(eventId); }, 10000);
                    } else {
                        this.spawnEventWave(event);
                    }
                }
            }
        }
    }

    private spawnEventWave(event: RealmEventState) {
        const numEnemies = 3 + (event.progress * 2); 
        const biome = this.getBiome(event.x, event.y);
        
        for (let i = 0; i < numEnemies; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * (event.radius - 2);
            const ex = event.x + Math.cos(angle) * r;
            const ez = event.y + Math.sin(angle) * r;

            const enemy = new EnemyState(); 
            enemy.id = `event_enemy_${this.enemyCounter++}`; 
            enemy.x = ex; enemy.y = ez;
            enemy.targetX = ex; enemy.targetY = ez; 
            enemy.action = "idle";
            
            (enemy as any).eventId = event.id;

            const mult = 1.0 + (event.progress * 0.2); 

            if (biome === "elven") {
                enemy.name = "Corrupted Ent"; enemy.maxHp = 300 * mult; enemy.hp = 300 * mult; enemy.damage = 45 * mult; enemy.speed = 3.5; enemy.attackType = "aoe"; enemy.attackRadius = 6.0; enemy.maxAttackWindup = 2.0; enemy.maxAttackCooldown = 6.0; 
            } else if (biome === "winter") { 
                enemy.name = "Frost Elemental"; enemy.maxHp = 150 * mult; enemy.hp = 150 * mult; enemy.damage = 25 * mult; enemy.speed = 4.0; enemy.attackType = "aoe"; enemy.attackRadius = 4.0; enemy.maxAttackWindup = 1.5; enemy.maxAttackCooldown = 4.0; 
            } else if (biome === "desert") { 
                enemy.name = "Sand Crawler"; enemy.maxHp = 100 * mult; enemy.hp = 100 * mult; enemy.damage = 15 * mult; enemy.speed = 4.5; enemy.attackType = "dash"; enemy.attackRadius = 5.0; enemy.maxAttackWindup = 0.8; enemy.maxAttackCooldown = 3.0; 
            } else if (biome === "swamp") { 
                enemy.name = "Plague Toad"; enemy.maxHp = 120 * mult; enemy.hp = 120 * mult; enemy.damage = 20 * mult; enemy.speed = 3.5; enemy.attackType = "aoe"; enemy.attackRadius = 5.0; enemy.maxAttackWindup = 1.2; enemy.maxAttackCooldown = 4.0; 
            } else {
                enemy.name = "Dire Wolf"; enemy.maxHp = 100 * mult; enemy.hp = 100 * mult; enemy.damage = 15 * mult; enemy.speed = 6.0; enemy.attackType = "dash"; enemy.attackRadius = 6.0; enemy.maxAttackWindup = 0.8; enemy.maxAttackCooldown = 3.0; 
            }
            
            this.state.enemies.set(enemy.id, enemy); 
            this.enemyGrid.add(enemy, enemy.x, enemy.y);
        }
    }

    // ==========================================
    // SPAWNING AND BIOME LOGIC
    // ==========================================
    private spawnEnemies() { 
        for (let i = 0; i < 10; i++) this.maintainPopulation(); 
    }

    private maintainPopulation() {
        const counts = { elven: 0, winter: 0, desert: 0, swamp: 0, forest: 0 };
        for (const [enemyId, e] of this.state.enemies.entries()) {
            if ((e as any).eventId) continue; 
            const b = this.getBiome(e.x, e.y); 
            if (counts.hasOwnProperty(b)) counts[b as keyof typeof counts]++; 
        }
        for (const [biome, cap] of Object.entries(this.maxEnemiesPerBiome)) {
            const currentCount = counts[biome as keyof typeof counts];
            if (currentCount < cap) {
                const amountToSpawn = Math.min(5, cap - currentCount); 
                for (let i = 0; i < amountToSpawn; i++) this.spawnSingleEnemy(biome);
            }
        }
    }

    private spawnSingleEnemy(targetBiome: string) {
        let x = 0, z = 0; 
        let valid = false; 
        let attempts = 0;
        
        while (!valid && attempts < 50) {
            attempts++;
            if (targetBiome === "elven") { x = 800 + Math.random() * (WORLD_RADIUS - 800); z = (Math.random() - 0.5) * (WORLD_RADIUS * 2); }
            else if (targetBiome === "winter") { x = (Math.random() - 0.5) * (WORLD_RADIUS * 2); z = -800 - Math.random() * (WORLD_RADIUS - 800); }
            else if (targetBiome === "desert") { x = (Math.random() - 0.5) * (WORLD_RADIUS * 2); z = 800 + Math.random() * (WORLD_RADIUS - 800); }
            else if (targetBiome === "swamp") { x = -800 - Math.random() * (WORLD_RADIUS - 800); z = (Math.random() - 0.5) * (WORLD_RADIUS * 2); }
            else { x = (Math.random() - 0.5) * 1600; z = (Math.random() - 0.5) * 1600; }
            
            if (distSq(x, z, 0, 0) < 10000) continue; // 100^2
            if (this.getBiome(x, z) === targetBiome) valid = true;
        }
        
        if (!valid) return;
        
        const enemy = new EnemyState(); 
        enemy.id = `enemy_${this.enemyCounter++}`; enemy.x = x; enemy.y = z;
        enemy.targetX = x + 1; enemy.targetY = z + 1; enemy.action = "idle";
        
        if (targetBiome === "elven") {
            if (Math.random() > 0.5) { enemy.name = "Corrupted Ent"; enemy.maxHp = 300; enemy.hp = 300; enemy.damage = 45; enemy.speed = 3.0; enemy.attackType = "aoe"; enemy.attackRadius = 6.0; enemy.maxAttackWindup = 2.0; enemy.maxAttackCooldown = 6.0; } 
            else { enemy.name = "Elven Wraith"; enemy.maxHp = 150; enemy.hp = 150; enemy.damage = 30; enemy.speed = 6.0; enemy.attackType = "dash"; enemy.attackRadius = 8.0; enemy.maxAttackWindup = 1.0; enemy.maxAttackCooldown = 4.0; }
        } else if (targetBiome === "winter") { 
            enemy.name = "Frost Elemental"; enemy.maxHp = 150; enemy.hp = 150; enemy.damage = 25; enemy.speed = 3.5; enemy.attackType = "aoe"; enemy.attackRadius = 4.0; enemy.maxAttackWindup = 1.5; enemy.maxAttackCooldown = 4.0; 
        } else if (targetBiome === "desert") { 
            enemy.name = "Sand Crawler"; enemy.maxHp = 100; enemy.hp = 100; enemy.damage = 15; enemy.speed = 4.0; enemy.attackType = "dash"; enemy.attackRadius = 5.0; enemy.maxAttackWindup = 0.8; enemy.maxAttackCooldown = 3.0; 
        } else if (targetBiome === "swamp") { 
            enemy.name = "Plague Toad"; enemy.maxHp = 120; enemy.hp = 120; enemy.damage = 20; enemy.speed = 3.5; enemy.attackType = "aoe"; enemy.attackRadius = 5.0; enemy.maxAttackWindup = 1.2; enemy.maxAttackCooldown = 4.0; 
        } else {
            if (Math.random() > 0.5) { enemy.name = "Wild Slime"; enemy.maxHp = 80; enemy.hp = 80; enemy.damage = 10; enemy.speed = 3.5; enemy.attackType = "melee"; enemy.attackRadius = 2.5; enemy.maxAttackWindup = 0.5; enemy.maxAttackCooldown = 2.0; } 
            else { enemy.name = "Dire Wolf"; enemy.maxHp = 100; enemy.hp = 100; enemy.damage = 15; enemy.speed = 5.5; enemy.attackType = "dash"; enemy.attackRadius = 6.0; enemy.maxAttackWindup = 0.8; enemy.maxAttackCooldown = 3.0; }
        }
        
        this.state.enemies.set(enemy.id, enemy); 
        this.enemyGrid.add(enemy, enemy.x, enemy.y);
    }

    private spawnVillageLoot() { 
        const villages = [ {cx: 250, cz: 250}, {cx: -300, cz: 400}, {cx: 500, cz: -150} ];
        for (const v of villages) { 
            this.createChest(v.cx, v.cz - 13); this.createChest(v.cx - 13, v.cz + 2); this.createChest(v.cx + 13, v.cz + 2); 
        } 
    }
    
    private createChest(x: number, y: number) { 
        const chest = new LootState(); 
        chest.id = `loot_${this.lootCounter++}`; chest.kind = "chest"; chest.x = x; chest.y = y; chest.isOpen = false; 
        this.state.lootItems.set(chest.id, chest); 
    }
    
    private checkStoreLeases() { 
        const now = Date.now(); 
        for (const [storeId, store] of this.state.stores.entries()) {
            if (store.ownerId && store.ownershipUntil > 0 && now >= store.ownershipUntil) { 
                store.ownerId = ""; store.ownerName = ""; store.ownershipUntil = 0; store.vault = 0; 
                for (const [itemId, item] of store.inventory.entries()) item.stock = 0;
                this.dirtyStores.add(store.id); 
            } 
        }
    }

    private flushDirtyDatabases() {
        if (this.dirtyStores.size > 0) {
            Array.from(this.dirtyStores).forEach(async (storeId) => {
                const store = this.state.stores.get(storeId);
                if (store) {
                    const invArray: any[] = [];
                    store.inventory.forEach(item => invArray.push({ name: item.name, stock: item.stock }));
                    try {
                        await db.collection("stores").doc(store.id).set({
                            ownerId: store.ownerId, ownerName: store.ownerName, ownershipUntil: store.ownershipUntil, vault: store.vault, inventory: invArray
                        }, { merge: true });
                    } catch(err) {}
                }
            });
            this.dirtyStores.clear();
        }

        if (this.dirtyDecorations.size > 0) {
            Array.from(this.dirtyDecorations).forEach(async (decoId) => {
                const deco = this.state.decorations.get(decoId);
                if (deco) {
                    const invArray: any[] = [];
                    deco.inventory.forEach(item => invArray.push({ name: item.name, quantity: item.quantity, desc: item.desc }));
                    try { await db.collection("decorations").doc(deco.id).update({ inventory: invArray }); } catch(err) {}
                }
            });
            this.dirtyDecorations.clear();
        }
    }

    private async loadWorldData() {
        try {
            const plots = await db.collection("landPlots").get(); 
            plots.forEach(doc => { 
                const p = doc.data(); const plot = new LandPlotState(); 
                plot.id = p.id; plot.ownerId = p.ownerId || ""; plot.ownerName = p.ownerName || ""; 
                plot.gridX = p.gridX || 0; plot.gridY = p.gridY || 0; plot.price = p.price || 100; 
                this.state.landPlots.set(plot.id, plot); 
            });
            
            const bldgs = await db.collection("buildings").get(); 
            bldgs.forEach(doc => { 
                const b = doc.data(); const bldg = new BuildingState(); 
                bldg.id = b.id; bldg.ownerId = b.ownerId || ""; 
                bldg.x = b.x || 0; bldg.z = b.z || 0; 
                bldg.type = b.type || "house"; bldg.progress = b.progress || 0; bldg.targetProgress = b.targetProgress || 10; bldg.isConstructed = b.isConstructed || false; 
                this.state.buildings.set(bldg.id, bldg); this.buildingGrid.add(bldg, bldg.x, bldg.z); 
            });
            
            const decos = await db.collection("decorations").get(); 
            decos.forEach(doc => { 
                const d = doc.data(); const deco = new DecorationState(); 
                deco.id = d.id; deco.ownerId = d.ownerId || ""; deco.type = d.type || ""; 
                deco.x = d.x || 0; deco.y = d.y || 0; deco.z = d.z || 0; deco.rotation = d.rotation || 0; 
                
                if (d.inventory && Array.isArray(d.inventory)) {
                    d.inventory.forEach((inv: any) => { 
                        const item = new InventoryItemState(); 
                        item.name = inv.name; item.quantity = inv.quantity; item.desc = inv.desc; 
                        deco.inventory.set(inv.name, item); 
                    });
                }
                this.state.decorations.set(deco.id, deco); this.decoGrid.add(deco, deco.x, deco.z); 
            });
            
            const stores = await db.collection("stores").get(); 
            stores.forEach(doc => { 
                const s = doc.data(); const store = this.state.stores.get(doc.id); 
                if (store) { 
                    store.ownerId = s.ownerId || ""; store.ownerName = s.ownerName || ""; 
                    store.ownershipUntil = s.ownershipUntil || 0; store.vault = s.vault || 0; 
                    
                    if (s.inventory && Array.isArray(s.inventory)) {
                        s.inventory.forEach((inv: any) => { 
                            const item = store.inventory.get(inv.name); 
                            if (item) item.stock = inv.stock || 0; 
                        }); 
                    }
                } 
            });
        } catch (err) {}
    }

    private initializeStores() {
        const items = Object.values(ITEM_DB).filter(i => i.type === "decoration").map(i => i.name);
        const defs = [ 
            { type: "🍖 Food Provisions", items: ["Crispy Apple", "Rye Bread", "Roasted Boar Meat"] }, 
            { type: "🧪 Potion Shop", items: ["Minor Health Potion", "Mana Vial", "Stamina Elixir"] }, 
            { type: "⚒️ Blacksmith", items: ["Iron Sword", "Wooden Shield", "Iron Axe", "Iron Pickaxe", "Repair Kit", "Wood", "Stone"] }, 
            { type: "🧵 Tailor & Clothing", items: ["Traveler's Cloak", "Leather Boots", "Silk Bandana"] }, 
            { type: "🛋️ Interior Design", items: items } 
        ];
        
        defs.forEach((def, idx) => {
            const store = new StoreState(); 
            store.id = `store_npc_${idx}`; store.type = def.type; store.ownershipUntil = 0; store.vault = 0;
            
            def.items.forEach(name => { 
                const dbE = ITEM_DB[name]; 
                if (dbE) { 
                    const item = new StoreItemState(); 
                    item.name = dbE.name; item.price = dbE.buyPrice; item.wholesalePrice = dbE.wholesalePrice; item.desc = dbE.desc; item.stock = 0; 
                    store.inventory.set(dbE.name, item); 
                } 
            });
            this.state.stores.set(store.id, store);
        });
    }

    private getBiome(x: number, z: number): string { 
        if (x > 800) return "elven"; if (z < -800) return "winter"; if (z > 800) return "desert"; if (x < -800) return "swamp"; return "forest"; 
    }

    private generateWorld() {
        for (let i = 0; i < 10000; i++) {
            const x = (Math.random() - 0.5) * (WORLD_RADIUS * 2); 
            const z = (Math.random() - 0.5) * (WORLD_RADIUS * 2);
            
            if (distSq(x, z, 0, 0) < TOWN_RADIUS * TOWN_RADIUS) continue;
            
            const biome = this.getBiome(x, z); 
            const isRock = Math.random() > 0.7; 
            const item = new SceneryState();
            
            item.id = `scenery_${this.sceneryCounter++}`; item.x = x; item.y = z; item.rotation = Math.random() * Math.PI * 2;
            
            if (isRock) {
                if (biome === "winter") item.kind = "snow_rock"; 
                else if (biome === "desert") item.kind = "sand_rock"; 
                else if (biome === "elven") item.kind = "crystal_rock"; 
                else item.kind = "rock";
                
                item.scale = 0.5 + Math.random() * 1.5; item.maxHp = 30;
            } else {
                if (biome === "winter") item.kind = "pine_tree"; 
                else if (biome === "desert") item.kind = "cactus"; 
                else if (biome === "swamp") item.kind = "dead_tree"; 
                else if (biome === "elven") item.kind = "magic_tree"; 
                else item.kind = "tree";
                
                item.scale = 0.8 + Math.random() * 1.2; item.maxHp = 20;
            }
            
            item.hp = item.maxHp; 
            this.state.scenery.set(item.id, item); 
            this.sceneryGrid.add(item, item.x, item.y);
            console.log(`[SERVER] World generation complete. Total Scenery in state: ${this.state.scenery.size}`);
        }
    }
}