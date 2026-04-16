import { Client } from "colyseus";
import { BaseRoom, applyAffliction, Hazard } from "./rooms/BaseRoom";
import { PlayerState } from "./schema/PlayerState";
import { FamiliarState } from "./schema/FamiliarState";
import { distSq } from "./game/CollisionSystem";

// NEW: Import the database functions from your new data file!
import { getSkillDef, getAbilityCategory } from "./data/AbilityDatabase";

// --- HELPER: MAP CORE SKILL TO FAMILIAR TYPE ---
const FAMILIAR_CORE_MAP: Record<string, string> = {
    "swarm_base": "apocalyptic_swarm",
    "arbiter_base": "orbital_arbiter",
    "shade_base": "void_servant",
    "monarch_base": "shadow_monarch",
    "stash_base": "dragon_hoarder",
    "pixie_base": "symbiotic_spirit",
    "gemini_base": "astral_reflection",
    "beast_base": "primal_beast",
    "seraph_base": "radiant_seraph",
    "gryphon_base": "storm_gryphon",
    "behemoth_base": "ironclad_behemoth"
};

/**
 * Synchronizes the existence of familiars.
 * Checks if a player has a familiar equipped. If so, spawns it. If not, removes it.
 */
export function syncFamiliars(room: BaseRoom<any>) {
    if (!room.state.familiars) return;

    room.state.players.forEach((player: PlayerState, sessionId: string) => {
        let activeFamiliarCore: string | null = null;
        
        if (!player.skillTree || !player.skillTree.activeAbilities) return;

        // Check if the core ability is active to spawn the base familiar
        for (const coreKey of Object.keys(FAMILIAR_CORE_MAP)) {
            if (player.skillTree.activeAbilities.has(coreKey)) {
                activeFamiliarCore = coreKey;
                break;
            }
        }

        const expectedType = activeFamiliarCore ? FAMILIAR_CORE_MAP[activeFamiliarCore] : null;
        const familiarId = `fam_${sessionId}`;
        const existingFamiliar = room.state.familiars.get(familiarId);

        if (expectedType) {
            if (!existingFamiliar || existingFamiliar.type !== expectedType) {
                if (existingFamiliar) {
                    room.familiarGrid.remove(existingFamiliar, existingFamiliar.x, existingFamiliar.y);
                    room.state.familiars.delete(familiarId);
                }

                // Initial Spawn Logic
                const fam = new FamiliarState();
                fam.id = familiarId;
                fam.ownerId = sessionId;
                fam.type = expectedType;
                fam.name = expectedType.replace(/_/g, ' ').toUpperCase();
                fam.x = player.x;
                fam.y = player.y;
                fam.targetX = player.x;
                fam.targetY = player.y;
                fam.action = "orbiting";
                fam.isDetached = false;
                fam.tickTimer = 0;
                fam.actionTimer = 0;
                
                fam.maxHp = 100 + (player.level * 25);
                fam.hp = fam.maxHp;
                
                room.state.familiars.set(fam.id, fam);
                room.familiarGrid.add(fam, fam.x, fam.y);
            }
        } else {
            if (existingFamiliar) {
                room.familiarGrid.remove(existingFamiliar, existingFamiliar.x, existingFamiliar.y);
                room.state.familiars.delete(familiarId);
            }
        }
    });
}

/**
 * Handles Slot 9 active commands for familiars.
 */
