import { Client } from "@colyseus/core";
import { BaseRoom, DodgeMessage, AttackMessage, Hazard } from "./BaseRoom";
import { EnemyState, AfflictionState } from "../schema/EnemyState";
import { SceneryState } from "../schema/SceneryState";
import { ITEM_DB } from "../ItemDatabase";
import { 
    WORLD_RADIUS,
    checkTownCollision, 
    checkMazeCollision,
    checkUnderworldCollision,
    checkDynamicCollision 
} from "../game/CollisionSystem";

function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

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

// -----------------------------------------
// DODGE LOGIC
// -----------------------------------------
export function processDodge(room: BaseRoom<any>, client: Client, message: DodgeMessage) {
    const player = room.state.players.get(client.sessionId);
    if (player && !player.isSleeping && !player.isMeditating && Date.now() >= player.rootedUntil) {
        if ((player as any).mountedFamiliarId !== "") return; 

        if (player.hunger >= 0.5) {
            player.hunger -= 0.5;
            player.stamina = player.hunger;
            room.addAbilityProficiency(player, "evasion", 0.5);

            const dodgeDistance = 4.0;
            const dY = message.dz !== undefined ? message.dz : message.dy; 
            if (dY === undefined) return;

            const targetX = player.x + message.dx * dodgeDistance;
            const targetY = player.y + dY * dodgeDistance;

            let nextX = player.x;
            let nextY = player.y;

            const isWolf = player.isSpiritAnimal || room.activeHazards.some((h: Hazard) => h.type === "spirit_animal" && h.ownerId === client.sessionId);
            const isTown = room.roomName === "town" || room.constructor.name === "TownRoom";
            const isMaze = room.roomName === "maze" || room.constructor.name === "MazeRoom";
            const isUnderworld = room.roomName === "underworld" || room.constructor.name === "UnderworldRoom";

            const serverRadius = 0.5;

            if (isWolf || (!((isTown && checkTownCollision(targetX, targetY, serverRadius)) || (isMaze && checkMazeCollision(targetX, targetY)) || (isUnderworld && checkUnderworldCollision(targetX, targetY))) && !checkDynamicCollision(room.state, targetX, targetY, serverRadius))) {
                nextX = targetX;
                nextY = targetY;
            } else {
                if (!((isTown && checkTownCollision(targetX, player.y, serverRadius)) || (isMaze && checkMazeCollision(targetX, player.y)) || (isUnderworld && checkUnderworldCollision(targetX, player.y))) && !checkDynamicCollision(room.state, targetX, player.y, serverRadius)) nextX = targetX;
                if (!((isTown && checkTownCollision(nextX, targetY, serverRadius)) || (isMaze && checkMazeCollision(nextX, targetY)) || (isUnderworld && checkUnderworldCollision(nextX, targetY))) && !checkDynamicCollision(room.state, nextX, targetY, serverRadius)) nextY = targetY;
            }

            const oldX = player.x;
            const oldY = player.y;
            player.x = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextX));
            player.y = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextY));

            room.playerGrid.update(player, oldX, oldY, player.x, player.y);
            room.broadcastNearby(player.x, player.y, 40, "combatEvent", { type: "dodge", id: client.sessionId, dx: message.dx, dy: dY });
        }
    }
}

