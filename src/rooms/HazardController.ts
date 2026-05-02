import { BaseRoom } from "./BaseRoom";
import { applyAffliction } from "./CombatController";
import { EnemyState } from "../schema/EnemyState";
import { SceneryState } from "../schema/SceneryState";
import { distToSegmentSquared } from "../game/CollisionSystem";

export type Hazard = {
    type: string;
    id: string;
    ownerId: string;
    x: number;
    y: number;
    timer: number;
    rank: number;
    customData?: any;
};

function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

export function processHazards(room: BaseRoom<any>, dt: number) {
    const removeHazardSync = (index: number) => {
        const hazardToRemove = room.activeHazards[index];
        if (hazardToRemove.type === "mana_pillar") {
            const ownerClient = room.clients.find(c => c.sessionId === hazardToRemove.ownerId);
            if (ownerClient) ownerClient.send("removeHazard", { id: hazardToRemove.id });
        } else {
            room.broadcastNearby(hazardToRemove.x, hazardToRemove.y, 60, "removeHazard", { id: hazardToRemove.id });
        }
        room.activeHazards.splice(index, 1);
    };

    for (let i = room.activeHazards.length - 1; i >= 0; i--) {
        const h = room.activeHazards[i]; 
        h.timer -= dt;
        const owner = room.state.players.get(h.ownerId);
        
        if (h.type === "mana_pillar") {
            if (h.timer <= 0) {
                const c = room.clients.find(c => c.sessionId === h.ownerId);
                if (h.customData.optionText === h.customData.answer) { if (c) c.send("clearCommunionQuestion"); }
                removeHazardSync(i);
                continue;
            }
            if (owner && distSq(owner.x, owner.y, h.x, h.y) <= 2.25) { 
                if (h.customData.isCorrect) {
                    owner.mp = Math.min(owner.maxMp, owner.mp + 50);
                    room.broadcastNearby(h.x, h.y, 40, "abilityUsed", { id: owner.sessionId, abilityId: "mana_pillar_correct", targetX: h.x, targetZ: h.y });
                } else {
                    room.broadcastNearby(h.x, h.y, 40, "abilityUsed", { id: owner.sessionId, abilityId: "mana_pillar_wrong", targetX: h.x, targetZ: h.y });
                    owner.rootedUntil = Date.now() + 2000;
                    const client = room.clients.find(c => c.sessionId === h.ownerId);
                    if (client) client.send("hud_message", "Incorrect! Mind shattered for 2 seconds.");
                }
                
                const groupId = h.customData.groupId;
                for (let j = 0; j < room.activeHazards.length; j++) {
                    if (room.activeHazards[j].type === "mana_pillar" && room.activeHazards[j].customData.groupId === groupId) room.activeHazards[j].timer = 0; 
                }
                const c = room.clients.find(c => c.sessionId === h.ownerId);
                if (c) c.send("clearCommunionQuestion");
            }
        }
        else if (h.type === "shadow_minion" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                let bestE = null; let bestDSq = 100.0; 
                for (const e of room.enemyGrid.getNearby(h.x, h.y, 10.0)) {
                    if (e.hp <= 0) continue;
                    const dSq = distSq(e.x, e.y, h.x, h.y);
                    if (dSq < bestDSq) { bestDSq = dSq; bestE = e; }
                }
                
                if (bestE) {
                    const angle = Math.atan2(bestE.y - h.y, bestE.x - h.x);
                    if (bestDSq > 4.0) { 
                        h.x += Math.cos(angle) * 6.0 * dt;
                        h.y += Math.sin(angle) * 6.0 * dt;
                    } else {
                        const dmg = owner ? 15 + owner.level : 20; 
                        bestE.hp -= dmg;
                        room.broadcastNearby(bestE.x, bestE.y, 40, "playerAttacked", { id: bestE.id, targetX: bestE.x, targetZ: bestE.y, damage: dmg });
                        if (bestE.hp <= 0 && owner) { room.awardPlayerKill(owner, bestE.name); room.removeEnemy(bestE.id); }
                    }
                } else if (owner) {
                    const dSqOwner = distSq(h.x, h.y, owner.x, owner.y);
                    if (dSqOwner > 16.0) { 
                        const angle = Math.atan2(owner.y - h.y, owner.x - h.x);
                        h.x += Math.cos(angle) * 8.0 * dt;
                        h.y += Math.sin(angle) * 8.0 * dt;
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "blood_decoy") {
            if (h.timer <= 0) {
                if (h.rank >= 2 && room.state.enemies) { 
                    room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "blood_decoy_explode", targetX: h.x, targetZ: h.y });
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 36.0) {
                            applyAffliction(e, "Bleed", 4.0, 10, 1.0, 1, 3);
                            applyAffliction(e, "Poison", 4.0, 10, 1.0, 1, 3);
                            room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 15, isCrit: false });
                            if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        }
                    }
                }
                removeHazardSync(i);
            }
        }
        else if (h.type === "leech_swarm" && room.state.enemies) {
            for (const e of room.enemyGrid.getNearby(h.x, h.y, 5.0)) {
                if (distSq(e.x, e.y, h.x, h.y) <= 25.0) {
                    applyAffliction(e, "Necrosis", 2.0, 10, 1.0, 1);
                    if (h.rank >= 2) applyAffliction(e, "Silence", 2.0, 0, 0);
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "veil_of_shadows" && owner) {
            h.x = owner.x; h.y = owner.y;
            if (h.rank >= 2) owner.hp = Math.min(owner.maxHp, owner.hp + (owner.maxHp * 0.05 * dt));

            if (h.timer <= 0) {
                (owner as any).stealthedUntil = 0;
                
                const breakVisual = h.rank >= 3 ? "veil_of_shadows_burst" : "veil_of_shadows_break";
                room.broadcastNearby(owner.x, owner.y, 50, "abilityUsed", { id: h.ownerId, abilityId: breakVisual, targetX: owner.x, targetZ: owner.y });

                if (h.rank >= 3 && room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(owner.x, owner.y, 6.0)) {
                        if (distSq(e.x, e.y, owner.x, owner.y) <= 36.0) {
                            e.hp -= 80; applyAffliction(e, "Silence", 3.0, 0, 0);
                            room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 80, isCrit: true });
                            if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        }
                    }
                }
                removeHazardSync(i);
            }
        }
        else if (h.type === "doom_familiar" && owner) {
            h.x = owner.x; h.y = owner.y;
            h.customData.lastShot -= dt;
            if (h.customData.lastShot <= 0 && room.state.enemies) {
                let targetFound = false;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, 12.0)) {
                    if (!targetFound && distSq(e.x, e.y, h.x, h.y) <= 144.0) {
                        let dmg = 40;
                        if (e.afflictions.has("Bleed") || e.afflictions.has("Necrosis")) dmg = 80; 
                        e.hp -= dmg; 
                        room.broadcastNearby(e.x, e.y, 50, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: dmg > 40 });
                        room.broadcastNearby(e.x, e.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "gordon_beam", targetX: e.x, targetZ: e.y });
                        if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        targetFound = true; h.customData.lastShot = 1.0; 
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "umbral_snare" && room.state.enemies) {
            let triggered = false;
            for (const e of room.enemyGrid.getNearby(h.x, h.y, 2.5)) {
                if (distSq(e.x, e.y, h.x, h.y) <= 6.25) {
                    triggered = true; e.rootedTimer = Math.max(e.rootedTimer, 3.0);
                    if (h.rank >= 1) applyAffliction(e, "Necrosis", 5.0, 15, 1.0, 2);
                    if (h.rank >= 2) {
                        for (const pullTarget of room.enemyGrid.getNearby(h.x, h.y, 8.0)) {
                            if (distSq(pullTarget.x, pullTarget.y, h.x, h.y) <= 64.0) {
                                pullTarget.x = h.x; pullTarget.y = h.y; pullTarget.rootedTimer = Math.max(pullTarget.rootedTimer, 3.0);
                            }
                        }
                    }
                    room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "umbral_snare_trigger", targetX: h.x, targetZ: h.y });
                    break; 
                }
            }
            if (triggered || h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "shadow_anchor" || h.type === "nightfall_zone") {
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "umbral_snare_aura" && owner && room.state.enemies) {
            h.x = owner.x; h.y = owner.y;
            for (const e of room.enemyGrid.getNearby(h.x, h.y, 4.0)) {
                if (distSq(e.x, e.y, h.x, h.y) <= 16.0) {
                    const lastRoot = h.customData.rootedEnemies[e.id] || 0;
                    if (Date.now() - lastRoot > 10000) {
                        e.rootedTimer = 3.0; h.customData.rootedEnemies[e.id] = Date.now();
                        room.broadcastNearby(e.x, e.y, 40, "abilityUsed", { id: owner.sessionId, abilityId: "umbral_snare_trigger", targetX: e.x, targetZ: e.y });
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "town_portal") {
            let used = false;
            for (const p of room.playerGrid.getNearby(h.x, h.y, 2.0)) {
                if (!used && distSq(p.x, p.y, h.x, h.y) <= 2.25) { 
                    const oldX = p.x; const oldY = p.y;
                    p.x = 0; p.y = 20; 
                    room.playerGrid.update(p, oldX, oldY, p.x, p.y);
                    
                    const client = room.clients.find(c => c.sessionId === p.sessionId);
                    if (client) {
                        client.send("close_all_ui");
                        client.send("forcePosition", { x: 0, z: 20 });
                    }

                    room.broadcastNearby(0, 20, 50, "abilityUsed", { id: p.sessionId, abilityId: "town_recall_teleport", targetX: 0, targetZ: 20 });
                    used = true;
                }
            }
            if (used) {
                room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "town_portal_destroy", targetX: h.x, targetZ: h.y });
                removeHazardSync(i);
            } else if (h.timer <= 0) {
                removeHazardSync(i);
            }
        }
        else if (h.type === "dark_singularity" && room.state.enemies) {
            for (const e of room.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                if (distSq(e.x, e.y, h.x, h.y) <= 36.0) applyAffliction(e, "Silence", 1.0, 0, 0);
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "bull_rush_fire" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 0.5;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, 20.0)) {
                    if (distToSegmentSquared(e.x, e.y, h.x, h.y, h.customData.endX, h.customData.endZ) <= 16.0) { 
                        e.hp -= 15;
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 15, isCrit: false, isDoT: true });
                        if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "shattered_crater" && room.state.enemies) {
            for (const e of room.enemyGrid.getNearby(h.x, h.y, 5.0)) {
                if (distSq(e.x, e.y, h.x, h.y) <= 25.0) applyAffliction(e, "Slow", 1.0, 0, 0);
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "meteor_magma_pool" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                const radius = h.customData.radius || 9.0;
                const rSq = radius * radius;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, radius)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= rSq) {
                        e.hp -= 40;
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 40, isCrit: false, isDoT: true });
                        if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "whirlwind_aura" && owner) {
            h.x = owner.x; h.y = owner.y; h.customData.tickTimer -= dt;

            if (h.customData.tickTimer <= 0 && room.state.enemies) {
                h.customData.tickTimer = 0.5;
                const hitRadius = 5.0;
                const checkR = hitRadius + 2.0;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, checkR)) {
                    const dSq = distSq(e.x, e.y, h.x, h.y);
                    if (dSq <= checkR**2) {
                        if (h.rank >= 2 && dSq > 2.25) { 
                            const pullDx = h.x - e.x; const pullDy = h.y - e.y;
                            const pullDist = Math.sqrt(pullDx*pullDx + pullDy*pullDy) || 1;
                            e.x += (pullDx / pullDist) * 2.0; e.y += (pullDy / pullDist) * 2.0;
                            e.stunnedTimer = Math.max(e.stunnedTimer, 0.6); 
                        }
                        if (dSq <= 25.0) { 
                            e.hp -= 25; 
                            room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 25, isCrit: false });
                            if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        }
                    }
                }
            }

            if (h.timer <= 0) {
                (owner as any).windBarrierUntil = 0; 
                room.broadcastNearby(owner.x, owner.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "whirlwind_end", targetX: owner.x, targetZ: owner.y });
                removeHazardSync(i);
            }
        }
        else if (h.type === "radiant_trail") {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 0.5;
                for (const p of room.playerGrid.getNearby(h.x, h.y, 2.0)) {
                    if (distSq(p.x, p.y, h.x, h.y) <= 4.0) (p as any).holySpeedBuff = Date.now() + 1000;
                }
                if (h.rank >= 2 && room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, 2.0)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 4.0) {
                            applyAffliction(e, "Illuminated", 1.5, 0, 0);
                            e.stunnedTimer = Math.max(e.stunnedTimer, 0.5); 
                        }
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "aura_of_purity" && owner) {
            h.x = owner.x; h.y = owner.y; h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 3.0;
                owner.hp = Math.min(owner.maxHp, owner.hp + 40);

                if (room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 36.0) {
                            e.hp -= 30;
                            if (h.rank >= 2) applyAffliction(e, "Weakened", 3.0, 0, 0);
                            room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 30, isCrit: false, isDoT: true });
                            if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        }
                    }
                }
            }

            if (h.timer <= 0) {
                room.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "aura_of_purity_end", targetX: owner.x, targetZ: owner.y });
                if (h.rank >= 3) {
                    room.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "aura_of_purity_detonate", targetX: owner.x, targetZ: owner.y });
                    for (const p of room.playerGrid.getNearby(owner.x, owner.y, 6.0)) {
                        if (distSq(p.x, p.y, owner.x, owner.y) <= 36.0) p.hp = Math.min(p.maxHp, p.hp + 100);
                    }
                }
                removeHazardSync(i);
            }
        }
        else if (h.type === "holy_fire_ring" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 0.5;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, 7.0)) {
                    const dSq = distSq(e.x, e.y, h.x, h.y);
                    if (dSq >= 25.0 && dSq <= 49.0) {
                        e.hp -= 20;
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 20, isCrit: false, isDoT: true });
                        if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "consecrated_ground") {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                if (room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, 5.0)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 25.0) {
                            let dmg = 15;
                            if (h.rank >= 2 && (e.name.includes("Wraith") || e.name.includes("Ent") || e.name.includes("Slime") || e.name.includes("Toad"))) dmg *= 2; 
                            e.hp -= dmg;
                            room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: false, isDoT: true });
                            if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        }
                    }
                }
            }

            for (const p of room.playerGrid.getNearby(h.x, h.y, 5.0)) {
                if (distSq(p.x, p.y, h.x, h.y) <= 25.0) {
                    if (h.rank >= 1) (p as any).holySpeedBuff = Date.now() + 1000; 
                    if (h.rank >= 3) (p as any).sanctuaryBuff = Date.now() + 1000;
                }
            }

            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "grand_cross_turret" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                let targetFound = false;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, 15.0)) {
                    if (!targetFound && distSq(e.x, e.y, h.x, h.y) <= 225.0) {
                        e.hp -= 60;
                        room.broadcastNearby(e.x, e.y, 50, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 60, isCrit: false });
                        room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "grand_cross_laser", targetX: e.x, targetZ: e.y });
                        if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        targetFound = true;
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if ((h.type === "heavenly_judgment" || h.type === "orbital_strike_mini") && room.state.enemies) {
            h.customData.tickTimer -= dt;
            
            let target: EnemyState | undefined = undefined;
            if (h.customData.targetId) target = room.state.enemies.get(h.customData.targetId);
            
            if (!target || target.hp <= 0 || h.type === "heavenly_judgment") {
                let minDistSq = 400.0; let newTarget = null;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, 20.0)) {
                    if (e.hp <= 0) continue;
                    const dSq = distSq(e.x, e.y, h.x, h.y);
                    if (dSq < minDistSq) { minDistSq = dSq; newTarget = e; }
                }
                target = newTarget || undefined;
                if (target) h.customData.targetId = target.id;
            }

            if (target && h.rank >= 1) {
                const trackingSpeed = h.type === "orbital_strike_mini" ? 5.0 : 2.0;
                const dirX = target.x - h.x; const dirY = target.y - h.y;
                const len = Math.sqrt(dirX*dirX + dirY*dirY);
                if (len > 0.5) { 
                    h.x += (dirX / len) * trackingSpeed * dt; h.y += (dirY / len) * trackingSpeed * dt;
                    room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.id, abilityId: "heavenly_judgment_move", targetX: h.x, targetZ: h.y });
                }
            }

            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = h.type === "orbital_strike_mini" ? 0.5 : 1.0;
                let radius = h.customData.radius; let damage = h.customData.damage;

                if (h.rank >= 2 && h.type === "heavenly_judgment") {
                    radius *= (1.0 + (h.customData.hits * 0.2)); damage *= (1.0 + (h.customData.hits * 0.2));
                }
                
                const rSq = radius * radius;

                let struckTarget = false;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, radius)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= rSq && e.hp > 0) {
                        e.hp -= damage;
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: Math.floor(damage), isCrit: true });
                        if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        struckTarget = true;
                    }
                }

                if (struckTarget && h.rank >= 2 && h.type === "heavenly_judgment") {
                    h.customData.hits += 1;
                    room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.id, abilityId: "heavenly_judgment_grow", targetX: h.x, targetZ: h.y });
                }
            }
            
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "seismic_aftershock") {
            if (h.timer <= 0) {
                const hitRadius = 6.0;
                if (room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, hitRadius)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 36.0) {
                            e.hp -= 50;
                            if (h.rank >= 2) e.stunnedTimer = Math.max(e.stunnedTimer, 2.0);
                            room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 50, isCrit: false });
                            if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        }
                    }
                }

                if (h.rank >= 3 && room.state.scenery) {
                    const pillar = new SceneryState();
                    pillar.id = `pillar_${Date.now()}`; pillar.kind = "crystal_rock";
                    pillar.x = h.x; pillar.y = h.y;
                    pillar.scale = 1.5; pillar.maxHp = 100; pillar.hp = 100;
                    room.state.scenery.set(pillar.id, pillar);
                    room.sceneryGrid.add(pillar, pillar.x, pillar.y);
                }

                room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "seismic_slam", targetX: h.x, targetZ: h.y });
                removeHazardSync(i);
            }
        }
        else if (h.type === "wrath_aura" && owner) {
            h.x = owner.x; h.y = owner.y;
            if (h.timer <= 0) {
                owner.attackSpeed = 1.0; 
                if (h.rank >= 3) owner.hp = Math.max(owner.hp, owner.maxHp * 0.25); 
                removeHazardSync(i);
            }
        }
        else if (h.type === "spirit_animal" && owner) {
            h.x = owner.x; h.y = owner.y; h.customData.tickTimer -= dt;

            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 0.5;
                if (h.rank >= 1) {
                    for (const p of room.playerGrid.getNearby(h.x, h.y, 8.0)) {
                        if (distSq(p.x, p.y, h.x, h.y) <= 64.0 && p.sessionId !== owner.sessionId) {
                            (p as any).holySpeedBuff = Date.now() + 1000;
                        }
                    }
                }
                if (h.rank >= 2 && room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, 2.5)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 6.25) {
                            applyAffliction(e, "Bleed", 3.0, 10, 1.0, 1, 3);
                            applyAffliction(e, "Slow", 2.0, 0, 0);
                        }
                    }
                }
            }

            if (h.timer <= 0) {
                owner.isSpiritAnimal = false;
                room.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "spirit_animal_end", targetX: owner.x, targetZ: owner.y });

                if (h.rank >= 3 && room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= 36.0) e.stunnedTimer = Math.max(e.stunnedTimer, 2.0);
                    }
                    room.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: owner.sessionId, abilityId: "intimidating_shout", targetX: h.x, targetZ: h.y }); 
                }
                removeHazardSync(i);
            }
        }
        else if (h.type === "jagged_stone" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                const rSq = h.customData.radius * h.customData.radius;
                for (const e of room.enemyGrid.getNearby(h.x, h.y, h.customData.radius)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= rSq) applyAffliction(e, "Slow", 1.5, 0, 0);
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.type === "healing_blossom") {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                const rSq = h.customData.radius * h.customData.radius;
                for (const p of room.playerGrid.getNearby(h.x, h.y, h.customData.radius)) {
                    if (distSq(p.x, p.y, h.x, h.y) <= rSq) {
                        p.hp = Math.min(p.maxHp, p.hp + 25);
                    }
                }

                if (h.rank >= 2 && room.state.enemies) {
                    for (const e of room.enemyGrid.getNearby(h.x, h.y, h.customData.radius)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= rSq) {
                            applyAffliction(e, "Poison", 3.0, 15, 1.0, 1, 5);
                        }
                    }
                }
            }

            if (h.timer <= 0) {
                if (h.rank >= 3) {
                    (room as any).spawnDrop(h.x, h.y, "Minor Health Potion");
                }
                removeHazardSync(i);
            }
        }
        else if (h.type === "wrath_of_the_forest" && room.state.enemies) {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                let totalDrained = 0;
                const rSq = h.customData.radius * h.customData.radius;
                
                for (const e of room.enemyGrid.getNearby(h.x, h.y, h.customData.radius)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= rSq) {
                        let dmg = 30; if (h.rank >= 1) dmg *= 1.5; 
                        
                        e.hp -= dmg; totalDrained += dmg; e.rootedTimer = Math.max(e.rootedTimer, 1.5);
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: false, isDoT: true });
                        if (e.hp <= 0 && owner) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                    }
                }

                if (totalDrained > 0) {
                    const healAmount = Math.floor(totalDrained * 0.2);
                    for (const p of room.playerGrid.getNearby(h.x, h.y, h.customData.radius)) {
                        if (distSq(p.x, p.y, h.x, h.y) <= rSq) p.hp = Math.min(p.maxHp, p.hp + healAmount);
                    }
                }
            }

            if (h.timer <= 0) {
                if (h.rank >= 3) {
                    const sapling = {
                        type: "world_tree_sapling", id: `sapling_${Date.now()}`, ownerId: h.ownerId,
                        x: h.x, y: h.y, timer: 120.0, rank: h.rank, customData: { tickTimer: 1.0, radius: 8.0 }
                    };
                    room.activeHazards.push(sapling);
                    room.broadcastNearby(h.x, h.y, 60, "spawnHazard", sapling);
                }
                removeHazardSync(i);
            }
        }
        else if (h.type === "world_tree_sapling") {
            h.customData.tickTimer -= dt;
            if (h.customData.tickTimer <= 0) {
                h.customData.tickTimer = 1.0;
                const rSq = h.customData.radius * h.customData.radius;
                for (const p of room.playerGrid.getNearby(h.x, h.y, h.customData.radius)) {
                    if (distSq(p.x, p.y, h.x, h.y) <= rSq) {
                        (p as any).tempShield = ((p as any).tempShield || 0) + 10;
                    }
                }
            }
            if (h.timer <= 0) removeHazardSync(i);
        }
        else if (h.timer <= 0) {
            removeHazardSync(i);
        }
    }
}