export function handleFamiliarAbility(room: BaseRoom<any>, client: Client, message: { abilityId: string, targetX: number, targetZ: number }) {
    if (!room.state.familiars) return;

    const player = room.state.players.get(client.sessionId);
    if (!player || player.isSleeping || player.isMeditating || Date.now() < player.rootedUntil) return;

    const familiarId = `fam_${client.sessionId}`;
    const familiar = room.state.familiars.get(familiarId);
    
    // If the familiar is dead/respawning, ignore commands
    if (!familiar || familiar.hp <= 0) return;

    // Logic for specific active commands in FAMILIAR_TREE_DATA (Branch IDs)
    switch (message.abilityId) {
        case "devour_branch": 
            familiar.isDetached = true;
            familiar.actionTimer = 8.0; 
            familiar.targetX = message.targetX;
            familiar.targetY = message.targetZ; 
            familiar.action = "deployed";
            room.broadcastNearby(familiar.targetX, familiar.targetY, 60, "abilityUsed", { id: client.sessionId, abilityId: "swarm_devour_cast", targetX: familiar.targetX, targetZ: familiar.targetY });
            break;

        case "annihilation_branch": 
            familiar.currentTargetId = ""; // Will lock on nearest in tick loop
            familiar.actionTimer = 3.0; // Beam lasts 3s
            familiar.action = "attacking";
            room.broadcastNearby(message.targetX, message.targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "gordon_annihilation", targetX: message.targetX, targetZ: message.targetZ });
            break;

        case "legion_branch": 
            familiar.actionTimer = 10.0;
            familiar.action = "deployed";
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "shade_legion", targetX: player.x, targetZ: player.y });
            
            // Spawn hazard decoys
            for(let i = 0; i < 3; i++) {
                const h: Hazard = {
                    id: `shade_decoy_${Date.now()}_${i}`, type: "void_decoy", ownerId: client.sessionId,
                    x: player.x + (Math.random() - 0.5) * 10, y: player.y + (Math.random() - 0.5) * 10,
                    timer: 10.0, rank: 1
                };
                room.activeHazards.push(h);
            }
            break;

        case "arise_branch": 
            familiar.actionTimer = 15.0;
            familiar.action = "attacking";
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "monarch_arise", targetX: player.x, targetZ: player.y });
            
            // Spawn aggressive shadow minions based on player level/souls extracted
            const armySize = 3 + Math.floor(player.level / 5); 
            for(let i = 0; i < armySize; i++) {
                const h: Hazard = {
                    id: `shadow_minion_${Date.now()}_${i}`, type: "shadow_minion", ownerId: client.sessionId,
                    x: player.x + (Math.random() - 0.5) * 6, y: player.y + (Math.random() - 0.5) * 6,
                    timer: 15.0, rank: 1,
                    customData: { tickTimer: 1.0 }
                };
                room.activeHazards.push(h);
            }
            break;

        case "true_form_branch": 
            familiar.actionTimer = 15.0;
            familiar.action = "transformed";
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "stash_true_form", targetX: player.x, targetZ: player.y });
            break;

        case "lifeline_branch": 
            familiar.hp = 0; 
            familiar.actionTimer = 30.0; 
            player.hp = Math.min(player.maxHp, player.hp + (player.maxHp * 0.5));
            (player as any).tempShield = ((player as any).tempShield || 0) + (player.maxHp * 0.3);
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "pixie_lifeline", targetX: player.x, targetZ: player.y });
            break;

        case "transposition_branch": 
            const oldPX = player.x; const oldPY = player.y;
            player.x = familiar.x; player.y = familiar.y;
            familiar.x = oldPX; familiar.y = oldPY;
            player.rootedUntil = 0; 
            room.playerGrid.update(player, oldPX, oldPY, player.x, player.y);
            room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "gemini_swap", targetX: player.x, targetZ: player.y });
            break;

        case "kill_command_branch": 
            familiar.action = "attacking";
            familiar.targetX = message.targetX; 
            familiar.targetY = message.targetZ;
            room.broadcastNearby(message.targetX, message.targetZ, 60, "abilityUsed", { id: client.sessionId, abilityId: "beast_kill_command", targetX: message.targetX, targetZ: message.targetZ });
            break;

        case "aegis_branch": 
            familiar.isDetached = true;
            familiar.actionTimer = 5.0;
            familiar.x = player.x + (Math.cos((player as any).angle || 0) * 2); 
            familiar.y = player.y + (Math.sin((player as any).angle || 0) * 2);
            familiar.action = "deployed";
            room.broadcastNearby(familiar.x, familiar.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "seraph_aegis", targetX: familiar.x, targetZ: familiar.y });
            break;
            
        case "sky_lord_branch":
            if (familiar.action !== "mounted") {
                // Fallback if they press 9 while on the ground
                familiar.action = "mounted";
                (player as any).mountedFamiliarId = familiar.id;
                room.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: client.sessionId, abilityId: "gryphon_liftoff", targetX: player.x, targetZ: player.y });
            } else {
                // TIER 8: DIVEBOMB
                const rank = player.skillTree.activeAbilities.get("sky_lord_branch")?.upgrades.get("aerial_superiority")?.currentRank || 0;
                if (rank >= 3 && (player as any).isFlying) {
                    (player as any).isFlying = false;
                    (player as any).mountedFamiliarId = "";
                    familiar.action = "orbiting";
                    
                    // Massive Crash AoE
                    const dmg = 150 + (player.level * 5);
                    if (room.state.enemies) {
                        for (const e of room.enemyGrid.getNearby(player.x, player.y, 8.0)) {
                            if (distSq(e.x, e.y, player.x, player.y) <= 64.0) {
                                e.hp -= dmg;
                                e.stunnedTimer = Math.max(e.stunnedTimer, 3.0); // Stun on impact
                                room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: true });
                                if (e.hp <= 0) { room.awardPlayerKill(player, e.name); room.removeEnemy(e.id); }
                            }
                        }
                    }
                    room.broadcastNearby(player.x, player.y, 80, "abilityUsed", { id: client.sessionId, abilityId: "meteor_strike", targetX: player.x, targetZ: player.y });
                }
            }
            break;

        case "siege_engine_branch":
            if (familiar.action !== "mounted") {
                familiar.action = "mounted";
                (player as any).mountedFamiliarId = familiar.id;
            } else {
                // TIER 7: BATTERING RAM / TIER 9: EARTHSHAKER
                const rank = player.skillTree.activeAbilities.get("siege_engine_branch")?.upgrades.get("juggernaut")?.currentRank || 0;
                if (rank >= 2) {
                    const dmg = 100 + (player.level * 4);
                    const radius = rank >= 4 ? 8.0 : 4.0; // Earthshaker expands radius
                    
                    if (room.state.enemies) {
                        for (const e of room.enemyGrid.getNearby(player.x, player.y, radius)) {
                            if (distSq(e.x, e.y, player.x, player.y) <= (radius * radius)) {
                                e.hp -= dmg;
                                if (rank >= 4) e.rootedTimer = Math.max(e.rootedTimer, 4.0); // Root from Earthshaker
                                
                                room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: true });
                                if (e.hp <= 0) { room.awardPlayerKill(player, e.name); room.removeEnemy(e.id); }
                            }
                        }
                    }
                    const visual = rank >= 4 ? "seismic_slam" : "behemoth_battering_ram";
                    room.broadcastNearby(player.x, player.y, 80, "abilityUsed", { id: client.sessionId, abilityId: visual, targetX: message.targetX, targetZ: message.targetZ });
                }
            }
            break;
    }
}