// -----------------------------------------
// ATTACK LOGIC
// -----------------------------------------
export function processAttack(room: BaseRoom<any>, client: Client, message: AttackMessage) {
    const player = room.state.players.get(client.sessionId);
    if (!player || player.isSleeping || player.isMeditating || Date.now() < player.rootedUntil) return;

    if ((player as any).mountedFamiliarId && (player as any).mountedFamiliarId !== "") {
        const familiar = room.state.familiars?.get((player as any).mountedFamiliarId);
        if (familiar) familiar.action = "orbiting";
        (player as any).mountedFamiliarId = "";
        (player as any).isFlying = false;
        room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "dismount", targetX: player.x, targetZ: player.y });
    }

    const now = Date.now();
    const lastAttackTimes = (room as any).lastAttackTimes;
    const lastAttack = lastAttackTimes.get(client.sessionId) || 0;
    
    let speed = player.attackSpeed || 1;
    if ((player as any).attackSpeedBuff && Date.now() < (player as any).attackSpeedBuff) speed *= 1.5;
    const cooldownMs = 1000 / speed;

    if (now - lastAttack >= cooldownMs) {
        lastAttackTimes.set(client.sessionId, now);

        let stealthRank = 0; let brokeStealth = false;
        if ((player as any).stealthedUntil && Date.now() < (player as any).stealthedUntil) {
            brokeStealth = true;
            (player as any).stealthedUntil = 0;

            const hIdx = room.activeHazards.findIndex((h: Hazard) => h.type === "veil_of_shadows" && h.ownerId === player.sessionId);
            if (hIdx !== -1) {
                stealthRank = room.activeHazards[hIdx].rank;
                room.broadcastNearby(player.x, player.y, 60, "removeHazard", { id: room.activeHazards[hIdx].id });
                room.activeHazards.splice(hIdx, 1);
            }

            const breakVisual = stealthRank >= 3 ? "veil_of_shadows_burst" : "veil_of_shadows_break";
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: breakVisual, targetX: player.x, targetZ: player.y });

            if (stealthRank >= 3 && room.state.enemies) {
                for (const e of room.enemyGrid.getNearby(player.x, player.y, 6.0)) {
                    if (distSq(e.x, e.y, player.x, player.y) <= 36.0) {
                        e.hp -= 80;
                        applyAffliction(e, "Silence", 3.0, 0, 0);
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 80, isCrit: true });
                        if (e.hp <= 0) { room.awardPlayerKill(player, e.name); room.removeEnemy(e.id); }
                    }
                }
            }
        }

        room.broadcastNearby(player.x, player.y, 50, "playerAttacked", { id: client.sessionId, targetX: message.targetX, targetZ: message.targetZ });

        let hitSomething = false;
        
        if (room.state.enemies) {
            for (const enemy of room.enemyGrid.getNearby(message.targetX, message.targetZ, 2.0)) {
                if (distSq(enemy.x, enemy.y, message.targetX, message.targetZ) <= 4.0) {
                    hitSomething = true;
                    room.addAbilityProficiency(player, "melee_combat", 1.5);
                    
                    let dmg = 15;
                    if (player.equippedItem) dmg += ITEM_DB[player.equippedItem]?.stats?.atk ?? 0;
                    if ((player as any).shadowMinionBuff && Date.now() < (player as any).shadowMinionBuff) dmg += 15;
                    if ((enemy as any).armorShattered || enemy.afflictions.has("Shattered Armor")) dmg = Math.floor(dmg * 1.15);
                    if (brokeStealth && stealthRank >= 1) dmg = Math.floor(dmg * 1.5);
                    
                    if (player.isAuraActive && player.auraStyle === "void") {
                        dmg = Math.floor(dmg * (1.5 + (player.auraControl * 0.2)));
                        player.isAuraActive = false; 
                        (player as any).stealthedUntil = 0;
                        room.broadcastNearby(player.x, player.y, 40, "abilityUsed", { id: player.sessionId, abilityId: "aura_shatter", targetX: player.x, targetZ: player.y });
                    }

                    if (enemy.afflictions.has("Static Charge")) {
                        enemy.afflictions.delete("Static Charge");
                        room.broadcastNearby(enemy.x, enemy.y, 40, "abilityUsed", { id: enemy.id, abilityId: "divine_smite_silver", targetX: enemy.x, targetZ: enemy.y });
                        
                        for (const e of room.enemyGrid.getNearby(enemy.x, enemy.y, 4.0)) {
                            if (e.id !== enemy.id && distSq(e.x, e.y, enemy.x, enemy.y) <= 16.0) {
                                e.hp -= 50;
                                room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 50, isCrit: true });
                                if (e.hp <= 0) { room.awardPlayerKill(player, e.name); room.removeEnemy(e.id); }
                            }
                        }
                    }

                    enemy.hp -= dmg;
                    room.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: dmg, isCrit: brokeStealth && stealthRank >= 1 });
                    
                    if (enemy.hp <= 0) {
                        room.awardPlayerKill(player, enemy.name);
                        
                        if ((enemy as any).sanguineFeastSpread) {
                            const splinters: EnemyState[] = [];
                            for (const e of room.enemyGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                if (e.id !== enemy.id) splinters.push(e);
                            }
                            let spreadCount = 0;
                            for (const n of splinters) {
                                if (spreadCount >= 2) break;
                                applyAffliction(n, "Bleed", 4.0, 10, 1.0, 1, 3);
                                spreadCount++;
                            }
                        }
                        
                        if ((enemy as any).bloodExplosionOnDeath) {
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
        }

        const familiarId = `fam_${client.sessionId}`;
        const familiar = room.state.familiars?.get(familiarId);
        if (familiar && familiar.type === "astral_reflection" && familiar.action === "orbiting" && familiar.hp > 0) {
            const geminiRank = player.skillTree.activeAbilities.get("gemini_base")?.upgrades.get("mimicry")?.currentRank || 1;
            const dmgMult = geminiRank >= 5 ? 0.3 : (geminiRank >= 3 ? 0.2 : 0.1);
            
            room.broadcastNearby(familiar.x, familiar.y, 50, "playerAttacked", { id: familiar.id, targetX: message.targetX, targetZ: message.targetZ });
            
            if (room.state.enemies) {
                for (const enemy of room.enemyGrid.getNearby(message.targetX, message.targetZ, 2.0)) {
                     if (distSq(enemy.x, enemy.y, familiar.x + (message.targetX - player.x), familiar.y + (message.targetZ - player.y)) <= 9.0) {
                         let baseDmg = 15;
                         if (player.equippedItem) baseDmg += ITEM_DB[player.equippedItem]?.stats?.atk ?? 0;
                         
                         const mimicDmg = Math.floor(baseDmg * dmgMult);
                         enemy.hp -= mimicDmg;
                         room.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: mimicDmg, isCrit: false });
                         if (enemy.hp <= 0) { room.awardPlayerKill(player, enemy.name); room.removeEnemy(enemy.id); }
                     }
                }
            }
        }

        if (!hitSomething && room.state.scenery) {
            let bestScenery: SceneryState | null = null;
            let bestScore = -Infinity;
            const attackRangeSq = 36.0;
            
            for (const scenery of room.sceneryGrid.getNearby(player.x, player.y, 6.0)) {
                const dx = scenery.x - player.x; const dy = scenery.y - player.y; 
                const distS = dx * dx + dy * dy;

                if (distS <= attackRangeSq) { 
                    const angleToScenery = Math.atan2(dx, dy);
                    const angleOfAttack = Math.atan2(message.targetX - player.x, message.targetZ - player.y);
                    
                    let angleDiff = angleToScenery - angleOfAttack;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    
                    if (Math.abs(angleDiff) < Math.PI / 2.5) { 
                        const score = -Math.sqrt(distS) - (Math.abs(angleDiff) * 3);
                        if (score > bestScore) { bestScore = score; bestScenery = scenery; }
                    }
                }
            }

            if (bestScenery) {
                room.addAbilityProficiency(player, "gathering", 1.0);
                
                const isRock = bestScenery.kind.includes("rock");
                let damage = 1; 
                const toolDef = ITEM_DB[player.equippedItem];
                if (toolDef && toolDef.type === "tool" && toolDef.stats?.gatherDamage) {
                    if ((isRock && toolDef.name.includes("Pickaxe")) || (!isRock && toolDef.name.includes("Axe"))) {
                        damage = toolDef.stats.gatherDamage;
                    }
                }

                bestScenery.hp -= damage;

                if (bestScenery.hp <= 0) {
                    let lootName = isRock ? "Stone" : "Wood";
                    
                    let biome = "forest";
                    if (bestScenery.x > 800) biome = "elven";
                    else if (bestScenery.y < -800) biome = "winter"; 
                    else if (bestScenery.y > 800) biome = "desert";
                    else if (bestScenery.x < -800) biome = "swamp";

                    if (Math.random() < 0.15) {
                        if (isRock && biome === "winter") lootName = "Glacial Ore";
                        else if (isRock && biome === "desert") lootName = "Sun-baked Clay";
                        else if (!isRock && biome === "swamp") lootName = "Ironwood";
                        else if (isRock && biome === "elven") lootName = "Aethelgard Crystal";
                    }

                    for(let i=0; i<3; i++) { 
                        (room as any).spawnDrop(bestScenery.x + (Math.random() - 0.5) * 1.5, bestScenery.y + (Math.random() - 0.5) * 1.5, lootName); 
                    }

                    room.progressQuest(player, "gather", isRock ? "Stone" : "Wood", 3, client); 

                    const originalScenery = new SceneryState();
                    originalScenery.id = bestScenery.id; originalScenery.kind = bestScenery.kind;
                    originalScenery.x = bestScenery.x; originalScenery.y = bestScenery.y;
                    originalScenery.scale = bestScenery.scale; originalScenery.rotation = bestScenery.rotation;
                    originalScenery.maxHp = bestScenery.maxHp; originalScenery.hp = bestScenery.maxHp;

                    room.sceneryGrid.remove(bestScenery, bestScenery.x, bestScenery.y);
                    room.state.scenery.delete(bestScenery.id);

                    setTimeout(() => {
                        room.state.scenery?.set(originalScenery.id, originalScenery);
                        room.sceneryGrid.add(originalScenery, originalScenery.x, originalScenery.y);
                    }, 60000);
                }
            }
        }
    }
}

