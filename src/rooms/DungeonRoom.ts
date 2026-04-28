import { Room, Client } from "@colyseus/core";
import { FloorFieldState } from "../schema/FloorFieldState";
import { PlayerState, QuestProgressState } from "../schema/PlayerState";
import { EnemyState, AfflictionState } from "../schema/EnemyState";
import { InventoryItemState } from "../schema/InventoryItemState";
import { ActiveAbility, SkillUpgrade } from "../schema/SkillState";
import { ITEM_DB } from "../ItemDatabase";
import { getSkillDef } from "../data/AbilityDatabase";
import { SpatialGrid, distSq } from "../game/CollisionSystem";
import { db } from "../db/firebase";

type MoveMessage = { x: number; y: number };
type DodgeMessage = { dx: number; dy: number };
type AttackMessage = { targetX: number; targetZ: number };
type AbilityMessage = {
    abilityId: string;
    targetX: number;
    targetZ: number;
    subType?: string;
};
type SprintMessage = { isSprinting: boolean };
type AuraStyleMessage = { style: string };

export class DungeonRoom extends Room {
    public state!: FloorFieldState;

    maxClients = 4;

    currentWave = 0;
    maxWaves = 5;
    isTransitioning = false;

    private bossMinionsSummoned = 0;
    private frameCount = 0;

    // --- TIMER LOGIC ---
    private dungeonTimer = 300; // 5 minutes (300 seconds)
    private isDungeonFailed = false;

    public playerGrid = new SpatialGrid<PlayerState>(20);
    public enemyGrid = new SpatialGrid<EnemyState>(20);

    public broadcastNearby(
        x: number,
        y: number,
        radius: number,
        messageType: string,
        data: any
    ) {
        const radiusSq = radius * radius;

        for (const p of this.playerGrid.getNearby(x, y, radius)) {
            if (distSq(x, y, p.x, p.y) <= radiusSq) {
                const client = this.clients.find((c) => c.sessionId === p.sessionId);
                if (client) {
                    client.send(messageType, data);
                }
            }
        }
    }