/**
 * Main update loop for all familiars in a room.
 */
export function updateFamiliars(room: BaseRoom<any>, dt: number) {
    if (!room.state.familiars) return;

    room.state.familiars.forEach((familiar: FamiliarState, id: string) => {
        const owner = room.state.players.get(familiar.ownerId);
        
        if (!owner) {
            room.familiarGrid.remove(familiar, familiar.x, familiar.y);
            room.state.familiars.delete(id);
            return;
        }

        const oldX = familiar.x;
        const oldY = familiar.y;

        // --- DEATH & RESPAWN LOGIC (For physical familiars) ---
        if (familiar.hp <= 0 && familiar.type !== "apocalyptic_swarm" && familiar.type !== "orbital_arbiter" && familiar.type !== "void_servant") {
            familiar.actionTimer -= dt; 
            if (familiar.actionTimer <= 0) {
                familiar.hp = familiar.maxHp;
                familiar.x = owner.x;
                familiar.y = owner.y;
                familiar.action = "orbiting";
                room.broadcastNearby(familiar.x, familiar.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "familiar_respawn", targetX: familiar.x, targetZ: familiar.y });
            }
            return; 
        }

        // --- UNIVERSAL FOLLOW LOGIC (Orbit Owner) ---
        if (!familiar.isDetached && familiar.action === "orbiting") {
            const distSqCalc = distSq(familiar.x, familiar.y, owner.x, owner.y);
            if (distSqCalc > 12.25) { // 3.5^2
                const angle = Math.atan2(owner.y - familiar.y, owner.x - familiar.x);
                const spd = distSqCalc > 225 ? 18.0 : 8.0; // 15^2
                familiar.x += Math.cos(angle) * spd * dt;
                familiar.y += Math.sin(angle) * spd * dt;
            }
        }

        // --- PATHWAY-SPECIFIC UPDATES ---
        switch (familiar.type) {
            case "apocalyptic_swarm": updateColinLogic(room, familiar, owner, dt); break;
            case "orbital_arbiter": updateGordonLogic(room, familiar, owner, dt); break;
            case "void_servant": updateShadeLogic(room, familiar, owner, dt); break;
            case "shadow_monarch": updateMonarchLogic(room, familiar, owner, dt); break;
            case "dragon_hoarder": updateStashLogic(room, familiar, owner, dt); break;
            case "symbiotic_spirit": updatePixieLogic(room, familiar, owner, dt); break;
            case "astral_reflection": updateGeminiLogic(room, familiar, owner, dt); break;
            case "primal_beast": updateBeastLogic(room, familiar, owner, dt); break;
            case "radiant_seraph": updateSeraphLogic(room, familiar, owner, dt); break;
            case "storm_gryphon": updateGryphonLogic(room, familiar, owner, dt); break;
            case "ironclad_behemoth": updateBehemothLogic(room, familiar, owner, dt); break;
        }

        // Update Spatial Grid for Enemy AI targeting
        if (oldX !== familiar.x || oldY !== familiar.y) {
            room.familiarGrid.update(familiar, oldX, oldY, familiar.x, familiar.y);
        }
    });
}

