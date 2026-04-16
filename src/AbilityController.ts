import { Client } from "colyseus";
import { EnemyState, AfflictionState } from "./schema/EnemyState";
import { SceneryState } from "./schema/SceneryState";
import { ITEM_DB } from "./ItemDatabase";
import { BaseRoom } from "./rooms/BaseRoom"; 
import { getSkillDef } from "./data/AbilityDatabase";

import { checkTownCollision, checkDynamicCollision, distToSegmentSquared } from "./game/CollisionSystem";

// ==========================================
// PERFORMANCE: FAST MATH HELPERS
// ==========================================
function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

export function applyAffliction(
    enemy: any, 
    type: string, 
    duration: number, 
    damagePerTick: number, 
    tickTimer: number, 
    stacks: number = 1, 
    maxStacks: number = 5
) {
    let aff = enemy.afflictions.get(type);
    if (!aff) {
        aff = new AfflictionState();
        enemy.afflictions.set(type, aff);
        enemy[`${type}_stacks`] = 0; 
    }
    aff.type = type;
    aff.duration = Math.max(aff.duration, duration); 
    aff.damagePerTick = damagePerTick;
    aff.tickTimer = tickTimer;
    
    const currentStacks = enemy[`${type}_stacks`] || 0;
    enemy[`${type}_stacks`] = Math.min(currentStacks + stacks, maxStacks);
}

// ==========================================
// ABILITY DICTIONARY
// ==========================================

type AbilityContext = {
    room: BaseRoom<any> & { scheduledEvents?: { executeAt: number, fn: () => void }[] }; 
    client: Client;
    message: any;
    player: any;
    rank: (upgradeId: string) => number;
    targetX: number;
    targetZ: number;
    abilityId: string;
    now: number;
};