    onCreate(options: any) {
        console.log("DungeonRoom created!", options);
        
        this.setState(new FloorFieldState());

        this.onMessage("move", (client: Client, data: MoveMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const oldX = player.x;
            const oldY = player.y;

            player.x = data.x;
            player.y = data.y;

            this.playerGrid.update(player, oldX, oldY, player.x, player.y);
        });

        this.onMessage("dodge", (client: Client, data: DodgeMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const dodgeDist = 4.0;
            const oldX = player.x;
            const oldY = player.y;

            player.x += data.dx * dodgeDist;
            player.y += data.dy * dodgeDist;

            this.playerGrid.update(player, oldX, oldY, player.x, player.y);
        });

        this.onMessage("attack", (client: Client, data: AttackMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            this.broadcastNearby(data.targetX, data.targetZ, 50, "playerAttacked", {
                id: client.sessionId,
                targetX: data.targetX,
                targetZ: data.targetZ
            });

            let killedAny = false;
            const attackRangeSq = 9.0;
            
            // Factor in equipped weapon damage
            let damage = 25;
            if (player.equippedItem) {
                damage += ITEM_DB[player.equippedItem]?.stats?.atk ?? 0;
            }

            for (const enemy of this.enemyGrid.getNearby(player.x, player.y, 3.0)) {
                if (distSq(enemy.x, enemy.y, player.x, player.y) <= attackRangeSq) {
                    enemy.hp -= damage;

                    this.broadcastNearby(enemy.x, enemy.y, 50, "playerAttacked", {
                        targetX: enemy.x,
                        targetZ: enemy.y,
                        damage,
                        isCrit: Math.random() > 0.8
                    });

                    if (enemy.hp <= 0) {
                        this.enemyGrid.remove(enemy, enemy.x, enemy.y);
                        this.state.enemies.delete(enemy.id);
                        killedAny = true;
                    }
                }
            }

            if (killedAny) {
                this.checkWaveProgress();
            }
        });

        this.onMessage("set_aura_style", (client: Client, data: AuraStyleMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            player.auraStyle = data.style;
            player.isAuraActive = true;
        });

        this.onMessage("toggle_aura", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.isAuraActive = !player.isAuraActive;
            }
        });

        this.onMessage("setSprint", (client: Client, data: SprintMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            player.isSprinting = data.isSprinting;
            player.movementSpeed = data.isSprinting ? 18.0 : 12.0;
        });

        this.onMessage("useAbility", (client: Client, data: AbilityMessage) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;

            const skillDef = getSkillDef(data.abilityId);
            if (!skillDef) return;

            this.broadcastNearby(data.targetX, data.targetZ, 60, "abilityUsed", {
                id: client.sessionId,
                abilityId: data.abilityId,
                targetX: data.targetX,
                targetZ: data.targetZ,
                subType: data.subType
            });

            let radius = 3.0;
            let baseDamage = 0;
            let isTargetedAoE = false;

            if (
                data.abilityId === "meteor_strike" ||
                data.abilityId === "void_eruption" ||
                data.abilityId === "grand_cross"
            ) {
                radius = 6.5;
                baseDamage = 120;
                isTargetedAoE = true;
            } else if (
                data.abilityId === "seismic_slam" ||
                data.abilityId === "holy_nova" ||
                data.abilityId === "feast_of_absolution"
            ) {
                radius = 5.0;
                baseDamage = 60;
                isTargetedAoE = false;
            } else if (
                data.abilityId === "blood_harvest" ||
                data.abilityId === "sunder" ||
                data.abilityId === "divine_smite"
            ) {
                radius = 2.5;
                baseDamage = 85;
                isTargetedAoE = true;
            } else if (data.abilityId === "earth_spike") {
                radius = 2.0;
                baseDamage = 40;
                isTargetedAoE = true;
            } else if (
                data.abilityId === "healing_blossom" ||
                data.abilityId === "aura_of_purity"
            ) {
                player.hp = Math.min(player.maxHp, player.hp + 40);
                return;
            }

            if (baseDamage === 0) return;
            
            // Factor in weapons for abilities too
            if (player.equippedItem) {
                baseDamage += Math.floor((ITEM_DB[player.equippedItem]?.stats?.atk ?? 0) * 0.5);
            }

            const originX = isTargetedAoE ? data.targetX : player.x;
            const originZ = isTargetedAoE ? data.targetZ : player.y;
            const rSq = radius * radius;
            let killedAny = false;

            for (const enemy of this.enemyGrid.getNearby(originX, originZ, radius)) {
                if (distSq(enemy.x, enemy.y, originX, originZ) <= rSq) {
                    enemy.hp -= baseDamage;

                    if (data.abilityId === "blood_harvest" || data.abilityId === "sunder") {
                        if (enemy.afflictions) {
                            enemy.afflictions.set("Bleed", new AfflictionState());
                        }
                    }

                    if (
                        data.abilityId === "void_eruption" ||
                        data.abilityId === "feast_of_absolution"
                    ) {
                        if (enemy.afflictions) {
                            enemy.afflictions.set("Necrosis", new AfflictionState());
                        }
                    }

                    if (data.abilityId === "blinding_flare") {
                        enemy.stunnedTimer = 3.0;
                    }

                    if (
                        data.abilityId === "earth_spike" ||
                        data.abilityId === "umbral_snare"
                    ) {
                        enemy.rootedTimer = 3.0;
                    }

                    this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", {
                        targetX: enemy.x,
                        targetZ: enemy.y,
                        damage: baseDamage,
                        isCrit: Math.random() > 0.85
                    });

                    if (enemy.hp <= 0) {
                        this.enemyGrid.remove(enemy, enemy.x, enemy.y);
                        this.state.enemies.delete(enemy.id);
                        killedAny = true;
                    }
                }
            }

            if (killedAny) {
                this.checkWaveProgress();
            }
        });

        this.onMessage("toggle_meditate", (client: Client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.isMeditating = !player.isMeditating;
            }
        });

        this.setSimulationInterval((deltaTime) => this.update(deltaTime), 50);
        this.startNextWave();
    }

    async onJoin(client: Client, options: any) {
        const player = new PlayerState();
        player.name = options.name || "Hero";
        player.sessionId = client.sessionId;
        
        // Defaults
        player.x = 0; 
        player.y = 0;
        player.hp = 100; 
        player.maxHp = 100;

        // --- FETCH PLAYER DATA FROM FIREBASE ---
        try {
            const doc = await db.collection("players").doc(player.name).get();
            if (doc.exists) {
                const d = doc.data()!; 
                
                if (d.classId !== undefined) player.classId = d.classId;
                if (d.pathwayId !== undefined) player.pathwayId = d.pathwayId;
                if (d.utilityPathway !== undefined) player.utilityPathway = d.utilityPathway; 
                if (d.familiarPathway !== undefined) player.familiarPathway = d.familiarPathway; 
                
                if (d.gender !== undefined) player.gender = d.gender;
                if (d.skinColor !== undefined) player.skinColor = d.skinColor;
                if (d.hairStyle !== undefined) player.hairStyle = d.hairStyle;
                if (d.hairColor !== undefined) player.hairColor = d.hairColor;
                if (d.eyeColor !== undefined) player.eyeColor = d.eyeColor;

                if (d.rank !== undefined) player.rank = d.rank;
                if (d.level !== undefined) player.level = d.level;
                if (d.experience !== undefined) player.experience = d.experience;
                if (d.experienceToNextLevel !== undefined) player.experienceToNextLevel = d.experienceToNextLevel;
                
                // Retain Dungeon spawn points regardless of DB location
                player.x = 0; player.y = 0; 
                
                if (d.maxHp !== undefined) player.maxHp = d.maxHp;
                player.hp = player.maxHp; // Heal on enter dungeon
                
                if (d.maxMp !== undefined) player.maxMp = d.maxMp;
                player.mp = player.maxMp; 
                
                if (d.maxStamina !== undefined) player.maxStamina = d.maxStamina;
                player.stamina = player.maxStamina;
                
                if (d.maxHunger !== undefined) player.maxHunger = d.maxHunger;
                player.hunger = player.maxHunger;
                
                if (d.coins !== undefined) player.coins = d.coins;
                if (d.manaLevel !== undefined) player.manaLevel = d.manaLevel;
                if (d.auraStrength !== undefined) player.auraStrength = d.auraStrength;
                if (d.auraControl !== undefined) player.auraControl = d.auraControl;
                if (d.auraStyle !== undefined) player.auraStyle = d.auraStyle;
                
                if (d.equippedItem !== undefined) { 
                    const loaded = d.equippedItem; 
                    const def = ITEM_DB[loaded]; 
                    player.equippedItem = (def?.type === "armor" || def?.type === "cosmetic") ? "" : loaded; 
                }
                
                if (d.equipHead !== undefined) player.equipHead = d.equipHead; 
                if (d.equipChest !== undefined) player.equipChest = d.equipChest; 
                if (d.equipBack !== undefined) player.equipBack = d.equipBack; 
                if (d.equipLegs !== undefined) player.equipLegs = d.equipLegs; 
                if (d.equipFeet !== undefined) player.equipFeet = d.equipFeet; 
                if (d.equipOffHand !== undefined) player.equipOffHand = d.equipOffHand;
                
                // Hydrate Inventory
                if (d.inventory && Array.isArray(d.inventory)) { 
                    d.inventory.forEach((inv: any) => { 
                        const item = new InventoryItemState(); 
                        item.name = inv.name; 
                        item.quantity = inv.quantity; 
                        item.desc = inv.desc; 
                        player.inventory.set(inv.name, item); 
                    }); 
                }
                
                // Hydrate Skills & Abilities
                if (d.skillTree) {
                    player.skillTree.unspentEssencePoints = d.skillTree.unspentEssencePoints || 0; 
                    player.skillTree.unspentAwakeningPoints = d.skillTree.unspentAwakeningPoints || 0;
                    if (d.skillTree.unlockedPassives) { 
                        for (const [k, v] of Object.entries(d.skillTree.unlockedPassives)) {
                            player.skillTree.unlockedPassives.set(k, v as number); 
                        }
                    }
                    if (d.skillTree.activeAbilities) {
                        if (Array.isArray(d.skillTree.activeAbilities)) {
                            d.skillTree.activeAbilities.forEach((data: any) => {
                                const ability = new ActiveAbility(); 
                                ability.id = data.id; 
                                ability.baseLevel = data.baseLevel; 
                                ability.rank = data.rank || "Iron"; 
                                ability.level = data.level || 0; 
                                ability.proficiency = data.proficiency || 0.0; 
                                ability.unconsolidatedProficiency = data.unconsolidatedProficiency || 0.0;
                                
                                if (data.upgrades) { 
                                    for (const [upk, upv] of Object.entries(data.upgrades)) { 
                                        const up = upv as any; 
                                        const upgrade = new SkillUpgrade(); 
                                        upgrade.id = up.id; 
                                        upgrade.unlocked = up.unlocked; 
                                        upgrade.currentRank = up.currentRank; 
                                        upgrade.maxRank = up.maxRank; 
                                        ability.upgrades.set(upk, upgrade); 
                                    } 
                                }
                                player.skillTree.activeAbilities.set(data.abilityKey || data.id, ability);
                            });
                        }
                    }
                }
                
                // Hydrate Quests
                if (d.completedQuests) { 
                    d.completedQuests.forEach((qId: string) => player.completedQuests.push(qId)); 
                }
                
                if (d.activeQuests && Array.isArray(d.activeQuests)) {
                    d.activeQuests.forEach((data: any) => {
                        const qState = new QuestProgressState();
                        qState.questId = data.questId; 
                        qState.currentAmount = data.currentAmount; 
                        qState.isCompleted = data.isCompleted;
                        player.activeQuests.set(data.questId, qState);
                    });
                }
                
                // Hydrate Hotbar
                if (d.hotbar) {
                    for (const [slot, abilityId] of Object.entries(d.hotbar)) {
                        player.hotbar.set(slot, abilityId as string);
                    }
                }
            }
        } catch (err) {
            console.error("Error loading player from DB:", err);
        }

        // Apply bonus speed from gear
        let bonusSpd = 0; 
        const itemsToCheck = [player.equippedItem, player.equipHead, player.equipChest, player.equipBack, player.equipLegs, player.equipFeet, player.equipOffHand];
        itemsToCheck.forEach(name => { if(name) bonusSpd += ITEM_DB[name]?.stats?.spd ?? 0; });
        player.movementSpeed = 12.0 + bonusSpd; 

        this.state.players.set(client.sessionId, player);
        this.playerGrid.add(player, player.x, player.y);
        this.syncDungeonUI();
    }

    async onLeave(client: Client, code?: number) {
        const player = this.state.players.get(client.sessionId);

        if (player) {
            this.playerGrid.remove(player, player.x, player.y);
            await this.savePlayerToDB(player);
        }

        this.state.players.delete(client.sessionId);

        if (this.state.players.size === 0) {
            this.disconnect();
        }
    }

    // --- SAVE PROGRESS WHEN LEAVING DUNGEON ---
    private async savePlayerToDB(p: PlayerState) {
        if (!p) return;
        
        const inv: any[] = []; 
        p.inventory.forEach(item => inv.push({ name: item.name, quantity: item.quantity, desc: item.desc }));
        const passives: Record<string, number> = {}; 
        p.skillTree.unlockedPassives.forEach((v, k) => passives[k] = v);

        const abilitiesList: any[] = []; 
        p.skillTree.activeAbilities.forEach((a, k) => {
            const upgs: Record<string, any> = {}; 
            a.upgrades.forEach((u, uk) => upgs[uk] = { id: u.id, unlocked: u.unlocked, currentRank: u.currentRank, maxRank: u.maxRank });
            abilitiesList.push({ abilityKey: k, id: a.id, baseLevel: a.baseLevel, rank: a.rank, level: a.level, proficiency: a.proficiency, unconsolidatedProficiency: a.unconsolidatedProficiency, upgrades: upgs });
        });
        
        const savedActiveQuests: any[] = [];
        p.activeQuests.forEach((q, k) => { 
            savedActiveQuests.push({ questId: k, currentAmount: q.currentAmount, isCompleted: q.isCompleted }); 
        });

        const savedHotbar: Record<string, string> = {};
        p.hotbar.forEach((abilityId, slot) => savedHotbar[slot] = abilityId);
        
        try { 
            await db.collection("players").doc(p.name).set({ 
                hp: p.hp, mp: p.mp, stamina: p.stamina, hunger: p.hunger, coins: p.coins, 
                inventory: inv, equippedItem: p.equippedItem, equipHead: p.equipHead, equipChest: p.equipChest, equipBack: p.equipBack, equipLegs: p.equipLegs, equipFeet: p.equipFeet, equipOffHand: p.equipOffHand, 
                skillTree: { unspentEssencePoints: p.skillTree.unspentEssencePoints, unspentAwakeningPoints: p.skillTree.unspentAwakeningPoints, unlockedPassives: passives, activeAbilities: abilitiesList },
                activeQuests: savedActiveQuests,
                completedQuests: Array.from(p.completedQuests),
                hotbar: savedHotbar,
            }, { merge: true }); 
        } catch (err) {
            console.error("Failed to save player to DB:", err);
        }
    }

    private update(dt: number) {
        this.frameCount++;
        const dtSec = dt / 1000;

        // --- PROGRESS COUNTDOWN TIMER ---
        if (!this.isTransitioning && !this.isDungeonFailed) {
            this.dungeonTimer -= dtSec;

            // Sync the timer to the UI every 20 frames (roughly once a second)
            if (this.frameCount % 20 === 0) {
                this.syncDungeonUI();
            }

            // Time's up
            if (this.dungeonTimer <= 0) {
                this.triggerDungeonFail();
                return; // Prevent further enemy updates
            }
        }

        if (this.isTransitioning) return;

        this.state.enemies.forEach((enemy: EnemyState, id: string) => {
            if (enemy.hp <= 0) return;

            if (enemy.name === "Goblin King") {
                const hpPercent = enemy.hp / enemy.maxHp;

                if (hpPercent <= 0.6 && this.bossMinionsSummoned === 0) {
                    this.bossMinionsSummoned = 1;
                    this.broadcast("dungeon_announcement", {
                        text: "GOBLIN KING CALLS THE HORDE!"
                    });
                    this.spawnBossMinions(enemy.x, enemy.y, 3);
                } else if (hpPercent <= 0.3 && this.bossMinionsSummoned === 1) {
                    this.bossMinionsSummoned = 2;
                    this.broadcast("dungeon_announcement", {
                        text: "GOBLIN KING IS ENRAGED!"
                    });
                    enemy.speed = 12.0;
                    this.spawnBossMinions(enemy.x, enemy.y, 4);
                }
            }

            if (enemy.stunnedTimer > 0) {
                enemy.stunnedTimer -= dtSec;
                enemy.action = "stunned";
                return;
            }

            if (enemy.rootedTimer > 0) {
                enemy.rootedTimer -= dtSec;
            }

            let nearestPlayer: PlayerState | null = null;
            let minDistSq = Infinity;

            if (this.frameCount % 3 === 0) {
                this.state.players.forEach((player: PlayerState) => {
                    const dSq = distSq(player.x, player.y, enemy.x, enemy.y);
                    if (dSq < minDistSq) {
                        minDistSq = dSq;
                        nearestPlayer = player;
                    }
                });

                if (nearestPlayer) {
                    enemy.targetX = nearestPlayer.x;
                    enemy.targetY = nearestPlayer.y;
                }
            } else {
                if (enemy.targetX !== undefined && enemy.targetY !== undefined) {
                    minDistSq = distSq(enemy.targetX, enemy.targetY, enemy.x, enemy.y);
                } else {
                    enemy.action = "idle";
                    return;
                }
            }

            if (enemy.action === "telegraphing" || enemy.action === "recovering") {
                return;
            }

            const attackRange =
                enemy.name === "Goblin King" ? 4.5 : (enemy.attackRadius || 2.5);

            if (minDistSq <= attackRange * attackRange) {
                this.triggerEnemyAttack(enemy, id);
            } else if (enemy.rootedTimer <= 0) {
                enemy.action = "chasing";
                const speed = enemy.speed || 8;

                const angleToPlayer = Math.atan2(
                    enemy.targetY - enemy.y,
                    enemy.targetX - enemy.x
                );

                let moveVecX = Math.cos(angleToPlayer) * speed;
                let moveVecY = Math.sin(angleToPlayer) * speed;

                const separationRadiusSq = 2.25;
                const repulsionStrength = 8.0;

                if (this.frameCount % 2 === 0) {
                    for (const otherEnemy of this.enemyGrid.getNearby(enemy.x, enemy.y, 1.5)) {
                        if (id !== otherEnemy.id && otherEnemy.hp > 0) {
                            const dSq = distSq(enemy.x, enemy.y, otherEnemy.x, otherEnemy.y);

                            if (dSq < separationRadiusSq && dSq > 0.0001) {
                                const distToOther = Math.sqrt(dSq);
                                const pushAngle = Math.atan2(
                                    enemy.y - otherEnemy.y,
                                    enemy.x - otherEnemy.x
                                );
                                const pushForce = (1.5 - distToOther) * repulsionStrength;
                                moveVecX += Math.cos(pushAngle) * pushForce;
                                moveVecY += Math.sin(pushAngle) * pushForce;
                            }
                        }
                    }
                }

                const sqMag = moveVecX * moveVecX + moveVecY * moveVecY;
                if (sqMag > 0) {
                    const finalMagnitude = Math.sqrt(sqMag);
                    const oldX = enemy.x;
                    const oldY = enemy.y;

                    enemy.x += (moveVecX / finalMagnitude) * speed * dtSec;
                    enemy.y += (moveVecY / finalMagnitude) * speed * dtSec;

                    this.enemyGrid.update(enemy, oldX, oldY, enemy.x, enemy.y);
                }
            }
        });
    }

    // --- DUNGEON FAIL BEHAVIOR ---
    private triggerDungeonFail() {
        this.isDungeonFailed = true;
        this.isTransitioning = true; // Hard stop on enemies/waves

        this.broadcast("dungeon_announcement", {
            text: "TIME IS UP! THE UNDERWORLD CONSUMES YOU..."
        });

        // Give them 3 seconds to read their doom, then yeet to underworld
        this.clock.setTimeout(() => {
            this.state.players.forEach((player: any, sessionId: string) => {
                const client = this.clients.find((c) => c.sessionId === sessionId);
                if (client) {
                    client.send("close_all_ui");
                    client.send("server_event_teleport", { zone: "underworld" });
                }
            });
        }, 3000);
    }

    private triggerEnemyAttack(enemy: EnemyState, enemyId: string) {
        enemy.action = "telegraphing";

        const isBoss = enemy.name === "Goblin King";
        const hpPercent = enemy.hp / enemy.maxHp;
        const isEnraged = isBoss && hpPercent <= 0.3;

        let windUpTime = 0.6;
        let radius = 2.5;
        let attackType = "melee";
        let damage = enemy.damage || 15;

        if (isBoss) {
            const attackRoll = Math.random();

            if (attackRoll > 0.5) {
                attackType = "aoe";
                radius = 5.5;
                windUpTime = isEnraged ? 1.0 : 2.0;
                damage = isEnraged ? 70 : 50;
            } else {
                attackType = "melee";
                radius = 3.5;
                windUpTime = isEnraged ? 0.4 : 0.8;
                damage = isEnraged ? 45 : 35;
            }
        }

        this.broadcastNearby(enemy.x, enemy.y, 60, "enemyTelegraph", {
            id: enemyId,
            type: attackType,
            x: enemy.x,
            z: enemy.y,
            radius,
            time: windUpTime
        });

        this.clock.setTimeout(() => {
            if (!this.state.enemies.has(enemyId)) return;

            const currentEnemy = this.state.enemies.get(enemyId)!;
            currentEnemy.action = "recovering";

            this.broadcastNearby(currentEnemy.x, currentEnemy.y, 60, "enemyAttackExecuted", {
                id: enemyId,
                type: attackType,
                x: currentEnemy.x,
                z: currentEnemy.y,
                radius
            });

            const rSq = radius * radius;

            for (const player of this.playerGrid.getNearby(currentEnemy.x, currentEnemy.y, radius)) {
                if (distSq(player.x, player.y, currentEnemy.x, currentEnemy.y) <= rSq) {
                    
                    // Defense calculation
                    let finalD = damage;
                    let totalDef = 0;
                    const equippedArmor = [player.equipHead, player.equipChest, player.equipBack, player.equipLegs, player.equipFeet, player.equipOffHand];
                    equippedArmor.forEach(itemName => { if (itemName) totalDef += ITEM_DB[itemName]?.stats?.def ?? 0; });
                    finalD = Math.max(1, finalD - totalDef);
                    
                    player.hp -= finalD;

                    this.broadcastNearby(player.x, player.y, 40, "playerAttacked", {
                        id: player.sessionId,
                        targetX: player.x,
                        targetZ: player.y,
                        damage: finalD
                    });

                    if (player.hp <= 0) {
                        player.hp = player.maxHp; // Reset HP to prevent repeating death states
                        const deadClient = this.clients.find(c => c.sessionId === player.sessionId);
                        
                        if (deadClient) {
                            // Specifically trigger the fail state on the client who died
                            deadClient.send("dungeon_failed", {
                                message: "You were slain by the Horde..."
                            });
                        }
                        
                        // Move them far out of bounds so they stop taking continuous damage 
                        // while the 3.5-second client-side death UI is showing
                        const oldX = player.x;
                        const oldY = player.y;
                        player.x = -9999;
                        player.y = -9999;
                        this.playerGrid.update(player, oldX, oldY, player.x, player.y);
                    }
                }
            }

            this.clock.setTimeout(() => {
                if (this.state.enemies.has(enemyId)) {
                    this.state.enemies.get(enemyId)!.action = "chasing";
                }
            }, isEnraged ? 400 : 800);
        }, windUpTime * 1000);
    }

    private checkWaveProgress() {
        this.syncDungeonUI();

        if (this.state.enemies.size === 0 && !this.isTransitioning && !this.isDungeonFailed) {
            if (this.currentWave >= this.maxWaves) {
                this.isTransitioning = true;

                this.broadcast("dungeon_cleared", {
                    text: "DUNGEON CONQUERED! CLAIMING REWARDS..."
                });

                this.state.players.forEach((player: any, sessionId: string) => {
                    const client = this.clients.find((c) => c.sessionId === sessionId);
                    if (!client) return;

                    if (player.inventory && !player.inventory.has("Legendary Void Blade")) {
                        const itemDef = ITEM_DB["Legendary Void Blade"];
                        const newItem = new InventoryItemState();
                        newItem.name = "Legendary Void Blade";
                        newItem.quantity = 1;
                        newItem.desc = itemDef
                            ? itemDef.desc
                            : "An apocalyptic weapon forged from concentrated shadow essence. +150 ATK.";

                        player.inventory.set("Legendary Void Blade", newItem);

                        client.send("legendary_loot_acquired", {
                            itemName: "Legendary Void Blade",
                            icon: itemDef ? itemDef.icon : "🌌"
                        });
                    }
                    
                    // Instantly push the new item to the database so it's not lost on teleport
                    this.savePlayerToDB(player);
                });

                this.clock.setTimeout(() => {
                    this.broadcast("teleport_to_town");
                }, 5000);
            } else {
                this.startNextWave();
            }
        }
    }

    private startNextWave() {
        this.isTransitioning = true;
        this.currentWave++;
        this.bossMinionsSummoned = 0;

        this.broadcast("dungeon_announcement", {
            text: `WAVE ${this.currentWave} APPROACHES!`
        });

        this.syncDungeonUI();

        this.clock.setTimeout(() => {
            let playerX = 0;
            let playerZ = 0;

            if (this.state.players.size > 0) {
                const player = Array.from(this.state.players.values())[0] as PlayerState;
                playerX = player.x;
                playerZ = player.y;
            }

            const enemyCount = 3 + this.currentWave * 2;

            for (let i = 0; i < enemyCount; i++) {
                const enemy = new EnemyState();
                enemy.id = `goblin_${this.currentWave}_${i}`;

                const angle = Math.random() * Math.PI * 2;
                const radius = 4 + Math.random() * 3;
                enemy.x = playerX + Math.cos(angle) * radius;
                enemy.y = playerZ + Math.sin(angle) * radius;

                if (this.currentWave === this.maxWaves && i === 0) {
                    enemy.name = "Goblin King";
                    enemy.type = "goblin_king"; // Assigned type so the frontend builds the model
                    enemy.maxHp = 1500;
                    enemy.hp = 1500;
                    enemy.damage = 45;
                    enemy.speed = 6;
                } else {
                    enemy.name = "Cave Goblin";
                    enemy.type = "goblin"; // Assigned type so the frontend builds the model
                    enemy.maxHp = 100 + this.currentWave * 20;
                    enemy.hp = enemy.maxHp;
                    enemy.damage = 10 + this.currentWave * 2;
                    enemy.speed = 8 + Math.random() * 2;
                }

                this.state.enemies.set(enemy.id, enemy);
                this.enemyGrid.add(enemy, enemy.x, enemy.y);
            }

            this.isTransitioning = false;
            this.syncDungeonUI();
        }, 3000);
    }

    private spawnBossMinions(bossX: number, bossZ: number, count: number) {
        for (let i = 0; i < count; i++) {
            const minion = new EnemyState();
            minion.id = `goblin_minion_${Date.now()}_${i}`;

            const angle = Math.random() * Math.PI * 2;
            const radius = 3 + Math.random() * 2;

            minion.x = bossX + Math.cos(angle) * radius;
            minion.y = bossZ + Math.sin(angle) * radius;
            minion.name = "Cave Goblin";
            minion.type = "goblin"; // Assigned type
            minion.maxHp = 150;
            minion.hp = 150;
            minion.damage = 20;
            minion.speed = 9;

            this.state.enemies.set(minion.id, minion);
            this.enemyGrid.add(minion, minion.x, minion.y);
        }

        this.syncDungeonUI();
    }

    private syncDungeonUI() {
        this.broadcast("dungeon_sync", {
            wave: this.currentWave,
            maxWaves: this.maxWaves,
            enemiesLeft: this.state.enemies.size,
            // Relay the remaining time (ceilinged to avoid decimals on frontend UI)
            timeRemaining: Math.max(0, Math.ceil(this.dungeonTimer)) 
        });
    }

    onDispose() {
        console.log("DungeonRoom Disposed");
    }
}