/** 1. COLIN (SWARM) LOGIC **/
function updateColinLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("swarm_base")?.upgrades.get("endless_hunger")?.currentRank || 0;
    const branchRank = owner.skillTree.activeAbilities.get("devour_branch")?.upgrades.get("feast_of_blood")?.currentRank || 0;

    familiar.tickTimer -= dt;

    if (familiar.isDetached) {
        familiar.actionTimer -= dt;
        const dx = familiar.targetX - familiar.x;
        const dy = familiar.targetY - familiar.y;
        const distSqCalc = dx*dx + dy*dy;
        
        if (distSqCalc > 0.25) { // 0.5^2
            const dist = Math.sqrt(distSqCalc);
            familiar.x += (dx/dist) * 15.0 * dt;
            familiar.y += (dy/dist) * 15.0 * dt;
        }
        if (familiar.actionTimer <= 0) {
            familiar.isDetached = false;
            familiar.action = "orbiting";
            room.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "swarm_return", targetX: owner.x, targetZ: owner.y });
        }
    }

    if (familiar.tickTimer <= 0) {
        familiar.tickTimer = 1.0;
        const radius = familiar.isDetached ? 6.5 : (coreRank >= 3 ? 5.0 : 3.0);
        const radSq = radius * radius;
        let totalBites = 0;

        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, radius)) {
            if (distSq(e.x, e.y, familiar.x, familiar.y) <= radSq) {
                applyAffliction(e, "Bleed", 3.0, 10 + owner.level, 1.0, 1, 5);
                totalBites += 1;
                
                if (coreRank >= 4) applyAffliction(e, "Weakened", 2.0, 0, 0);
                if (familiar.isDetached) {
                    if (branchRank >= 1) applyAffliction(e, "Slow", 2.0, 0, 0);
                    if (branchRank >= 2) (e as any).armorShattered = true;
                    if (branchRank >= 4) owner.mp = Math.min(owner.maxMp, owner.mp + 5);
                    if (branchRank >= 5 && e.hp <= 20) (e as any).bloodExplosionOnDeath = true;
                }
            }
        }
        if (totalBites > 0 && coreRank >= 2) {
            const heal = totalBites * (coreRank >= 5 ? 8 : 4);
            owner.hp = Math.min(owner.maxHp, owner.hp + heal);
        }
    }
}

/** 2. GORDON (ARBITER) LOGIC **/
function updateGordonLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("arbiter_base")?.upgrades.get("cosmic_judgment")?.currentRank || 0;
    const branchRank = owner.skillTree.activeAbilities.get("annihilation_branch")?.upgrades.get("focused_beam")?.currentRank || 0;
    
    if (familiar.action === "attacking") {
        familiar.actionTimer -= dt;
        
        // Maintain beam on target
        if (familiar.currentTargetId && room.state.enemies) {
            const target = room.state.enemies.get(familiar.currentTargetId);
            if (target && target.hp > 0) {
                const dmg = 20 + owner.level; 
                target.hp -= dmg;
                if (branchRank >= 3) applyAffliction(target, "Weakened", 1.0, 0, 0);
                if (branchRank >= 5 && target.hp < target.maxHp * 0.1) target.hp = 0; 
                
                room.broadcastNearby(target.x, target.y, 40, "playerAttacked", { id: target.id, targetX: target.x, targetZ: target.y, damage: dmg, isDoT: true });
                if (target.hp <= 0) { room.awardPlayerKill(owner, target.name); room.removeEnemy(target.id); familiar.currentTargetId = ""; }
            }
        } else {
            // Find new target for beam using O(N) spatial lookup
            let bestE = null; let bestDSq = 400.0; // 20.0^2
            for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 20.0)) {
                const dSq = distSq(familiar.x, familiar.y, e.x, e.y);
                if (dSq < bestDSq) { bestDSq = dSq; bestE = e; }
            }
            if (bestE) familiar.currentTargetId = bestE.id;
        }

        if (familiar.actionTimer <= 0) {
            familiar.action = "orbiting";
            familiar.currentTargetId = "";
        }
        return;
    }

    familiar.tickTimer -= dt;
    if (familiar.tickTimer <= 0) {
        familiar.tickTimer = coreRank >= 3 ? 3.5 : 5.0;
        
        let bestE = null; let bestDSq = 324.0; // 18.0^2
        for (const e of room.enemyGrid.getNearby(owner.x, owner.y, 18.0)) {
            const dSq = distSq(owner.x, owner.y, e.x, e.y);
            if (dSq < bestDSq) { bestDSq = dSq; bestE = e; }
        }

        if (bestE) {
            const dmg = 35 + (owner.level * 3);
            bestE.hp -= dmg;
            if (coreRank >= 5) applyAffliction(bestE, "Silence", 0.5, 0, 0);
            room.broadcastNearby(bestE.x, bestE.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "gordon_laser", targetX: bestE.x, targetZ: bestE.y });
            room.broadcastNearby(bestE.x, bestE.y, 40, "playerAttacked", { id: bestE.id, targetX: bestE.x, targetZ: bestE.y, damage: dmg });
            if (bestE.hp <= 0) { room.awardPlayerKill(owner, bestE.name); room.removeEnemy(bestE.id); }
        }
    }
}