const abilityHandlers: Record<string, (ctx: AbilityContext) => void> = {

    // ------------------------------------------
    // UTILITY: WAYFINDER SYSTEM
    // ------------------------------------------
    wayfinder_base: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const coreRank = rank("core_progression"); 
        if (coreRank >= 4) {
            room.activeHazards = (room.activeHazards as any[]).filter((h: any) => !(h.type === "map_marker" && h.ownerId === player.sessionId));
            room.activeHazards.push({
                type: "map_marker", id: `marker_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 999999, rank: coreRank
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "map_marker_placed", targetX, targetZ });
            client.send("serverMessage", { text: "📍 Custom Map Marker Placed!", color: "#00aaff" });
        }
    },
    explorer_branch: ({ room, client, player, rank }) => {
        const expRank = rank("branch_progression"); 
        if (expRank >= 2) {
            const scanRadius = expRank >= 4 ? 60.0 : 25.0; 
            const scanRadSq = scanRadius * scanRadius;
            room.broadcastNearby(player.x, player.y, scanRadius + 20, "abilityUsed", { id: player.sessionId, abilityId: "scan_pulse", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: `📡 Scanning ${scanRadius}m radius...`, color: "#00ffaa" });
            
            let found = 0;
            if (room.state.lootItems) {
                for (const loot of room.state.lootItems.values()) {
                    if (distSq(player.x, player.y, loot.x, loot.y) <= scanRadSq) found++;
                }
            }
            if (found > 0) client.send("serverMessage", { text: `💎 Found ${found} points of interest!`, color: "#00ffaa" });
        }
    },
    tactical_branch: ({ room, player, rank }) => {
        if (rank("branch_progression") >= 1) {
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "tactical_ping", targetX: player.x, targetZ: player.y });
        }
    },
    traveler_branch: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const travRank = rank("branch_progression");
        if (travRank >= 5) {
            const oldX = player.x; const oldY = player.y;
            player.x = targetX; player.y = targetZ;
            room.playerGrid.update(player, oldX, oldY, player.x, player.y);
            client.send("forcePosition", { x: targetX, z: targetZ });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "instant_relocation", targetX, targetZ });
            return;
        }
        if (travRank >= 2) {
            let existingBeacon = (room.activeHazards as any[]).find((h: any) => h.type === "recall_beacon" && h.ownerId === player.sessionId);
            if (existingBeacon) {
                const oldX = player.x; const oldY = player.y;
                player.x = existingBeacon.x; player.y = existingBeacon.y;
                room.playerGrid.update(player, oldX, oldY, player.x, player.y);
                client.send("forcePosition", { x: existingBeacon.x, z: existingBeacon.y });
                room.broadcastNearby(existingBeacon.x, existingBeacon.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "teleport_warp", targetX: existingBeacon.x, targetZ: existingBeacon.y });
                if (travRank < 4) room.activeHazards = (room.activeHazards as any[]).filter((h: any) => h.id !== existingBeacon!.id);
            } else {
                room.activeHazards.push({
                    type: "recall_beacon", id: `beacon_${now}`, ownerId: player.sessionId,
                    x: player.x, y: player.y, timer: 999999, rank: travRank
                });
                room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "place_beacon", targetX: player.x, targetZ: player.y });
                client.send("serverMessage", { text: "🔮 Recall Beacon Placed! Use ability again to teleport back.", color: "#aa44ff" });
            }
        }
    },

    // ------------------------------------------
    // UTILITY: PERCEPTION SYSTEM
    // ------------------------------------------
    perception_base: ({ room, client, player, rank }) => {
        const coreRank = rank("core_progression");
        if (coreRank >= 2) {
            const radius = coreRank >= 5 ? 30.0 : 15.0;
            room.broadcastNearby(player.x, player.y, radius + 20, "abilityUsed", { id: player.sessionId, abilityId: "scan_pulse", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: `👁️ Pulse sent! Revealing entities within ${radius}m.`, color: "#ff00ff" });
        }
    },
    hunter_branch: ({ client }) => client.send("serverMessage", { text: "🎯 Hunter abilities are primarily passive. Check your HUD/UI.", color: "#ff5500" }),
    treasure_branch: ({ client }) => client.send("serverMessage", { text: "💰 Treasure abilities are primarily passive. Check your minimap.", color: "#ffd700" }),
    arcane_branch: ({ room, client, player, rank }) => {
        if (rank("branch_progression") >= 5) {
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "reality_layer", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "🔮 Reality Layer shifted. Secrets revealed.", color: "#8800ff" });
        }
    },

    // ------------------------------------------
    // UTILITY: TINKERER SYSTEM
    // ------------------------------------------
    tinkerer_base: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const coreRank = rank("core_progression");
        if (coreRank >= 2) {
            room.activeHazards.push({
                type: "tinkerer_trap", id: `trap_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 120.0, rank: coreRank
            });
            client.send("serverMessage", { text: "⚙️ Trap placed successfully.", color: "#ff8800" });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "place_trap", targetX, targetZ });
        }
    },
    engineer_branch: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const engRank = rank("branch_progression");
        if (engRank >= 1) {
            const type = engRank >= 2 ? "engineer_shield_dome" : "engineer_turret";
            room.activeHazards.push({
                type: type, id: `construct_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 60.0, rank: engRank, customData: { tickTimer: 1.0 }
            });
            client.send("serverMessage", { text: `🏗️ ${type.replace("_", " ")} Deployed.`, color: "#aaaaaa" });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "deploy_construct", targetX, targetZ });
        }
    },
    saboteur_branch: ({ room, client, player, rank, targetX, targetZ }) => {
        const sabRank = rank("branch_progression");
        if (sabRank >= 5) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "emp_shutdown", targetX, targetZ });
            for (const e of room.enemyGrid.getNearby(targetX, targetZ, 15.0)) {
                if (distSq(e.x, e.y, targetX, targetZ) <= 225.0) { // 15^2
                    e.stunnedTimer = Math.max(e.stunnedTimer, 5.0);
                    applyAffliction(e, "Silence", 5.0, 0, 0);
                }
            }
        } else if (sabRank >= 1) {
            const traps = (room.activeHazards as any[]).filter((h: any) => h.ownerId === player.sessionId && h.type.includes("trap"));
            const batchEvents: any[] = [];
            
            traps.forEach((t: any) => {
                t.timer = 0; 
                room.broadcastNearby(t.x, t.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "trap_detonate", targetX: t.x, targetZ: t.y });
                for (const e of room.enemyGrid.getNearby(t.x, t.y, 5.0)) {
                    if (distSq(e.x, e.y, t.x, t.y) <= 25.0) { // 5^2
                        e.hp -= 100;
                        batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 100, isCrit: true });
                        if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                    }
                }
            });
            if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 60, "combat_batch", batchEvents);
            client.send("serverMessage", { text: `💣 Detonated ${traps.length} traps remotely!`, color: "#ff2222" });
        }
    },
    utility_branch: ({ room, client, player, rank }) => {
        if (rank("branch_progression") >= 1) {
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "mobile_crafting", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "🔧 Mobile Crafting Station Opened.", color: "#ffaa44" });
        }
    },

    // ------------------------------------------
    // UTILITY: MOBILITY SYSTEM
    // ------------------------------------------
    mobility_base: ({ room, client, player, rank, targetX, targetZ }) => {
        if (rank("core_progression") >= 2) {
            const dx = targetX - player.x; const dz = targetZ - player.y;
            const distSqCalc = dx * dx + dz * dz;
            const dist = Math.sqrt(distSqCalc) || 1;
            const dashDist = 8.0;
            
            let finalX = player.x + (dx / dist) * dashDist;
            let finalZ = player.y + (dz / dist) * dashDist;

            // PERFORMANCE: Step by 2 units for collision instead of 1
            for(let i = 2; i <= dashDist; i += 2) {
                let testX = player.x + (dx / dist) * i;
                let testZ = player.y + (dz / dist) * i;
                if (checkTownCollision(testX, testZ) || checkDynamicCollision(room.state, testX, testZ)) {
                    break;
                }
                finalX = testX; finalZ = testZ;
            }
            
            const oldX = player.x; const oldY = player.y;
            player.x = finalX; player.y = finalZ;
            room.playerGrid.update(player, oldX, oldY, player.x, player.y);
            client.send("forcePosition", { x: finalX, z: finalZ });
            room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "basic_dash", targetX: finalX, targetZ: finalZ });
        }
    },
    speed_branch: ({ room, client, player, rank, targetX, targetZ }) => {
        const spdRank = rank("branch_progression");
        if (spdRank >= 3) {
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "time_slow", targetX: player.x, targetZ: player.y });
            for (const e of room.enemyGrid.getNearby(player.x, player.y, 15.0)) {
                if (distSq(e.x, e.y, player.x, player.y) <= 225.0) applyAffliction(e, "Slow", 5.0, 0, 0, 5, 5);
            }
        } else if (spdRank >= 1) {
            const oldX = player.x; const oldY = player.y;
            player.x = targetX; player.y = targetZ;
            room.playerGrid.update(player, oldX, oldY, player.x, player.y);
            client.send("forcePosition", { x: targetX, z: targetZ });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "blink", targetX, targetZ });
        }
    },
    traversal_branch: ({ room, client, player, rank, targetX, targetZ }) => {
        if (rank("branch_progression") >= 1) {
            const oldX = player.x; const oldY = player.y;
            player.x = targetX; player.y = targetZ;
            room.playerGrid.update(player, oldX, oldY, player.x, player.y);
            client.send("forcePosition", { x: targetX, z: targetZ });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "grapple_hook", targetX, targetZ });
        }
    },
    escape_branch: ({ room, client, player, rank, targetX, targetZ }) => {
        const escRank = rank("branch_progression");
        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "smoke_bomb", targetX: player.x, targetZ: player.y });
        (player as any).stealthedUntil = Date.now() + 5000;
        
        if (escRank >= 4) {
            const oldX = player.x; const oldY = player.y;
            player.x = targetX; player.y = targetZ;
            room.playerGrid.update(player, oldX, oldY, player.x, player.y);
            client.send("forcePosition", { x: targetX, z: targetZ });
        }
    },

    // ------------------------------------------
    // UTILITY: AGRARIAN SYSTEM
    // ------------------------------------------
    agrarian_base: ({ room, client, player, rank, targetX, targetZ }) => {
        if (rank("core_progression") >= 2) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "sow_seeds", targetX, targetZ });
            client.send("serverMessage", { text: "🌾 Seeds Sown.", color: "#33aa33" });
        }
    },
    harvester_branch: ({ client }) => client.send("serverMessage", { text: "🌿 Harvester abilities are primarily passive yield boosters.", color: "#55cc55" }),
    cultivator_branch: ({ room, client, player, rank, targetX, targetZ }) => {
        if (rank("branch_progression") >= 4) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "instant_fertilizer", targetX, targetZ });
            client.send("serverMessage", { text: "🚜 Crops instantly matured!", color: "#aaff00" });
        }
    },
    ranger_branch: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const ranRank = rank("branch_progression");
        if (ranRank >= 5) {
            room.activeHazards.push({
                type: "treant_minion", id: `treant_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 30.0, rank: ranRank, customData: { tickTimer: 1.0 }
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "summon_treant", targetX, targetZ });
        } else if (ranRank >= 1) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "spore_pod", targetX, targetZ });
            for (const e of room.enemyGrid.getNearby(targetX, targetZ, 4.0)) {
                if (distSq(e.x, e.y, targetX, targetZ) <= 16.0) applyAffliction(e, "Poison", 6.0, 15, 1.0, 1);
            }
        }
    },

    // ------------------------------------------
    // UTILITY: FORGEMASTER SYSTEM
    // ------------------------------------------
    forgemaster_base: ({ room, client, player, rank }) => {
        const coreRank = rank("core_progression");
        if (coreRank >= 4) {
            (player as any).temperedBuff = Date.now() + 10000;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "tempering", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "⚒️ Weapon Tempered! Damage boosted for 10s.", color: "#888888" });
        } else if (coreRank >= 2) {
            client.send("serverMessage", { text: "⚒️ Field Repair Initiated.", color: "#888888" });
        }
    },
    armorer_branch: ({ room, client, player, rank }) => {
        if (rank("branch_progression") >= 5) {
            (player as any).invulnerableUntil = Date.now() + 5000;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "invulnerable_plating", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "🛡️ Armor is impenetrable for 5s!", color: "#aaaacc" });
        }
    },
    weaponsmith_branch: ({ room, client, player, rank }) => {
        if (rank("branch_progression") >= 2) {
            (player as any).elementalCoatBuff = Date.now() + 15000;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "elemental_coat", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "⚔️ Weapon Coated in Elements for 15s!", color: "#ff6666" });
        }
    },
    scrapper_branch: ({ room, client, player, rank }) => {
        if (rank("branch_progression") >= 5) {
            (player as any).mechSuitUntil = Date.now() + 20000;
            player.hp += 500; 
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "mech_suit", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "♻️ Jury-Rigged Mech Deployed!", color: "#cc9955" });
        } else if (rank("branch_progression") >= 1) {
            client.send("serverMessage", { text: "♻️ Deconstruction mode activated.", color: "#cc9955" });
        }
    },

    // ------------------------------------------
    // UTILITY: ARTISAN SYSTEM
    // ------------------------------------------
    artisan_base: ({ client, rank }) => {
        if (rank("core_progression") >= 5) client.send("serverMessage", { text: "🧵 Pocket Dimension opened.", color: "#ff88ff" });
    },
    merchant_branch: ({ client, rank }) => {
        if (rank("branch_progression") >= 3) client.send("serverMessage", { text: "⚖️ NPC Merchant Interface opened.", color: "#ffcc00" });
    },
    shadow_weaver_branch: ({ room, client, player, rank }) => {
        if (rank("branch_progression") >= 4) {
            (player as any).stealthedUntil = Date.now() + 8000;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "shadow_cloak", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "🥷 Shadow Cloak active. Aggro dropped.", color: "#444466" });
        }
    },
    enchanter_branch: ({ client }) => client.send("serverMessage", { text: "✨ Enchanter abilities are powerful passive weaves.", color: "#ee88ff" }),

    // ------------------------------------------
    // UTILITY: PUBLICAN SYSTEM
    // ------------------------------------------
    publican_base: ({ client, rank }) => {
        if (rank("core_progression") >= 2) client.send("serverMessage", { text: "🍻 Portable Cooking Station opened.", color: "#cc7722" });
    },
    brewmaster_branch: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const bRank = rank("branch_progression");
        if (bRank >= 3) {
            room.activeHazards.push({
                type: "party_keg", id: `keg_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 30.0, rank: bRank, customData: { tickTimer: 1.0 }
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "party_keg", targetX, targetZ });
            client.send("serverMessage", { text: "🍺 Party Keg deployed! Gather round for buffs.", color: "#ddaa33" });
        } else if (bRank >= 1) {
            (player as any).attackSpeedBuff = Date.now() + 10000;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "drink_brew", targetX: player.x, targetZ: player.y });
        }
    },
    chef_branch: ({ room, client, player, rank }) => {
        const cRank = rank("branch_progression");
        if (cRank >= 1) {
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "feast_banquet", targetX: player.x, targetZ: player.y });
            for (const p of room.playerGrid.getNearby(player.x, player.y, 8.0)) {
                if (distSq(p.x, p.y, player.x, player.y) <= 64.0) {
                    p.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; p.hunger = p.maxHunger;
                }
            }
            client.send("serverMessage", { text: "🍲 Banquet served! All vitals restored.", color: "#ff8855" });
        }
    },
    information_broker_branch: ({ client, rank }) => {
        if (rank("branch_progression") >= 5) client.send("serverMessage", { text: "📜 Black Market Interface opened.", color: "#55bbff" });
        else if (rank("branch_progression") >= 2) client.send("serverMessage", { text: "📜 Pinging Boss locations to map...", color: "#55bbff" });
    },

    // ------------------------------------------
    // UTILITY: ARCHITECT SYSTEM
    // ------------------------------------------
    architect_base: ({ client }) => client.send("serverMessage", { text: "🏛️ Architect passives applied to town buildings.", color: "#aa88cc" }),
    landlord_branch: ({ room, client, player, rank, targetX, targetZ, now }) => {
        if (rank("branch_progression") >= 4) {
            room.activeHazards.push({
                type: "town_portal_node", id: `portal_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 999999, rank: 5
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "build_portal", targetX, targetZ });
            client.send("serverMessage", { text: "📜 Permanent Town Portal built.", color: "#ffd700" });
        }
    },
    fortifier_branch: ({ room, player, rank, targetX, targetZ, now }) => {
        const fRank = rank("branch_progression");
        if (fRank >= 4) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "artillery_strike", targetX, targetZ });
            
            if (room.scheduledEvents) {
                room.scheduledEvents.push({
                    executeAt: now + 1000,
                    fn: () => {
                        const batchEvents: any[] = [];
                        for (const e of room.enemyGrid.getNearby(targetX, targetZ, 12.0)) {
                            if (distSq(e.x, e.y, targetX, targetZ) <= 144.0) { // 12^2
                                e.hp -= 300;
                                batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 300, isCrit: true });
                                if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                            }
                        }
                        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 60, "combat_batch", batchEvents);
                    }
                });
            }
        } else if (fRank >= 1) {
            room.activeHazards.push({
                type: "defense_tower", id: `tower_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 300.0, rank: fRank, customData: { tickTimer: 1.0 }
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "build_tower", targetX, targetZ });
        }
    },
    industrialist_branch: ({ client, rank }) => {
        if (rank("branch_progression") >= 1) client.send("serverMessage", { text: "⚙️ Select industrial blueprint to build.", color: "#aaaaaa" });
    },

    // ------------------------------------------
    // UTILITY: ALCHEMIST SYSTEM
    // ------------------------------------------
    alchemist_base: ({ room, client, player, rank }) => {
        const coreRank = rank("core_progression");
        if (coreRank >= 4) {
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "equivalent_exchange", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "🧪 Matter transmuted.", color: "#33ffaa" });
        } else if (coreRank >= 1) {
            if (player.mp >= 20) {
                player.mp -= 20;
                client.send("serverMessage", { text: "🧪 Forager's Flask crafted (+1 Potion).", color: "#33ffaa" });
            }
        }
    },
    apothecary_branch: ({ room, player, rank, targetX, targetZ, now }) => {
        const aRank = rank("branch_progression");
        if (aRank >= 5) {
            player.hp = player.maxHp; player.mp = player.maxMp; player.stamina = player.maxStamina;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "panacea_drink", targetX: player.x, targetZ: player.y });
        } else if (aRank >= 4) {
            room.activeHazards.push({
                type: "regen_mist", id: `mist_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 10.0, rank: aRank, customData: { tickTimer: 1.0 }
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "throw_regen_mist", targetX, targetZ });
        }
    },
    mutator_branch: ({ room, client, player, rank }) => {
        const mRank = rank("branch_progression");
        if (mRank >= 1) {
            (player as any).stoneSkinBuff = Date.now() + 15000;
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "mutate_stone", targetX: player.x, targetZ: player.y });
            client.send("serverMessage", { text: "🧬 Stone Skin Mutagen injected! Massive defense up.", color: "#aa33ff" });
        }
    },
    grenadier_branch: ({ room, player, rank, targetX, targetZ, now }) => {
        const gRank = rank("branch_progression");
        if (gRank >= 5) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "nuke_explosion", targetX, targetZ });
            if (room.scheduledEvents) {
                room.scheduledEvents.push({
                    executeAt: now + 500,
                    fn: () => {
                        const batchEvents: any[] = [];
                        for (const e of room.enemyGrid.getNearby(targetX, targetZ, 15.0)) {
                            if (distSq(e.x, e.y, targetX, targetZ) <= 225.0) { // 15^2
                                e.hp -= 400;
                                batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 400, isCrit: true });
                                if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                            }
                        }
                        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 60, "combat_batch", batchEvents);
                    }
                });
            }
        } else if (gRank >= 1) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "explosive_flask", targetX, targetZ });
            const batchEvents: any[] = [];
            for (const e of room.enemyGrid.getNearby(targetX, targetZ, 4.0)) {
                if (distSq(e.x, e.y, targetX, targetZ) <= 16.0) {
                    e.hp -= 80;
                    applyAffliction(e, "Bleed", 4.0, 10, 1.0, 1);
                    batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 80, isCrit: false });
                    if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                }
            }
            if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 60, "combat_batch", batchEvents);
        }
    },

    // ------------------------------------------
    // SHADOW ESSENCE
    // ------------------------------------------
    reaper_step: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const cloneRank = rank("blood_clone");
        const startX = player.x; const startZ = player.y; 
        
        const dx = targetX - startX; const dy = targetZ - startZ;
        const dSq = dx*dx + dy*dy;
        const maxTeleportSq = 144.0; // 12^2

        let finalX = targetX; let finalZ = targetZ;

        if (dSq > maxTeleportSq) {
            const dist = Math.sqrt(dSq);
            finalX = startX + (dx / dist) * 12.0;
            finalZ = startZ + (dy / dist) * 12.0;
        }
        
        player.x = finalX; player.y = finalZ; 
        room.playerGrid.update(player, startX, startZ, player.x, player.y);
        client.send("forcePosition", { x: finalX, z: finalZ });

        room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "reaper_step", targetX: finalX, targetZ: finalZ });

        if (cloneRank >= 1) {
            room.activeHazards.push({
                type: "blood_decoy", id: `decoy_${now}`, ownerId: player.sessionId,
                x: startX, y: startZ, timer: 2.0, rank: cloneRank
            });
            room.broadcastNearby(startX, startZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "blood_decoy_spawn", targetX: startX, targetZ: startZ });
        }

        if (cloneRank >= 3) {
            const batchEvents: any[] = [];
            for (const enemy of room.enemyGrid.getNearby(startX, startZ, 25.0)) {
                // Approximate line segment distance check
                const dot = ((enemy.x - startX) * dx + (enemy.y - startZ) * dy) / dSq;
                const closestX = startX + dot * dx;
                const closestZ = startZ + dot * dy;
                
                if (dot >= 0 && dot <= 1 && distSq(enemy.x, enemy.y, closestX, closestZ) <= 9.0) { 
                    applyAffliction(enemy, "Necrosis", 5.0, 15, 1.0, 5); 
                    enemy.hp -= 15;
                    batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 15, isCrit: true, isDoT: true }); 
                    
                    if (enemy.hp <= 0) {
                        room.awardPlayerKill(player); room.removeEnemy(enemy.id);
                    }
                }
            }
            if (batchEvents.length > 0) room.broadcastNearby(startX, startZ, 60, "combat_batch", batchEvents);
        }
    },

    shadow_step: ({ room, client, message, player, rank, targetX, targetZ, now }) => {
        const wayRank = rank("way_of_the_night");
        const oldX = player.x; const oldZ = player.y;

        if (message.subType === "dash" || wayRank < 2) {
            const maxDist = wayRank >= 1 ? 10.0 : 6.0;
            
            const dx = targetX - oldX; const dz = targetZ - oldZ;
            const len = Math.sqrt(dx * dx + dz * dz) || 1;
            const nX = dx / len; const nZ = dz / len;
            
            let finalX = oldX; let finalZ = oldZ;
            
            for(let i = 1; i <= maxDist; i++) {
                let testX = oldX + nX * i;
                let testZ = oldZ + nZ * i;
                if (checkTownCollision(testX, testZ) || checkDynamicCollision(room.state, testX, testZ)) {
                    break;
                }
                finalX = testX; finalZ = testZ;
            }

            player.x = finalX; player.y = finalZ;
            room.playerGrid.update(player, oldX, oldZ, player.x, player.y);
            client.send("forcePosition", { x: finalX, z: finalZ });
            
            room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "shadow_step_dash", targetX: finalX, targetZ: finalZ });
        }
        else if (message.subType === "place_anchor" && wayRank >= 2) {
            room.activeHazards = (room.activeHazards as any[]).filter((h: any) => !(h.type === "shadow_anchor" && h.ownerId === client.sessionId));
            room.activeHazards.push({
                type: "shadow_anchor", id: `anchor_${now}`, ownerId: client.sessionId,
                x: targetX, y: targetZ, timer: 300, rank: wayRank
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "shadow_anchor_spawn", targetX, targetZ });
        } 
        else if (message.subType === "blink" && wayRank >= 2) {
            let anchorId: string | null = null;
            for (const h of (room.activeHazards as any[])) {
                if (h.type === "shadow_anchor" && h.ownerId === client.sessionId && distSq(targetX, targetZ, h.x, h.y) < 9.0) {
                    anchorId = h.id; break;
                }
            }

            if (anchorId) {
                player.x = targetX; player.y = targetZ;
                room.playerGrid.update(player, oldX, oldZ, player.x, player.y);
                client.send("forcePosition", { x: targetX, z: targetZ });
                room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "shadow_step", targetX, targetZ });
            } else {
                if (distSq(player.x, player.y, targetX, targetZ) <= 625.0) { // 25^2
                    if (room.isLocationInShadow(targetX, targetZ, client.sessionId)) {
                        player.x = targetX; player.y = targetZ;
                        room.playerGrid.update(player, oldX, oldZ, player.x, player.y);
                        client.send("forcePosition", { x: targetX, z: targetZ });
                        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "shadow_step", targetX, targetZ });
                    } else {
                        client.send("serverMessage", { text: "❌ You can only teleport into shadows!", color: "#ff5555" });
                    }
                } else {
                    client.send("serverMessage", { text: "❌ Out of Blink Range!", color: "#ff5555" });
                }
            }
        }
    },

    town_recall: ({ room, client, targetX, targetZ, now }) => {
        room.activeHazards.push({
            type: "town_portal", id: `portal_${now}`, ownerId: client.sessionId,
            x: targetX, y: targetZ, timer: 15.0, rank: 3
        });
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "town_portal_spawn", targetX, targetZ });
    },

    blood_harvest: ({ room, player, rank, targetX, targetZ }) => {
        const feastRank = rank("sanguine_feast");
        const batchEvents: any[] = [];
        
        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 2.5)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= 6.25) { // 2.5^2
                let dmg = 45;

                if (feastRank >= 3 && enemy.afflictions.has("Bleed")) {
                    const stacks = (enemy as any)["Bleed_stacks"] || 1;
                    dmg += (40 * stacks); 
                    enemy.afflictions.delete("Bleed"); 
                    (enemy as any)["Bleed_stacks"] = 0;
                }

                enemy.hp -= dmg;
                applyAffliction(enemy, "Bleed", 4.0, 10, 1.0, 1, 3);
                
                if (feastRank >= 1) player.hp = Math.min(player.maxHp, player.hp + (dmg * 0.5));
                if (feastRank >= 2) (enemy as any).sanguineFeastSpread = true; 
                
                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: dmg, isCrit: feastRank >= 3 });
                
                if (enemy.hp <= 0) { 
                    room.awardPlayerKill(player);
                    if (feastRank >= 2) {
                        let spreadCount = 0;
                        for (const n of room.enemyGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                            if (n.id !== enemy.id) {
                                if (spreadCount >= 2) break;
                                applyAffliction(n, "Bleed", 4.0, 10, 1.0, 1, 3);
                                spreadCount++;
                            }
                        }
                    }
                    room.removeEnemy(enemy.id); 
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);
    },

    umbral_snare: ({ room, player, rank, targetX, targetZ, now }) => {
        const abyssRank = rank("abyssal_binding");
        room.activeHazards.push({
            type: "umbral_snare", id: `snare_${now}`, ownerId: player.sessionId,
            x: targetX, y: targetZ, timer: 60.0, rank: abyssRank
        });
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: player.sessionId, abilityId: "umbral_snare_spawn", targetX, targetZ });
    },

    veil_of_shadows: ({ room, player, rank }) => {
        const assassinRank = rank("phantom_assassin");
        (player as any).stealthedUntil = Date.now() + 5000;
        
        let baseSpd = 12.0;
        [player.equippedItem, player.equipHead, player.equipChest, player.equipLegs, player.equipFeet, player.equipOffHand].forEach(n => {
            if (n && ITEM_DB[n]?.stats?.spd) baseSpd += ITEM_DB[n].stats.spd;
        });
        if ((player as any).attackSpeedBuff && Date.now() < (player as any).attackSpeedBuff) baseSpd += 2.0;
        player.movementSpeed = baseSpd + 6.0;

        room.activeHazards = (room.activeHazards as any[]).filter((h: any) => !(h.type === "veil_of_shadows" && h.ownerId === player.sessionId));
        room.activeHazards.push({
            type: "veil_of_shadows", id: `veil_${player.sessionId}`, ownerId: player.sessionId,
            x: player.x, y: player.y, timer: 5.0, rank: assassinRank
        });

        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "veil_of_shadows_cast", targetX: player.x, targetZ: player.y });
    },

    feast_of_absolution: ({ room, player, rank, now }) => {
        const doomRank = rank("creeping_doom");
        const sweepRadiusSq = 25.0; // 5^2
        const batchEvents: any[] = [];

        for (const enemy of room.enemyGrid.getNearby(player.x, player.y, 8.0)) {
            if (distSq(enemy.x, enemy.y, player.x, player.y) <= sweepRadiusSq) {
                enemy.hp -= 30;
                
                if (doomRank >= 1) {
                    applyAffliction(enemy, "Necrosis", 4.0, 10, 1.0, 1);
                    applyAffliction(enemy, "Slow", 4.0, 0, 0); 
                }

                if (doomRank >= 3) {
                    (enemy as any).bloodExplosionOnDeath = true;
                }
                
                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 30, isCrit: false });
                
                if (enemy.hp <= 0) {
                    room.awardPlayerKill(player);
                    if (doomRank >= 3) {
                        for (const p of room.playerGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                            if (distSq(p.x, p.y, enemy.x, enemy.y) <= 64.0) {
                                p.hp = Math.min(p.maxHp, p.hp + 50);
                            }
                        }
                    }
                    room.removeEnemy(enemy.id);
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 50, "combat_batch", batchEvents);

        if (doomRank >= 2) {
            room.activeHazards.push({
                type: "leech_swarm", id: `swarm_${now}`, ownerId: player.sessionId,
                x: player.x, y: player.y, timer: 4.0, rank: doomRank
            });
        }
    },

    void_eruption: ({ room, player, rank, targetX, targetZ, now }) => {
        const cataRank = rank("abyssal_cataclysm");
        const hitRadius = 6.0; 
        const hitRadSq = hitRadius * hitRadius;

        if (cataRank >= 2) {
            const pullRadSq = (hitRadius + 3.0) ** 2;
            for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, hitRadius + 3.0)) {
                if (distSq(enemy.x, enemy.y, targetX, targetZ) <= pullRadSq) {
                    enemy.x = targetX; enemy.y = targetZ; enemy.stunnedTimer = 0.5;
                }
            }
        }

        const batchEvents: any[] = [];
        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, hitRadius)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= hitRadSq) {
                enemy.hp -= 60;
                if (cataRank >= 1) applyAffliction(enemy, "Necrosis", 5.0, 15, 1.0, 1);
                
                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 60, isCrit: true });
                if (enemy.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(enemy.id); }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);

        if (cataRank >= 3) {
            room.activeHazards.push({
                type: "dark_singularity", id: `singul_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 3.0, rank: cataRank
            });
        }
    },

    avatar_of_doom: ({ room, player, rank, targetX, targetZ, now }) => {
        const abyssRank = rank("gaze_of_the_abyss");
        const batchEvents: any[] = [];
        
        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 6.0)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= 36.0) { // 6^2
                let dmg = 100;
                
                if (abyssRank >= 1) {
                    let totalStacks = 0;
                    if (enemy.afflictions.has("Bleed")) totalStacks += ((enemy as any)["Bleed_stacks"] || 1);
                    if (enemy.afflictions.has("Necrosis")) totalStacks += ((enemy as any)["Necrosis_stacks"] || 1);
                    dmg += (dmg * (0.15 * totalStacks)); 
                }
                
                enemy.hp -= dmg;
                if (abyssRank >= 2) applyAffliction(enemy, "Silence", 3.0, 0, 0);
                
                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: Math.floor(dmg), isCrit: true });
                if (enemy.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(enemy.id); }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);

        if (abyssRank >= 3) {
            room.activeHazards.push({
                type: "doom_familiar", id: `gordon_${now}`, ownerId: player.sessionId,
                x: player.x, y: player.y, timer: 10.0, rank: abyssRank, customData: { lastShot: 0 } 
            });
        }
    },

    nightfall: ({ room, player, rank, now }) => {
        const eclipseRank = rank("blade_of_the_eclipse");
        const hitRadiusSq = 64.0; // 8.0^2
        let totalDamageDealt = 0;
        const batchEvents: any[] = [];

        (player as any).invulnerableUntil = now + 1500;
        (player as any).nightfallStealth = now + 8000;

        for (const enemy of room.enemyGrid.getNearby(player.x, player.y, 8.0)) {
            if (distSq(enemy.x, enemy.y, player.x, player.y) <= hitRadiusSq) {
                let dmg = 150; 

                if (eclipseRank >= 3 && enemy.hp < (enemy.maxHp * 0.3)) {
                    dmg = 9999; 
                }

                enemy.hp -= dmg;
                totalDamageDealt += dmg;

                if (eclipseRank >= 2) {
                    enemy.stunnedTimer = Math.max(enemy.stunnedTimer, 3.0);
                }

                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: dmg >= 9999 ? 9999 : dmg, isCrit: true });

                if (enemy.hp <= 0) {
                    room.awardPlayerKill(player);
                    room.removeEnemy(enemy.id);
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 50, "combat_batch", batchEvents);

        if (eclipseRank >= 1 && totalDamageDealt > 0) {
            player.hp = Math.min(player.maxHp, player.hp + (totalDamageDealt * 0.2));
        }
    },

    // ------------------------------------------
    // LIGHT ESSENCE
    // ------------------------------------------
    radiant_dash: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const trailRank = rank("blinding_trail");
        const dx = targetX - player.x; const dy = targetZ - player.y;
        const dSq = dx * dx + dy * dy;
        const maxLeapSq = 144.0; // 12^2

        const startX = player.x; const startZ = player.y;
        let finalX = startX; let finalZ = startZ;

        if (dSq > maxLeapSq) {
            const dirLen = Math.sqrt(dSq);
            finalX = startX + (dx / dirLen) * 12.0;
            finalZ = startZ + (dy / dirLen) * 12.0;
        } else {
            finalX = targetX; finalZ = targetZ;
        }

        if (trailRank < 3) {
            const dirLen = Math.sqrt(dSq) || 1;
            const leapLen = Math.min(dirLen, 12.0);
            for(let i = 1; i <= leapLen; i++) {
                let testX = startX + (dx / dirLen) * i;
                let testZ = startZ + (dy / dirLen) * i;
                if (checkTownCollision(testX, testZ) || checkDynamicCollision(room.state, testX, testZ)) break;
                finalX = testX; finalZ = testZ;
            }
        }

        if (trailRank >= 1) {
            const stepCount = 5;
            for (let i = 1; i <= stepCount; i++) {
                const px = startX + (finalX - startX) * (i / stepCount);
                const pz = startZ + (finalZ - startZ) * (i / stepCount);
                
                room.activeHazards.push({
                    type: "radiant_trail", id: `trail_${now}_${i}`, ownerId: player.sessionId,
                    x: px, y: pz, timer: 3.0, rank: trailRank, customData: { tickTimer: 0.5 }
                });
                room.broadcastNearby(px, pz, 60, "abilityUsed", { id: client.sessionId, abilityId: "blinding_trail_spawn", targetX: px, targetZ: pz });
            }
        }

        if (trailRank >= 3) {
            const leapLen = Math.sqrt((finalX-startX)**2 + (finalZ-startZ)**2) || 1;
            for (const p of room.playerGrid.getNearby(startX, startZ, leapLen)) {
                const distSqCalc = distToSegmentSquared(p.x, p.y, startX, startZ, finalX, finalZ);
                if (distSqCalc <= 9.0 && p.sessionId !== player.sessionId) {
                    p.hp = Math.min(p.maxHp, p.hp + 100);
                }
            }
        }

        player.x = finalX; player.y = finalZ;
        room.playerGrid.update(player, startX, startZ, player.x, player.y);
        
        const vfxId = trailRank >= 3 ? "radiant_dash_silver" : "radiant_dash";
        room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: vfxId, targetX: finalX, targetZ: finalZ });
        client.send("forcePosition", { x: finalX, z: finalZ });
    },

    wings_of_dawn: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const flareRank = rank("solar_flare");
        const dx = targetX - player.x; const dy = targetZ - player.y;
        const dSq = dx * dx + dy * dy;
        const maxLeapSq = 144.0; // 12^2

        const startX = player.x; const startZ = player.y;
        let finalX = targetX; let finalZ = targetZ;

        if (dSq > maxLeapSq) {
            const dirLen = Math.sqrt(dSq);
            finalX = startX + (dx / dirLen) * 12.0;
            finalZ = startZ + (dy / dirLen) * 12.0;
        }
        
        if (flareRank >= 1) {
            const batchEvents: any[] = [];
            for (const e of room.enemyGrid.getNearby(startX, startZ, 4.0)) {
                if (distSq(e.x, e.y, startX, startZ) <= 16.0) { // 4^2
                    e.hp -= 20;
                    batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 20, isCrit: false });
                    if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                }
            }
            if (batchEvents.length > 0) room.broadcastNearby(startX, startZ, 50, "combat_batch", batchEvents);
        }

        if (flareRank >= 2) (player as any).ccImmuneUntil = now + 800; 
        (player as any).invulnerableUntil = now + 600;
        
        player.x = finalX; player.y = finalZ;
        room.playerGrid.update(player, startX, startZ, player.x, player.y);
        
        const vfxId = flareRank >= 3 ? "wings_of_dawn_silver" : "wings_of_dawn";
        room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: vfxId, targetX: finalX, targetZ: finalZ });
        client.send("forcePosition", { x: finalX, z: finalZ });
        
        if (room.scheduledEvents) {
            room.scheduledEvents.push({
                executeAt: now + 600,
                fn: () => {
                    if (flareRank >= 3) {
                        const landBatch: any[] = [];
                        for (const e of room.enemyGrid.getNearby(finalX, finalZ, 6.0)) {
                            if (distSq(e.x, e.y, finalX, finalZ) <= 36.0) {
                                e.hp -= 40; 
                                e.stunnedTimer = Math.max(e.stunnedTimer, 3.0); 
                                applyAffliction(e, "Illuminated", 5.0, 0, 0); 
                                landBatch.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 40, isCrit: true });
                                if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                            }
                        }
                        if (landBatch.length > 0) room.broadcastNearby(finalX, finalZ, 50, "combat_batch", landBatch);
                    } else if (flareRank >= 1) {
                        const landBatch: any[] = [];
                        for (const e of room.enemyGrid.getNearby(finalX, finalZ, 4.0)) {
                            if (distSq(e.x, e.y, finalX, finalZ) <= 16.0) {
                                e.hp -= 20;
                                landBatch.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 20, isCrit: false });
                                if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                            }
                        }
                        if (landBatch.length > 0) room.broadcastNearby(finalX, finalZ, 50, "combat_batch", landBatch);
                    }
                }
            });
        }
    },

    divine_smite: ({ room, client, player, rank, targetX, targetZ }) => {
        const chainRank = rank("chain_lightning");
        const vfxId = chainRank >= 3 ? "divine_smite_silver" : "divine_smite";
        
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: vfxId, targetX, targetZ });

        let targetsHit = 0;
        const batchEvents: any[] = [];

        const hitEnemy = (enemy: any) => {
            if (enemy.hp <= 0) return;
            let dmg = 80;
            if (chainRank >= 2 && enemy.hp <= (enemy.maxHp * 0.10)) dmg = 9999;
            enemy.hp -= dmg;
            if (chainRank >= 3 && dmg < 9999) applyAffliction(enemy, "Static Charge", 6.0, 0, 0);

            batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: dmg >= 9999 ? 9999 : dmg, isCrit: dmg >= 9999 });
            if (enemy.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(enemy.id); }
            targetsHit++;
        };

        let primaryTarget: any | null = null;
        let minDistSq = 25.0; // 5.0^2
        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 5.0)) {
            const dSq = distSq(enemy.x, enemy.y, targetX, targetZ);
            if (dSq < minDistSq) {
                minDistSq = dSq;
                primaryTarget = enemy;
            }
        }

        if (primaryTarget) {
            hitEnemy(primaryTarget);

            if (chainRank >= 1) {
                let nextTargets: any[] = [];
                for (const e of room.enemyGrid.getNearby(primaryTarget.x, primaryTarget.y, 8.0)) {
                    if (e.id !== primaryTarget.id && e.hp > 0 && distSq(e.x, e.y, primaryTarget.x, primaryTarget.y) <= 64.0) {
                        nextTargets.push(e);
                        if (nextTargets.length >= 3) break;
                    }
                }
                for (const nextTarget of nextTargets) {
                    room.broadcastNearby(nextTarget.x, nextTarget.y, 60, "abilityUsed", { id: primaryTarget.id, abilityId: vfxId, targetX: nextTarget.x, targetZ: nextTarget.y });
                    hitEnemy(nextTarget);
                }
            }
            if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);
        }
    },

    blinding_flare: ({ room, client, player, rank, targetX, targetZ }) => {
        const flareRank = rank("searing_light");
        const hitRadiusSq = 36.0; // 6.0^2
        const batchEvents: any[] = [];

        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "blinding_flare", targetX, targetZ });

        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 6.0)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= hitRadiusSq) {
                enemy.hp -= 40;
                enemy.stunnedTimer = Math.max(enemy.stunnedTimer, 3.0);
                
                if (flareRank >= 1) enemy.attackCooldown = Math.max(enemy.attackCooldown, 1.0); 
                if (flareRank >= 2) applyAffliction(enemy, "Weakened", 8.0, 0, 0); 
                if (flareRank >= 3) applyAffliction(enemy, "Shattered Armor", 999.0, 0, 0);

                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 40, isCrit: false });
                if (enemy.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(enemy.id); }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);
    },

    aura_of_purity: ({ room, player, rank, now }) => {
        const cleanseRank = rank("cleansing_fire");
        room.activeHazards.push({
            type: "aura_of_purity", id: `purity_${now}`, ownerId: player.sessionId,
            x: player.x, y: player.y, timer: 10.0, rank: cleanseRank, customData: { tickTimer: 3.0 } 
        });
        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "aura_of_purity_start", targetX: player.x, targetZ: player.y });
    },

    holy_nova: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const repelRank = rank("repelling_force");
        const hitRadiusSq = 36.0; // 6.0^2
        const batchEvents: any[] = [];
        
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "holy_nova", targetX, targetZ });

        for (const enemy of room.enemyGrid.getNearby(player.x, player.y, 6.0)) {
            if (distSq(enemy.x, enemy.y, player.x, player.y) <= hitRadiusSq) {
                enemy.hp -= 40;
                
                const pushDx = enemy.x - player.x; const pushDy = enemy.y - player.y;
                const pushDistSq = pushDx*pushDx + pushDy*pushDy;
                const pushDist = Math.sqrt(pushDistSq) || 1;
                
                const pushMult = repelRank >= 1 ? 10.0 : 5.0;
                const targetEX = enemy.x + (pushDx / pushDist) * pushMult;
                const targetEY = enemy.y + (pushDy / pushDist) * pushMult;

                if (repelRank >= 2 && (checkTownCollision(targetEX, targetEY) || checkDynamicCollision(room.state, targetEX, targetEY))) {
                    enemy.stunnedTimer = Math.max(enemy.stunnedTimer, 2.0);
                } else {
                    enemy.x = targetEX; enemy.y = targetEY;
                }

                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 40, isCrit: false });
                if (enemy.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(enemy.id); }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 50, "combat_batch", batchEvents);

        if (repelRank >= 3) {
            room.activeHazards.push({
                type: "holy_fire_ring", id: `ring_${now}`, ownerId: player.sessionId,
                x: player.x, y: player.y, timer: 3.0, rank: repelRank, customData: { tickTimer: 0.5 }
            });
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "holy_fire_ring_spawn", targetX: player.x, targetZ: player.y });
        }
    },

    consecrated_ground: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const hallowedRank = rank("hallowed_domain");
        room.activeHazards.push({
            type: "consecrated_ground", id: `consec_gnd_${now}`, ownerId: player.sessionId,
            x: targetX, y: targetZ, timer: 6.0, rank: hallowedRank, customData: { tickTimer: 1.0 }
        });
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "consecrated_ground", targetX, targetZ });
    },

    grand_cross: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const execRank = rank("divine_execution");
        const hitRadiusSq = 100.0; // 10.0^2

        const vfxId = execRank >= 3 ? "grand_cross_silver" : "grand_cross";
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: vfxId, targetX, targetZ });

        if (room.scheduledEvents) {
            room.scheduledEvents.push({
                executeAt: now + 500,
                fn: () => {
                    const batchEvents: any[] = [];
                    for (const e of room.enemyGrid.getNearby(targetX, targetZ, 10.0)) {
                        if (distSq(e.x, e.y, targetX, targetZ) <= hitRadiusSq) {
                            e.hp -= 200;
                            batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 200, isCrit: true });
                            
                            if (e.hp <= 0) {
                                room.awardPlayerKill(player);
                                if (execRank >= 2) {
                                    const salt = new SceneryState();
                                    salt.id = `salt_${Date.now()}_${e.id}`;
                                    salt.kind = "crystal_rock";
                                    salt.x = e.x; salt.y = e.y;
                                    salt.scale = 0.8; salt.maxHp = 100; salt.hp = 100;
                                    room.state.scenery?.set(salt.id, salt);
                                    room.sceneryGrid.add(salt, salt.x, salt.y);
                                    
                                    room.scheduledEvents!.push({
                                        executeAt: Date.now() + 10000,
                                        fn: () => {
                                            room.state.scenery?.delete(salt.id);
                                            room.sceneryGrid.remove(salt, salt.x, salt.y);
                                        }
                                    }); 
                                }
                                room.removeEnemy(e.id);
                            }
                        }
                    }
                    if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 60, "combat_batch", batchEvents);

                    if (execRank >= 1) {
                        for (const p of room.playerGrid.getNearby(targetX, targetZ, 10.0)) {
                            if (distSq(p.x, p.y, targetX, targetZ) <= hitRadiusSq) {
                                p.hp = Math.min(p.maxHp, p.hp + 200);
                            }
                        }
                    }

                    if (execRank >= 3) {
                        room.activeHazards.push({
                            type: "grand_cross_turret", id: `gct_${Date.now()}`, ownerId: player.sessionId,
                            x: targetX, y: targetZ, timer: 8.0, rank: execRank, customData: { tickTimer: 1.0 }
                        });
                    }
                }
            });
        }
    },

    heavenly_judgment: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const orbRank = rank("orbital_strike");

        if (orbRank >= 3) {
            const targets: any[] = [];
            for (const e of room.enemyGrid.getNearby(targetX, targetZ, 25.0)) {
                if (e.hp > 0 && distSq(e.x, e.y, targetX, targetZ) <= 625.0) {
                    targets.push(e);
                    if (targets.length >= 4) break;
                }
            }
            
            for(let i=0; i<4; i++) {
                const tEnemy = targets[i % Math.max(1, targets.length)]; 
                
                const startX = targetX + (Math.random() - 0.5) * 8;
                const startZ = targetZ + (Math.random() - 0.5) * 8;
                
                room.activeHazards.push({
                    type: "orbital_strike_mini", id: `orb_min_${now}_${i}`, ownerId: player.sessionId,
                    x: startX, y: startZ, timer: 10.0, rank: orbRank,
                    customData: { tickTimer: 0.5, radius: 2.5, damage: 30, targetId: tEnemy?.id }
                });
                room.broadcastNearby(startX, startZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "orbital_strike_mini", targetX: startX, targetZ: startZ });
            }
        } else {
            room.activeHazards.push({
                type: "heavenly_judgment", id: `judg_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 10.0, rank: orbRank,
                customData: { tickTimer: 1.0, radius: 6.0, damage: 100, hits: 0 }
            });
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "heavenly_judgment", targetX, targetZ });
        }
    },

    // ------------------------------------------
    // BERSERKER ESSENCE
    // ------------------------------------------
    sunder: ({ room, player, rank, targetX, targetZ }) => {
        const woundsRank = rank("deep_wounds");
        const hitRadius = 3.5;
        const hitRadSq = hitRadius * hitRadius;
        const angleOfAttack = Math.atan2(targetZ - player.y, targetX - player.x);
        const batchEvents: any[] = [];

        for (const e of room.enemyGrid.getNearby(player.x, player.y, hitRadius)) {
            const dx = e.x - player.x; const dy = e.y - player.y;
            if (dx*dx + dy*dy <= hitRadSq) {
                let angleToEnemy = Math.atan2(dy, dx);
                let angleDiff = angleToEnemy - angleOfAttack;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                
                if (Math.abs(angleDiff) < Math.PI / 2.5) {
                    let dmg = 60; 
                    
                    if (woundsRank >= 3 && e.afflictions.has("Bleed") && (e as any)["Bleed_stacks"] >= 3) {
                        dmg += e.maxHp * 0.15; 
                        e.afflictions.delete("Bleed");
                        (e as any)["Bleed_stacks"] = 0;
                    } else if (woundsRank >= 1) {
                        applyAffliction(e, "Bleed", 5.0, 15, 1.0, 1, 3);
                    }

                    if (woundsRank >= 2 && e.afflictions.has("Bleed")) {
                        player.hp = Math.min(player.maxHp, player.hp + 20); 
                    }

                    e.hp -= dmg;
                    batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: Math.floor(dmg), isCrit: woundsRank >= 3 && dmg > 60 });
                    
                    if (e.hp <= 0) {
                        room.awardPlayerKill(player);
                        room.removeEnemy(e.id);
                    }
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 50, "combat_batch", batchEvents);
    },

    intimidating_shout: ({ room, player, rank, targetX, targetZ }) => {
        const roarRank = rank("shattering_roar");
        const hitRadius = 15.0; 
        const hitRadSq = hitRadius * hitRadius;
        const angleOfAttack = Math.atan2(targetZ - player.y, targetX - player.x);
        const batchEvents: any[] = [];

        for (const e of room.enemyGrid.getNearby(player.x, player.y, hitRadius)) {
            const dx = e.x - player.x; const dy = e.y - player.y;
            if (dx*dx + dy*dy <= hitRadSq) {
                let angleToEnemy = Math.atan2(dy, dx);
                let angleDiff = angleToEnemy - angleOfAttack;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                
                if (Math.abs(angleDiff) < Math.PI / 1.5) { 
                    e.damage = Math.max(1, e.damage * 0.5); 
                    if (roarRank >= 1) applyAffliction(e, "Slow", 4.0, 0, 0); 
                    if (roarRank >= 3) (e as any).armorShattered = true;

                    e.stunnedTimer = 1.0; 
                    batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 0, isCrit: false }); 
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 50, "combat_batch", batchEvents);

        if (roarRank >= 2) {
            for (const p of room.playerGrid.getNearby(player.x, player.y, hitRadius)) {
                const dx = p.x - player.x; const dy = p.y - player.y;
                if (dx*dx + dy*dy <= hitRadSq) {
                    let angleToP = Math.atan2(dy, dx);
                    let angleDiff = angleToP - angleOfAttack;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    if (Math.abs(angleDiff) < Math.PI / 1.5) {
                        (p as any).attackSpeedBuff = Date.now() + 5000; 
                    }
                }
            }
            (player as any).attackSpeedBuff = Date.now() + 5000; 
        }
    },

    bull_rush: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const rushRank = rank("unstoppable_force");
        const startX = player.x; const startZ = player.y;

        const dx = targetX - startX; const dz = targetZ - startZ;
        const dirLenSq = dx * dx + dz * dz;
        const dirLen = Math.sqrt(dirLenSq) || 1;
        const nX = dx / dirLen; const nZ = dz / dirLen;

        const maxDist = 15.0; 
        let finalX = startX; let finalZ = startZ;
        let hitWall = false;

        for(let i = 2; i <= maxDist; i += 2) {
            let testX = startX + nX * i;
            let testZ = startZ + nZ * i;
            if (checkTownCollision(testX, testZ) || checkDynamicCollision(room.state, testX, testZ)) {
                hitWall = true; break;
            }
            finalX = testX; finalZ = testZ;
        }

        player.x = finalX; player.y = finalZ;
        room.playerGrid.update(player, startX, startZ, player.x, player.y);
        client.send("forcePosition", { x: finalX, z: finalZ });

        if (rushRank >= 1) (player as any).ccImmuneUntil = Date.now() + 1500;

        const hitEnemies = new Set<string>();
        const batchEvents: any[] = [];
        
        for (const e of room.enemyGrid.getNearby(startX, startZ, maxDist + 5)) {
            const distSqCalc = distToSegmentSquared(e.x, e.y, startX, startZ, finalX, finalZ);
            if (distSqCalc <= 9.0) { 
                e.hp -= 40;
                e.x += nX * 4.0; e.y += nZ * 4.0;
                e.stunnedTimer = 0.5; 
                
                batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 40, isCrit: false });
                if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                hitEnemies.add(e.id);
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(startX, startZ, 50, "combat_batch", batchEvents);

        room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "bull_rush", targetX: finalX, targetZ: finalZ });

        if (rushRank >= 2) {
            room.activeHazards.push({
                type: "bull_rush_fire", id: `fire_${now}`, ownerId: player.sessionId,
                x: startX, y: startZ, timer: 5.0, rank: rushRank, customData: { endX: finalX, endZ: finalZ, tickTimer: 0.5 }
            });
        }

        if (rushRank >= 3 && hitWall) {
            room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "bull_rush_shockwave", targetX: finalX, targetZ: finalZ });
            const shockBatch: any[] = [];
            for (const e of room.enemyGrid.getNearby(finalX, finalZ, 8.0)) {
                if (distSq(e.x, e.y, finalX, finalZ) <= 64.0 && !hitEnemies.has(e.id)) {
                    e.hp -= 60; e.stunnedTimer = 2.0; 
                    shockBatch.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 60, isCrit: true });
                    if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                }
            }
            if (shockBatch.length > 0) room.broadcastNearby(finalX, finalZ, 50, "combat_batch", shockBatch);
        }
    },

    heroic_leap: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const craterRank = rank("crater_impact");
        
        const dx = targetX - player.x; const dz = targetZ - player.y;
        const dSq = dx * dx + dz * dz;
        const maxLeapSq = 256.0; // 16^2

        let finalX = targetX; let finalZ = targetZ;

        if (dSq > maxLeapSq) {
            const dist = Math.sqrt(dSq);
            finalX = player.x + (dx / dist) * 16.0;
            finalZ = player.y + (dz / dist) * 16.0;
        }

        const oldX = player.x; const oldZ = player.y;
        player.x = finalX; player.y = finalZ;
        room.playerGrid.update(player, oldX, oldZ, player.x, player.y);
        client.send("forcePosition", { x: finalX, z: finalZ });

        room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "heroic_leap", targetX: finalX, targetZ: finalZ });

        if (craterRank >= 2) client.send("resetCooldown", { abilityId: "heroic_leap", slot: 2 });

        if (room.scheduledEvents) {
            room.scheduledEvents.push({
                executeAt: now + 400,
                fn: () => {
                    const batchEvents: any[] = [];
                    for (const e of room.enemyGrid.getNearby(finalX, finalZ, 6.0)) {
                        if (distSq(e.x, e.y, finalX, finalZ) <= 36.0) {
                            e.hp -= 90;
                            if (craterRank >= 1) (e as any).armorShattered = true;
                            if (craterRank >= 2) { e.x += (finalX - e.x) * 0.5; e.y += (finalZ - e.y) * 0.5; }
                            batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 90, isCrit: craterRank >= 1 });
                            if (e.hp <= 0) { room.awardPlayerKill(player); room.removeEnemy(e.id); }
                        }
                    }
                    if (batchEvents.length > 0) room.broadcastNearby(finalX, finalZ, 50, "combat_batch", batchEvents);

                    if (craterRank >= 3) {
                        room.activeHazards.push({
                            type: "shattered_crater", id: `crater_${Date.now()}`, ownerId: player.sessionId,
                            x: finalX, y: finalZ, timer: 30.0, rank: craterRank
                        });
                        room.broadcastNearby(finalX, finalZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "shattered_crater_spawn", targetX: finalX, targetZ: finalZ });
                    }
                }
            });
        }
    },

    whirlwind: ({ room, player, rank, now }) => {
        const pullRank = rank("cyclone_pull");
        const duration = 4.0; 

        if (pullRank >= 3) (player as any).windBarrierUntil = now + (duration * 1000);

        room.activeHazards.push({
            type: "whirlwind_aura", id: `ww_${now}`, ownerId: player.sessionId,
            x: player.x, y: player.y, timer: duration, rank: pullRank, customData: { tickTimer: 0.5 }
        });

        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "whirlwind_start", targetX: player.x, targetZ: player.y });
    },

    devastating_cleave: ({ room, client, player, rank, targetX, targetZ }) => {
        const tollRank = rank("reapers_toll");
        const hitRadius = tollRank >= 3 ? 9.0 : 4.5;
        const hitRadSq = hitRadius * hitRadius;
        let killedAnyone = false;
        const batchEvents: any[] = [];

        const vfxId = tollRank >= 3 ? "devastating_cleave_silver" : "devastating_cleave";
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: vfxId, targetX, targetZ });

        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, hitRadius)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= hitRadSq) {
                enemy.hp -= 50; 
                
                if (tollRank >= 1) applyAffliction(enemy, "Bleed", 5.0, 10, 1.0, 2);
                
                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 50, isCrit: tollRank >= 3 });
                
                if (enemy.hp <= 0) {
                    room.awardPlayerKill(player);
                    room.removeEnemy(enemy.id);
                    killedAnyone = true;
                }
            }
        }
        
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);

        if (tollRank >= 2 && killedAnyone) {
            client.send("resetCooldown", { abilityId: "devastating_cleave", slot: 4 });
        }
    },

    meteor_strike: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const extRank = rank("extinction_event");
        let radius = 6.0;
        const baseDamage = 250;

        if (extRank >= 1) radius *= 1.5;
        const rSq = radius * radius;

        const vfxId = extRank >= 3 ? "meteor_strike_magma" : "meteor_strike";
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: vfxId, targetX, targetZ });

        if (room.scheduledEvents) {
            room.scheduledEvents.push({
                executeAt: now + 800,
                fn: () => {
                    const batchEvents: any[] = [];
                    for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, radius)) {
                        const dSq = distSq(enemy.x, enemy.y, targetX, targetZ);
                        if (dSq <= rSq) {
                            let finalDamage = baseDamage;

                            if (extRank >= 2 && dSq <= (rSq / 9.0)) {
                                finalDamage *= 3;
                            }

                            enemy.hp -= finalDamage;
                            batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: finalDamage, isCrit: extRank >= 2 && dSq <= (rSq / 9.0) });

                            if (enemy.hp <= 0) {
                                room.awardPlayerKill(player);
                                room.removeEnemy(enemy.id);
                            }
                        }
                    }
                    if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 60, "combat_batch", batchEvents);

                    if (extRank >= 3) {
                        room.activeHazards.push({
                            type: "meteor_magma_pool", id: `magma_${Date.now()}`, ownerId: player.sessionId,
                            x: targetX, y: targetZ, timer: 8.0, rank: extRank,
                            customData: { tickTimer: 1.0, radius: radius }
                        });
                    }
                }
            });
        }
    },

    wrath_of_the_berserker: ({ room, player, rank, now }) => {
        const rageRank = rank("undying_rage");
        
        let baseSpd = 12.0;
        [player.equippedItem, player.equipHead, player.equipChest, player.equipLegs, player.equipFeet, player.equipOffHand].forEach(n => {
            if (n && ITEM_DB[n]?.stats?.spd) baseSpd += ITEM_DB[n].stats.spd;
        });
        player.movementSpeed = baseSpd + 8.0;
        player.attackSpeed = 1.5;

        if (rageRank >= 2) (player as any).ccImmuneUntil = now + 15000;

        room.activeHazards = (room.activeHazards as any[]).filter((h: any) => !(h.type === "wrath_aura" && h.ownerId === player.sessionId));

        room.activeHazards.push({
            type: "wrath_aura", id: `wrath_${player.sessionId}`, ownerId: player.sessionId,
            x: player.x, y: player.y, timer: 15.0, rank: rageRank
        });

        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "wrath_of_the_berserker", targetX: player.x, targetZ: player.y });
    },

    // ------------------------------------------
    // NATURE ESSENCE
    // ------------------------------------------
    spirit_animal: ({ room, player, rank, now }) => {
        const packRank = rank("pack_leader");
        
        let baseSpd = 12.0;
        [player.equippedItem, player.equipHead, player.equipChest, player.equipLegs, player.equipFeet, player.equipOffHand].forEach(n => {
            if (n && ITEM_DB[n]?.stats?.spd) baseSpd += ITEM_DB[n].stats.spd;
        });
        player.movementSpeed = baseSpd + 10.0; 

        room.activeHazards.push({
            type: "spirit_animal", id: `spirit_${now}`, ownerId: player.sessionId,
            x: player.x, y: player.y, timer: 5.0, rank: packRank, customData: { tickTimer: 0.5 }
        });

        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "spirit_animal", targetX: player.x, targetZ: player.y });
    },

    earth_spike: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const jaggedRank = rank("jagged_stone");
        const hitRadiusSq = 6.25; // 2.5^2
        let hitAnyone = false;
        const batchEvents: any[] = [];

        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 2.5)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= hitRadiusSq) {
                enemy.hp -= 60;
                enemy.rootedTimer = Math.max(enemy.rootedTimer, 3.0);
                hitAnyone = true;
                
                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 60, isCrit: true });
                if (enemy.hp <= 0) { 
                    room.awardPlayerKill(player); 
                    room.removeEnemy(enemy.id); 
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);

        if (jaggedRank >= 2 && hitAnyone) {
            (player as any).tempShield = ((player as any).tempShield || 0) + 50;
        }

        if (jaggedRank >= 3) {
            let extraHits = 0;
            const extraBatch: any[] = [];
            for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 8.0)) {
                if (extraHits >= 3) break;
                const dSq = distSq(enemy.x, enemy.y, targetX, targetZ);
                if (dSq > hitRadiusSq && dSq <= 64.0) {
                    enemy.hp -= 40;
                    extraBatch.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 40, isCrit: false });
                    if (enemy.hp <= 0) { 
                        room.awardPlayerKill(player); 
                        room.removeEnemy(enemy.id); 
                    }
                    extraHits++;
                }
            }
            if (extraBatch.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", extraBatch);
        }

        if (jaggedRank >= 1) {
            room.activeHazards.push({
                type: "jagged_stone", id: `jagged_${now}`, ownerId: player.sessionId,
                x: targetX, y: targetZ, timer: 10.0, rank: jaggedRank, customData: { tickTimer: 1.0, radius: 4.0 }
            });
        }
        
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "earth_spike", targetX, targetZ });
    },

    healing_blossom: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const bountyRank = rank("natures_bounty");
        
        if (bountyRank >= 1) {
            for (const p of room.playerGrid.getNearby(targetX, targetZ, 5.0)) {
                if (distSq(p.x, p.y, targetX, targetZ) <= 25.0) p.isSleeping = false; 
            }
        }

        room.activeHazards.push({
            type: "healing_blossom", id: `blossom_${now}`, ownerId: player.sessionId,
            x: targetX, y: targetZ, timer: 6.0, rank: bountyRank, customData: { tickTimer: 1.0, radius: 5.0 }
        });
        
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "healing_blossom", targetX, targetZ });
    },

    wrath_of_the_forest: ({ room, client, player, rank, targetX, targetZ, now }) => {
        const treeRank = rank("world_tree");
        const hitRadiusSq = 100.0; // 10.0^2

        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, 10.0)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= hitRadiusSq) {
                enemy.rootedTimer = Math.max(enemy.rootedTimer, 4.0);
            }
        }
        
        if (treeRank >= 2) {
            for (const p of room.playerGrid.getNearby(targetX, targetZ, 10.0)) {
                if (distSq(p.x, p.y, targetX, targetZ) <= hitRadiusSq) {
                    p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * 0.2));
                }
            }
        }

        room.activeHazards.push({
            type: "wrath_of_the_forest", id: `wrath_forest_${now}`, ownerId: player.sessionId,
            x: targetX, y: targetZ, timer: 10.0, rank: treeRank, customData: { tickTimer: 1.0, radius: 10.0 }
        });
        
        room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "wrath_of_the_forest", targetX, targetZ });
    }
};