// -----------------------------------------
// ENEMY UPDATE LOGIC
// -----------------------------------------
export function updateEnemies(room: BaseRoom<any>, dt: number) {
    if (!room.state.enemies) return;

    for (const [enemyId, enemy] of room.state.enemies.entries()) {
        let nearestPlayer: any = null; 
        let minDistSq = 625.0; 
        let anyPlayerNear = false; 
        
        if (room.playerGrid.getNearby(enemy.x, enemy.y, 150).size > 0) anyPlayerNear = true;
        if (!anyPlayerNear) continue; 
        
        let repelled = false;
        if (room.state.familiars) {
            for (const [, fam] of room.state.familiars.entries()) {
                if (fam.type === "radiant_seraph" && fam.action === "deployed") {
                    if (distSq(enemy.x, enemy.y, fam.x, fam.y) <= 16.0) { 
                        const repDx = enemy.x - fam.x;
                        const repDy = enemy.y - fam.y;
                        const repDist = Math.sqrt(repDx*repDx + repDy*repDy) || 1;
                        
                        enemy.x += (repDx/repDist) * 8.0 * dt;
                        enemy.y += (repDy/repDist) * 8.0 * dt;
                        repelled = true;
                        
                        const owner = room.state.players.get(fam.ownerId);
                        const aegisRank = owner?.skillTree.activeAbilities.get("aegis_branch")?.upgrades.get("divine_wall")?.currentRank || 0;
                        if (aegisRank >= 2 && enemy.attackCooldown <= 0) {
                            enemy.hp -= 20;
                            enemy.attackCooldown = 0.5; 
                            room.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 20 });
                        }
                    }
                }
            }
        }
        
        if (repelled) continue; 
        
        for (const player of room.playerGrid.getNearby(enemy.x, enemy.y, 25)) {
            if (player.isSleeping || player.isMeditating ||
               ((player as any).invulnerableUntil && Date.now() < (player as any).invulnerableUntil) ||
               ((player as any).nightfallStealth && Date.now() < (player as any).nightfallStealth) ||
               ((player as any).stealthedUntil && Date.now() < (player as any).stealthedUntil)) {
                continue; 
            }
            const dSq = distSq(enemy.x, enemy.y, player.x, player.y);
            if (dSq < minDistSq && distSq(0, 0, player.x, player.y) >= 10000) { 
                minDistSq = dSq; nearestPlayer = player; 
            }
        }
        
        if (room.state.familiars) {
            for (const [, fam] of room.state.familiars.entries()) {
                if (["primal_beast", "shadow_monarch", "astral_reflection"].includes(fam.type) && fam.hp > 0) {
                    const dSq = distSq(enemy.x, enemy.y, fam.x, fam.y);
                    if (dSq < minDistSq) { minDistSq = dSq; nearestPlayer = fam; }
                }
            }
        }
        
        let diedFromDoT = false;
        for (const [key, aff] of enemy.afflictions.entries()) {
            aff.duration -= dt;
            if (aff.duration <= 0) enemy.afflictions.delete(key);
            else if (["Crushing Grip", "Necrosis", "Illuminated", "Bleed", "Poison"].includes(aff.type)) {
                aff.tickTimer -= dt;
                if (aff.tickTimer <= 0) {
                    aff.tickTimer += 1.0; 
                    enemy.hp -= aff.damagePerTick;
                    room.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemyId, targetX: enemy.x, targetZ: enemy.y, damage: aff.damagePerTick, isCrit: false, isDoT: true });
                    
                    if (enemy.hp <= 0) {
                        diedFromDoT = true;
                        
                        if ((enemy as any).sanguineFeastSpread) {
                            const splinters: EnemyState[] = [];
                            for (const e of room.enemyGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                if (e.id !== enemy.id) splinters.push(e);
                            }
                            let spreadCount = 0;
                            for (const n of splinters) {
                                if (spreadCount >= 2) break;
                                applyAffliction(n, "Bleed", 4.0, 10, 1.0, 1, 3);
                                spreadCount++;
                            }
                        }

                        if ((enemy as any).bloodExplosionOnDeath) {
                            for (const p of room.playerGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                if (distSq(p.x, p.y, enemy.x, enemy.y) <= 64.0) { 
                                    p.hp = Math.min(p.maxHp, p.hp + 50);
                                }
                            }
                        }

                        if (aff.type === "Crushing Grip" && (enemy as any).crushingGripRank >= 2) {
                            let next: EnemyState | undefined = undefined;
                            for (const e of room.enemyGrid.getNearby(enemy.x, enemy.y, 10.0)) {
                                if (!next && e.id !== enemy.id) { next = e; break; }
                            }
                            if (next) {
                                next.rootedTimer = 4.0; 
                                applyAffliction(next, "Crushing Grip", 4.0, 10, 1.0, 1, 1);
                                (next as any).crushingGripRank = (enemy as any).crushingGripRank;
                                if ((enemy as any).crushingGripRank >= 3) (next as any).armorShattered = true;
                            }
                        }

                        if (nearestPlayer && nearestPlayer.sessionId) room.awardPlayerKill(nearestPlayer, enemy.name);
                    }
                }
            }
        }

        if (diedFromDoT) { room.removeEnemy(enemyId); continue; }
        
        if (enemy.afflictions.has("Silence")) {
            enemy.attackCooldown = 0.5; 
            if (enemy.isAttacking) {
                enemy.isAttacking = false; enemy.attackWindupTimer = 0;
                if (enemy.rootedTimer <= 0) enemy.action = "chasing";
            }
        }

        if (enemy.stunnedTimer > 0 || enemy.rootedTimer > 0) {
            if (enemy.stunnedTimer > 0) enemy.stunnedTimer -= dt;
            if (enemy.rootedTimer > 0) enemy.rootedTimer -= dt;
            if (enemy.stunnedTimer > 0) continue;
        }

        if (enemy.isAttacking) {
            enemy.attackWindupTimer -= dt;
            if (enemy.attackWindupTimer <= 0) {
                enemy.isAttacking = false; 
                enemy.attackCooldown = enemy.maxAttackCooldown || 2.0;
                
                room.broadcastNearby(enemy.targetX, enemy.targetY, 50, "enemyAttackExecuted", { id: enemyId, type: enemy.attackType, x: enemy.targetX, z: enemy.targetY, radius: enemy.attackRadius });
                const hitR = (enemy.attackRadius || 2.5) + (enemy.attackType === "melee" ? 0.5 : 0);
                const hitRSq = hitR * hitR;
                
                for (const p of room.playerGrid.getNearby(enemy.targetX, enemy.targetY, hitR)) {
                    if (p.isSleeping || p.isMeditating || ((p as any).invulnerableUntil && Date.now() < (p as any).invulnerableUntil) || ((p as any).stealthedUntil && Date.now() < (p as any).stealthedUntil)) continue;
                    
                    if (distSq(enemy.targetX, enemy.targetY, p.x, p.y) <= hitRSq) {
                        let finalD = enemy.damage;
                        let totalDef = 0;
                        const equippedArmor = [p.equipHead, p.equipChest, p.equipBack, p.equipLegs, p.equipFeet, p.equipOffHand];
                        equippedArmor.forEach(itemName => { if (itemName) totalDef += ITEM_DB[itemName]?.stats?.def ?? 0; });
                        finalD = Math.max(1, finalD - totalDef);
                        if (enemy.afflictions.has("Weakened")) finalD = Math.max(1, Math.floor(finalD * 0.7));
                        
                        if ((p as any).sanctuaryBuff && Date.now() < (p as any).sanctuaryBuff) {
                            if (p.hp - finalD < 1) finalD = p.hp - 1;
                        }

                        let hasUndyingRage = false;
                        for (const h of room.activeHazards) {
                            if (h.type === "wrath_aura" && h.ownerId === p.sessionId && h.rank >= 3) { hasUndyingRage = true; break; }
                        }
                        if (hasUndyingRage && p.hp - finalD < 1) finalD = p.hp - 1;

                        if ((p as any).windBarrierUntil && Date.now() < (p as any).windBarrierUntil) {
                            finalD = 0; 
                            const reflectedDmg = Math.floor(enemy.damage * 1.5);
                            enemy.hp -= reflectedDmg;
                            room.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemyId, targetX: enemy.x, targetZ: enemy.y, damage: reflectedDmg, isCrit: true });
                            if (enemy.hp <= 0) { room.awardPlayerKill(p, enemy.name); room.removeEnemy(enemyId); }
                        }

                        if (finalD > 0) {
                            if ((p as any).tempShield && (p as any).tempShield > 0) { 
                                (p as any).tempShield -= finalD; 
                                if ((p as any).tempShield < 0) { 
                                    p.hp += (p as any).tempShield; 
                                    (p as any).tempShield = 0; 
                                } 
                            } else { 
                                p.hp -= finalD; 
                            }
                        }
                        
                        room.broadcastNearby(p.x, p.y, 50, "playerAttacked", { id: p.sessionId, targetX: p.x, targetZ: p.y, damage: enemy.damage });
                        
                        if (p.hp <= 0) { 
                            p.hp = p.maxHp; 
                            
                            const isUnderworld = room.roomName === "underworld" || room.constructor.name === "UnderworldRoom";
                            const client = room.clients.find(c => c.sessionId === p.sessionId);

                            if (!isUnderworld) {
                                if (client) {
                                    client.send("close_all_ui");
                                    client.send("server_event_teleport", { zone: "underworld" });
                                }
                            } else {
                                const oX = p.x; const oY = p.y; 
                                p.x = 0; p.y = 20; 
                                room.playerGrid.update(p, oX, oY, p.x, p.y); 
                                if (client) {
                                    client.send("close_all_ui");
                                    client.send("forcePosition", { x: p.x, z: p.y });
                                }
                            }
                        }
                    }
                }

                if (room.state.familiars) {
                    for (const fam of room.familiarGrid.getNearby(enemy.targetX, enemy.targetY, hitR)) {
                        if (["primal_beast", "shadow_monarch", "astral_reflection"].includes(fam.type) && fam.hp > 0) {
                            if (distSq(enemy.targetX, enemy.targetY, fam.x, fam.y) <= hitRSq) {
                                fam.hp -= enemy.damage;
                                room.broadcastNearby(fam.x, fam.y, 40, "playerAttacked", { id: fam.id, targetX: fam.x, targetZ: fam.y, damage: enemy.damage });
                            }
                        }
                    }
                }

                if (enemy.attackType === "dash") { 
                    const oX = enemy.x; const oY = enemy.y; 
                    enemy.x = enemy.targetX; enemy.y = enemy.targetY; 
                    room.enemyGrid.update(enemy, oX, oY, enemy.x, enemy.y); 
                }
            }
            continue; 
        }

        enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - dt);
        
        const oX = enemy.x; const oY = enemy.y;
        let decoyTarget: Hazard | null = null;
        for (const h of room.activeHazards) {
            if (h.type === "blood_decoy" && distSq(enemy.x, enemy.y, h.x, h.y) <= 225.0) { decoyTarget = h; break; }
        }

        const isTown = room.roomName === "town" || room.constructor.name === "TownRoom";
        const isMaze = room.roomName === "maze" || room.constructor.name === "MazeRoom";
        const isUnderworld = room.roomName === "underworld" || room.constructor.name === "UnderworldRoom";

        if (decoyTarget) {
            enemy.action = "chasing";
            if (enemy.rootedTimer <= 0) {
                enemy.targetX = decoyTarget.x; enemy.targetY = decoyTarget.y;
                const speed = enemy.afflictions.has("Slow") ? ((enemy.speed || 4.0) * 0.4) : (enemy.speed || 4.0);
                const angle = Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x);
                const moveD = Math.min(speed * dt, Math.sqrt(distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY)));
                let nX = enemy.x + Math.cos(angle) * moveD; let nY = enemy.y + Math.sin(angle) * moveD;
                
                if (nX*nX + enemy.y*enemy.y < 14400) { 
                    if (!((isTown && checkTownCollision(nX, enemy.y, 0.5)) || (isMaze && checkMazeCollision(nX, enemy.y, 0.5)) || (isUnderworld && checkUnderworldCollision(nX, enemy.y, 0.5)))) enemy.x = nX; 
                    if (!((isTown && checkTownCollision(enemy.x, nY, 0.5)) || (isMaze && checkMazeCollision(enemy.x, nY, 0.5)) || (isUnderworld && checkUnderworldCollision(enemy.x, nY, 0.5)))) enemy.y = nY; 
                } else { 
                    enemy.x = nX; enemy.y = nY; 
                }
            }
        } 
        else if (nearestPlayer) {
            enemy.action = "chasing";
            const attackRadSq = (enemy.attackRadius || 2.5) ** 2;
            if (minDistSq <= attackRadSq && enemy.attackCooldown <= 0) {
                enemy.isAttacking = true; 
                enemy.attackWindupTimer = enemy.maxAttackWindup || 1.0;
                enemy.targetX = enemy.attackType === "dash" ? nearestPlayer.x : enemy.x;
                enemy.targetY = enemy.attackType === "dash" ? nearestPlayer.y : enemy.y;
                room.broadcastNearby(enemy.targetX, enemy.targetY, 50, "enemyTelegraph", { id: enemyId, type: enemy.attackType, x: enemy.targetX, z: enemy.targetY, radius: enemy.attackRadius, time: enemy.maxAttackWindup });
            } else if (enemy.rootedTimer <= 0) {
                enemy.targetX = nearestPlayer.x; enemy.targetY = nearestPlayer.y;
                const speed = enemy.afflictions.has("Slow") ? ((enemy.speed || 4.0) * 0.4) : (enemy.speed || 4.0);
                const angle = Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x);
                const moveD = Math.min(speed * dt, Math.sqrt(distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY)));
                
                let nX = enemy.x + Math.cos(angle) * moveD; let nY = enemy.y + Math.sin(angle) * moveD;
                
                if (nX*nX + enemy.y*enemy.y < 14400) { 
                    if (!((isTown && checkTownCollision(nX, enemy.y, 0.5)) || (isMaze && checkMazeCollision(nX, enemy.y, 0.5)) || (isUnderworld && checkUnderworldCollision(nX, enemy.y, 0.5)))) enemy.x = nX; 
                    if (!((isTown && checkTownCollision(enemy.x, nY, 0.5)) || (isMaze && checkMazeCollision(enemy.x, nY, 0.5)) || (isUnderworld && checkUnderworldCollision(enemy.x, nY, 0.5)))) enemy.y = nY; 
                } else { 
                    enemy.x = nX; enemy.y = nY; 
                }
            }
        } else if (enemy.rootedTimer <= 0) {
            enemy.action = "roaming";
            if (isNaN(enemy.targetX) || distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY) < 1.0) {
                for(let i=0; i<5; i++) {
                    const tx = enemy.x + (Math.random() - 0.5) * 60; const ty = enemy.y + (Math.random() - 0.5) * 60;
                    if (tx*tx + ty*ty >= 10000 && !((isTown && checkTownCollision(tx, ty, 0.5)) || (isMaze && checkMazeCollision(tx, ty, 0.5)) || (isUnderworld && checkUnderworldCollision(tx, ty, 0.5)))) { 
                        enemy.targetX = tx; enemy.targetY = ty; break; 
                    }
                }
            }
            const speed = enemy.afflictions.has("Slow") ? ((enemy.speed || 4.0) * 0.4) : (enemy.speed || 4.0);
            const angle = Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x);
            const moveD = Math.min(speed * dt, Math.sqrt(distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY)));
            
            let nX = enemy.x + Math.cos(angle) * moveD; let nY = enemy.y + Math.sin(angle) * moveD;
            
            if (nX*nX + enemy.y*enemy.y < 14400) { 
                if (!((isTown && checkTownCollision(nX, enemy.y, 0.5)) || (isMaze && checkMazeCollision(nX, enemy.y, 0.5)) || (isUnderworld && checkUnderworldCollision(nX, enemy.y, 0.5)))) enemy.x = nX; 
                if (!((isTown && checkTownCollision(enemy.x, nY, 0.5)) || (isMaze && checkMazeCollision(enemy.x, nY, 0.5)) || (isUnderworld && checkUnderworldCollision(enemy.x, nY, 0.5)))) enemy.y = nY; 
            } else { 
                enemy.x = nX; enemy.y = nY; 
            }
        }

        if (oX !== enemy.x || oY !== enemy.y) room.enemyGrid.update(enemy, oX, oY, enemy.x, enemy.y);
    }
}