/** 3. SHADE (VOID SERVANT) LOGIC **/
function updateShadeLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("shade_base")?.upgrades.get("shadow_meld")?.currentRank || 0;
    
    // Passive stealth if standing still
    if (coreRank >= 4) {
        if (owner.x === (owner as any).lastX && owner.y === (owner as any).lastY) {
            familiar.tickTimer += dt;
            if (familiar.tickTimer >= 3.0) (owner as any).stealthedUntil = Date.now() + 1000;
        } else {
            familiar.tickTimer = 0;
        }
        (owner as any).lastX = owner.x; (owner as any).lastY = owner.y;
    }
    
    if (familiar.action === "deployed") {
        familiar.actionTimer -= dt;
        if (familiar.actionTimer <= 0) familiar.action = "orbiting";
    }
}

/** 4. MONARCH (SHADOW ARMY) LOGIC **/
function updateMonarchLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    // Override direct command
    if (familiar.action === "attacking") {
        familiar.actionTimer -= dt;
        if (familiar.actionTimer <= 0) familiar.action = "orbiting";
        return;
    }

    // --- PASSIVE AI: Float around and attack ---
    familiar.tickTimer -= dt;
    let bestTarget: any = null;
    let minDistSq = 400.0; // 20 unit aggro radius

    if (room.state.enemies) {
        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 20.0)) {
            const dSq = distSq(familiar.x, familiar.y, e.x, e.y);
            if (dSq < minDistSq && e.hp > 0) {
                minDistSq = dSq;
                bestTarget = e;
            }
        }
    }

    if (bestTarget) {
        familiar.isDetached = true;
        const angle = Math.atan2(bestTarget.y - familiar.y, bestTarget.x - familiar.x);
        
        if (minDistSq > 9.0) { // Move to 3 units
            familiar.x += Math.cos(angle) * familiar.speed * dt;
            familiar.y += Math.sin(angle) * familiar.speed * dt;
        } else {
            if (familiar.tickTimer <= 0) {
                familiar.tickTimer = 2.0; 
                const dmg = 25 + owner.level;
                bestTarget.hp -= dmg;
                
                room.broadcastNearby(bestTarget.x, bestTarget.y, 40, "abilityUsed", { id: familiar.id, abilityId: "blood_harvest", targetX: bestTarget.x, targetZ: bestTarget.y });
                room.broadcastNearby(bestTarget.x, bestTarget.y, 40, "playerAttacked", { id: bestTarget.id, targetX: bestTarget.x, targetZ: bestTarget.y, damage: dmg });
                
                if (bestTarget.hp <= 0) { 
                    room.awardPlayerKill(owner, bestTarget.name); 
                    room.removeEnemy(bestTarget.id); 
                }
            }
        }
    } else {
        familiar.isDetached = false;
    }
}