// ==========================================
// MAIN EXPORT CONTROLLER
// ==========================================

export function handleAbility(room: BaseRoom<any> & { scheduledEvents?: any[] }, client: Client, message: any) { 
    const player = room.state.players.get(client.sessionId);
    if (!player || player.isSleeping) return;

    const now = Date.now();

    // ------------------------------------------
    // STEALTH BREAK ON ABILITY CAST
    // ------------------------------------------
    if (message.abilityId !== "umbral_dash") {
        let stealthRank = 0;
        let brokeStealth = false;
        if ((player as any).stealthedUntil && now < (player as any).stealthedUntil) {
            brokeStealth = true;
            (player as any).stealthedUntil = 0;
            
            let baseSpd = 12.0;
            [player.equippedItem, player.equipHead, player.equipChest, player.equipLegs, player.equipFeet, player.equipOffHand].forEach(n => {
                if (n && ITEM_DB[n]?.stats?.spd) baseSpd += ITEM_DB[n].stats.spd;
            });
            
            player.movementSpeed = baseSpd;

            const hIdx = (room.activeHazards as any[]).findIndex((h: any) => h.type === "veil_of_shadows" && h.ownerId === player.sessionId);
            if (hIdx !== -1) {
                stealthRank = room.activeHazards[hIdx].rank;
                room.activeHazards.splice(hIdx, 1);
            }

            const breakVisual = stealthRank >= 3 ? "veil_of_shadows_burst" : "veil_of_shadows_break";
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: breakVisual, targetX: player.x, targetZ: player.y });

            if (stealthRank >= 3) {
                const batchEvents: any[] = [];
                for (const e of room.enemyGrid.getNearby(player.x, player.y, 6.0)) {
                    if (distSq(e.x, e.y, player.x, player.y) <= 36.0) {
                        e.hp -= 80;
                        applyAffliction(e, "Silence", 3.0, 0, 0);
                        batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 80, isCrit: true });
                        if (e.hp <= 0) {
                            room.awardPlayerKill(player);
                            room.removeEnemy(e.id);
                        }
                    }
                }
                if (batchEvents.length > 0) room.broadcastNearby(player.x, player.y, 60, "combat_batch", batchEvents);
            }
        }
    }

    const abilityId = message.abilityId;
    const targetX = message.targetX;
    const targetZ = message.targetZ; 

    // ------------------------------------------
    // MANA DEDUCTION
    // ------------------------------------------
    const abilityDef = getSkillDef(abilityId);
    if (abilityDef && abilityDef.mpCost) {
        if (player.mp < abilityDef.mpCost) {
            return; 
        }
        player.mp -= abilityDef.mpCost;
    }

    // ------------------------------------------
    // BROADCAST VISUALS
    // ------------------------------------------
    if (message.subType !== "silent" && abilityId !== "town_recall") {
        if (!["umbral_dash", "meteor_strike", "grand_cross", "heavenly_judgment", "devastating_cleave", "wings_of_dawn", "radiant_dash", "divine_smite"].includes(abilityId)) {
            room.broadcastNearby(targetX, targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId, targetX, targetZ });
        }
    }

    if (!room.state.enemies) return;

    const activeAbility = player.skillTree.activeAbilities.get(abilityId);
    const rank = (upgradeId: string) => {
        return activeAbility?.upgrades.get(upgradeId)?.currentRank || 0;
    };

    // ------------------------------------------
    // EXECUTE SPECIFIC ABILITY OR FALLBACK
    // ------------------------------------------
    if (abilityHandlers[abilityId]) {
        abilityHandlers[abilityId]({ room, client, message, player, rank, targetX, targetZ, abilityId, now });
    } else {
        // Universal Fallback (if an ability ID isn't mapped)
        const hitRadius = 5.0;
        const fallbackDamage = 50;
        const batchEvents: any[] = [];

        for (const enemy of room.enemyGrid.getNearby(targetX, targetZ, hitRadius)) {
            if (distSq(enemy.x, enemy.y, targetX, targetZ) <= 25.0) {
                enemy.hp -= fallbackDamage;
                
                const pushDx = enemy.x - targetX;
                const pushDy = enemy.y - targetZ;
                const pushDistSq = pushDx * pushDx + pushDy * pushDy;
                const pushDist = Math.sqrt(pushDistSq) || 1;
                
                enemy.x += (pushDx / pushDist) * 1.5;
                enemy.y += (pushDy / pushDist) * 1.5;

                batchEvents.push({ id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: fallbackDamage, isCrit: false });
                
                if (enemy.hp <= 0) {
                    room.awardPlayerKill(player);
                    room.removeEnemy(enemy.id);
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(targetX, targetZ, 50, "combat_batch", batchEvents);
    }
}