/** 5. STASH (DRAGON HOARDER) LOGIC **/
function updateStashLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    if (familiar.action === "transformed") {
        familiar.actionTimer -= dt;
        familiar.tickTimer -= dt;

        // Auto-fire Dragon Breath while transformed!
        if (familiar.tickTimer <= 0) {
            familiar.tickTimer = 2.0; // Breathes fire every 2 seconds
            let hitSomething = false;
            
            if (room.state.enemies) {
                // Massive 8-unit frontal cone/radius
                for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 8.0)) {
                    if (distSq(familiar.x, familiar.y, e.x, e.y) <= 64.0) {
                        const dmg = 80 + (owner.level * 5); // Huge damage
                        e.hp -= dmg;
                        applyAffliction(e, "Bleed", 5.0, 20, 1.0, 1, 5); // Melting armor/burn
                        room.broadcastNearby(e.x, e.y, 60, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg });
                        if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        hitSomething = true;
                    }
                }
            }

            if (hitSomething) {
                room.broadcastNearby(familiar.x, familiar.y, 80, "abilityUsed", { id: familiar.id, abilityId: "meteor_strike", targetX: familiar.x, targetZ: familiar.y });
            }
        }

        if (familiar.actionTimer <= 0) {
            familiar.action = "orbiting";
            room.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "stash_revert", targetX: owner.x, targetZ: owner.y });
        }
    }
}

/** 6. PIXIE (SYMBIOTIC SPIRIT) LOGIC **/
function updatePixieLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("pixie_base")?.upgrades.get("cleansing_light")?.currentRank || 0;
    familiar.tickTimer -= dt;

    if (familiar.tickTimer <= 0) {
        familiar.tickTimer = 5.0; // Pulse every 5s
        
        const mpHeal = coreRank >= 3 ? 10 : 5;
        owner.mp = Math.min(owner.maxMp, owner.mp + mpHeal);
        
        familiar.actionTimer += 5.0; 
        if (familiar.actionTimer >= 10.0) {
            familiar.actionTimer = 0;
            const rad = coreRank >= 4 ? 8.0 : 1.0;
            const radSq = rad * rad;
            for (const p of room.playerGrid.getNearby(owner.x, owner.y, rad)) {
                if (distSq(p.x, p.y, owner.x, owner.y) <= radSq) {
                    p.rootedUntil = 0; 
                    room.broadcastNearby(p.x, p.y, 60, "abilityUsed", { id: p.sessionId, abilityId: "pixie_cleanse", targetX: p.x, targetZ: p.y });
                }
            }
        }
    }
}

/** 7. GEMINI (ASTRAL REFLECTION) LOGIC **/
function updateGeminiLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    // The Gemini clone does NOT detach or hunt autonomously. 
    // It must remain in 'orbiting' mode so that BaseRoom.ts can trigger its attack mimicry.
    familiar.isDetached = false;
    familiar.action = "orbiting";
}

/** 8. BEAST (ANIMAL) LOGIC **/
export function updateBeastLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    // --- 1. ACTIVE COMMAND (SLOT 9: Kill Command) ---
    if (familiar.action === "attacking") {
        const dx = familiar.targetX - familiar.x;
        const dy = familiar.targetY - familiar.y;
        const dSq = dx * dx + dy * dy;
        
        if (dSq > 2.25) { // 1.5^2
            const d = Math.sqrt(dSq);
            familiar.x += (dx / d) * 12.0 * dt;
            familiar.y += (dy / d) * 12.0 * dt;
        } else {
            if (room.state.enemies) {
                for (const e of room.enemyGrid.getNearby(familiar.targetX, familiar.targetY, 2.0)) {
                    if (distSq(e.x, e.y, familiar.targetX, familiar.targetY) <= 4.0) { // 2.0^2
                        const dmg = 50 + (owner.level * 2);
                        e.hp -= dmg;
                        applyAffliction(e, "Bleed", 5.0, 10, 1.0, 1, 3);
                        
                        room.broadcastNearby(e.x, e.y, 40, "abilityUsed", { id: familiar.id, abilityId: "wolf_bite", targetX: e.x, targetZ: e.y });
                        room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg });
                        
                        if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                        break; 
                    }
                }
            }
            familiar.action = "orbiting"; 
        }
        return; // Skip passive AI while executing a direct command
    }

    // --- 2. PASSIVE AI: Auto-Hunt & Defend ---
    familiar.tickTimer -= dt;
    let bestTarget: any = null;
    let minDistSq = 400.0; // Expanded to 20 unit aggro radius

    // Scan for nearby enemies
    if (room.state.enemies) {
        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 20.0)) {
            const dSq = distSq(familiar.x, familiar.y, e.x, e.y);
            if (dSq < minDistSq && e.hp > 0) {
                minDistSq = dSq;
                bestTarget = e;
            }
        }
    }

    if (bestTarget) {
        // We found an enemy! Stop orbiting the player and chase it
        familiar.isDetached = true; 
        const angle = Math.atan2(bestTarget.y - familiar.y, bestTarget.x - familiar.x);
        
        if (minDistSq > 4.0) { // Further than 2 units away -> Move closer
            familiar.x += Math.cos(angle) * familiar.speed * dt;
            familiar.y += Math.sin(angle) * familiar.speed * dt;
        } else {
            // In melee range -> Attack!
            if (familiar.tickTimer <= 0) {
                familiar.tickTimer = 1.5; // Bites every 1.5 seconds
                const dmg = 15 + owner.level;
                bestTarget.hp -= dmg;
                
                // Play visual attack
                room.broadcastNearby(bestTarget.x, bestTarget.y, 40, "abilityUsed", { id: familiar.id, abilityId: "wolf_bite", targetX: bestTarget.x, targetZ: bestTarget.y });
                room.broadcastNearby(bestTarget.x, bestTarget.y, 40, "playerAttacked", { id: bestTarget.id, targetX: bestTarget.x, targetZ: bestTarget.y, damage: dmg });
                
                if (bestTarget.hp <= 0) { 
                    room.awardPlayerKill(owner, bestTarget.name); 
                    room.removeEnemy(bestTarget.id); 
                }
            }
        }
    } else {
        // No enemies nearby, return to following the player
        familiar.isDetached = false;
    }
}

/** 9. SERAPH (LIGHT) LOGIC **/
function updateSeraphLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("seraph_base")?.upgrades.get("holy_presence")?.currentRank || 0;
    
    // --- 1. ACTIVE COMMAND (SLOT 9: Aegis Wall) ---
    if (familiar.isDetached && familiar.action === "deployed") {
        familiar.actionTimer -= dt;
        if (familiar.actionTimer <= 0) {
            familiar.isDetached = false;
            familiar.action = "orbiting";
        }
        return; 
    }

    // --- 2. PASSIVE AI: Guardian Aggro ---
    familiar.actionTimer -= dt; // Used exclusively for attack cooldowns
    let bestTarget: any = null;
    let minDistSq = 225.0; // 15 unit detection range
    let actualDistSq = 225.0;

    if (room.state.enemies) {
        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 15.0)) {
            const dSq = distSq(familiar.x, familiar.y, e.x, e.y);
            // Seraph prioritizes Undead/Shadow enemies by halving their perceived distance
            const isUnholy = e.name.toLowerCase().match(/wraith|shadow|skeleton/);
            const priorityWeight = isUnholy ? 0.5 : 1.0; 
            
            if ((dSq * priorityWeight) < minDistSq && e.hp > 0) {
                minDistSq = dSq * priorityWeight;
                actualDistSq = dSq; // Retain actual physical distance for collision logic
                bestTarget = e;
            }
        }
    }

    if (bestTarget) {
        familiar.isDetached = true;
        const angle = Math.atan2(bestTarget.y - familiar.y, bestTarget.x - familiar.x);
        
        if (actualDistSq > 6.25) { // Move to within 2.5 units
            familiar.x += Math.cos(angle) * familiar.speed * dt;
            familiar.y += Math.sin(angle) * familiar.speed * dt;
            familiar.action = "chasing";
        } else {
            familiar.action = "attacking"; // Tells renderer to swing sword
            
            // Melee Sword Strike
            if (familiar.actionTimer <= 0) {
                familiar.actionTimer = 1.0; // Attacks every 1.0s
                const dmg = 30 + (owner.level * 2);
                bestTarget.hp -= dmg;
                
                // Visual Strike
                room.broadcastNearby(bestTarget.x, bestTarget.y, 40, "abilityUsed", { id: familiar.id, abilityId: "divine_smite", targetX: bestTarget.x, targetZ: bestTarget.y });
                room.broadcastNearby(bestTarget.x, bestTarget.y, 40, "playerAttacked", { id: bestTarget.id, targetX: bestTarget.x, targetZ: bestTarget.y, damage: dmg });
                
                if (bestTarget.hp <= 0) { 
                    room.awardPlayerKill(owner, bestTarget.name); 
                    room.removeEnemy(bestTarget.id); 
                }
            }
        }
    } else {
        familiar.isDetached = false;
        familiar.action = "orbiting";
    }

    // --- 3. HOLY PRESENCE AURA (Passive ticking) ---
    familiar.tickTimer -= dt; 
    if (familiar.tickTimer <= 0) {
        familiar.tickTimer = 1.0; 
        const rad = coreRank >= 3 ? 8.0 : 4.0;
        const radSq = rad * rad;
        
        const batchEvents: any[] = [];
        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, rad)) {
            if (distSq(e.x, e.y, familiar.x, familiar.y) <= radSq) {
                if (e.name.toLowerCase().match(/wraith|shadow|skeleton/)) {
                    e.hp -= 25;
                    if (coreRank >= 4) applyAffliction(e, "Slow", 1.0, 0, 0);
                    batchEvents.push({ id: e.id, targetX: e.x, targetZ: e.y, damage: 25, isDoT: true });
                    if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                }
            }
        }
        if (batchEvents.length > 0) room.broadcastNearby(familiar.x, familiar.y, 40, "combat_batch", batchEvents);

        if (coreRank >= 2) {
            for (const p of room.playerGrid.getNearby(familiar.x, familiar.y, rad)) {
                if (distSq(p.x, p.y, familiar.x, familiar.y) <= radSq) {
                    (p as any).holySpeedBuff = Date.now() + 1000;
                }
            }
        }
    }
}

/** 10. GRYPHON (STORM) LOGIC **/
function updateGryphonLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("gryphon_base")?.upgrades.get("wind_weaver")?.currentRank || 0;
    const skyRank = owner.skillTree.activeAbilities.get("sky_lord_branch")?.upgrades.get("aerial_superiority")?.currentRank || 0;
    
    familiar.tickTimer -= dt;

    // --- NEW: EYE OF THE STORM PASSIVE (When Flying) ---
    if (familiar.action === "mounted" && (owner as any).isFlying && skyRank >= 5 && familiar.tickTimer <= 0) {
        familiar.tickTimer = 1.0; // Tick damage every second
        if (room.state.enemies) {
            for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 10.0)) {
                if (distSq(e.x, e.y, familiar.x, familiar.y) <= 100.0) {
                    const dmg = 25 + owner.level;
                    e.hp -= dmg;
                    
                    // Suck enemies slightly toward the center of the hurricane
                    const pullDx = familiar.x - e.x; const pullDy = familiar.y - e.y;
                    const pullDist = Math.sqrt(pullDx*pullDx + pullDy*pullDy) || 1;
                    e.x += (pullDx / pullDist) * 1.5; 
                    e.y += (pullDy / pullDist) * 1.5;
                    
                    room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg });
                    if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                }
            }
        }
        return; // Skip normal razor-wind while generating a hurricane
    }

    // --- OLD: RAZOR WIND PASSIVE (When Orbiting/Grounded) ---
    if (familiar.tickTimer <= 0 && familiar.action !== "mounted") {
        familiar.tickTimer = 3.0; 
        let targetCount = coreRank >= 3 ? 3 : 1;
        let hits = 0;
        
        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 15.0)) {
            if (hits >= targetCount) break;
            if (distSq(e.x, e.y, familiar.x, familiar.y) <= 225.0) {
                const dmg = 25 + owner.level;
                e.hp -= dmg;
                room.broadcastNearby(e.x, e.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "gryphon_razor_wind", targetX: e.x, targetZ: e.y });
                room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg });
                if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                hits++;
            }
        }
    }
}

/** 11. BEHEMOTH (IRONCLAD) LOGIC **/
function updateBehemothLogic(room: BaseRoom<any>, familiar: FamiliarState, owner: PlayerState, dt: number) {
    const coreRank = owner.skillTree.activeAbilities.get("behemoth_base")?.upgrades.get("walking_fortress")?.currentRank || 0;
    const siegeRank = owner.skillTree.activeAbilities.get("siege_engine_branch")?.upgrades.get("juggernaut")?.currentRank || 0;
    
    familiar.tickTimer -= dt;

    // --- NEW: TRAMPLE PASSIVE (When Mounted) ---
    if (familiar.action === "mounted" && siegeRank >= 1 && familiar.tickTimer <= 0) {
        familiar.tickTimer = 0.5; // Tick damage twice a second
        if (room.state.enemies) {
            for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 2.5)) {
                if (distSq(e.x, e.y, familiar.x, familiar.y) <= 6.25) {
                    const dmg = 20 + owner.level;
                    e.hp -= dmg;
                    room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg });
                    if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
                }
            }
        }
        return; // Skip normal counter-attacks while mounted
    }

    // --- OLD: COUNTER-ATTACK PASSIVE (When Orbiting) ---
    if (familiar.tickTimer <= 0 && coreRank >= 3 && familiar.action === "orbiting") {
        familiar.tickTimer = 2.0; 
        for (const e of room.enemyGrid.getNearby(familiar.x, familiar.y, 3.0)) {
            if (distSq(e.x, e.y, familiar.x, familiar.y) <= 9.0) {
                const dmg = 40 + (owner.level * 2);
                e.hp -= dmg;
                room.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg });
                if (e.hp <= 0) { room.awardPlayerKill(owner, e.name); room.removeEnemy(e.id); }
            }
        }
    }
}