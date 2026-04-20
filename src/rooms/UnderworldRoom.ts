import { Client } from "colyseus";
import { BaseRoom } from "./BaseRoom";
import { TownState } from "../schema/TownState";
import { ITEM_DB } from "../ItemDatabase"; // Required to calculate PvP weapon/armor stats

// --- PERFORMANCE: Fast Squared Distance Helper ---
function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

export class UnderworldRoom extends BaseRoom<TownState> {
    maxClients = 40;
    private platformRadiusSq = 300 * 300; 

    async onCreate(options: any) {
        await super.onCreate(options); 
        this.setState(new TownState());

        // --- THE FIX: Intercept standard attacks for PvP Combat ---
        this.onMessage("attack", (client, message: { targetX: number, targetZ: number }) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.isSleeping || attacker.isMeditating) return;

            // 1. Enforce Attack Cooldowns (so players can't spam click)
            const now = Date.now();
            const lastAttack = this.lastAttackTimes.get(client.sessionId) || 0;
            let speed = attacker.attackSpeed || 1;
            if ((attacker as any).attackSpeedBuff && Date.now() < (attacker as any).attackSpeedBuff) speed *= 1.5;
            const cooldownMs = 1000 / speed;

            if (now - lastAttack >= cooldownMs) {
                this.lastAttackTimes.set(client.sessionId, now);

                // Broadcast the sword slash animation to everyone nearby
                this.broadcastNearby(attacker.x, attacker.y, 50, "playerAttacked", { id: client.sessionId, targetX: message.targetX, targetZ: message.targetZ });

                // 2. Calculate Base Damage including Equipped Weapons
                let damage = 15 + (attacker.level * 2); 
                if (attacker.equippedItem && ITEM_DB[attacker.equippedItem]) {
                    damage += ITEM_DB[attacker.equippedItem]?.stats?.atk ?? 0;
                }

                const attackRadiusSq = 5.0; // Slightly generous PvP hitbox
                let hitSomething = false;

                // 3. PvP Collision Check (Scan the spatial grid for nearby players)
                for (const victim of this.playerGrid.getNearby(message.targetX, message.targetZ, 3.0)) {
                    if (victim.sessionId === client.sessionId || victim.hp <= 0) continue; 

                    if (distSq(victim.x, victim.y, message.targetX, message.targetZ) <= attackRadiusSq) {
                        hitSomething = true;
                        
                        // Calculate Victim's Armor Defense
                        let totalDef = 0;
                        const armorSlots = [victim.equipHead, victim.equipChest, victim.equipBack, victim.equipLegs, victim.equipFeet, victim.equipOffHand];
                        armorSlots.forEach(itemName => {
                            if (itemName && ITEM_DB[itemName]) totalDef += ITEM_DB[itemName].stats?.def ?? 0;
                        });
                        
                        // Apply mitigated damage (minimum 1 damage)
                        const finalDmg = Math.max(1, damage - totalDef);
                        victim.hp -= finalDmg;
                        
                        // Show damage numbers on the victim's head
                        this.broadcastNearby(victim.x, victim.y, 40, "playerAttacked", { id: victim.sessionId, targetX: victim.x, targetZ: victim.y, damage: finalDmg, isCrit: true });

                        // Check Win/Loss Condition
                        if (victim.hp <= 0) {
                            this.handlePlayerDeath(victim, attacker);
                        }
                    }
                }

                // 4. PvE Fallback (If you miss a player but hit a monster)
                if (!hitSomething && this.state.enemies) {
                    for (const enemy of this.enemyGrid.getNearby(message.targetX, message.targetZ, 2.0)) {
                        if (distSq(enemy.x, enemy.y, message.targetX, message.targetZ) <= 4.0) {
                            enemy.hp -= damage;
                            this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: damage, isCrit: false });
                            if (enemy.hp <= 0) {
                                this.awardPlayerKill(attacker, enemy.name);
                                this.removeEnemy(enemy.id);
                            }
                        }
                    }
                }
            }
        });
    }

    // Safely inject the falling-off-the-edge check into the main engine loop
    protected universalUpdate(deltaTime: number) {
        super.universalUpdate(deltaTime);

        for (const [sessionId, player] of this.state.players.entries()) {
            // If they are already locked into a falling state, ignore them
            if ((player as any).isFalling) continue;

            const distFromCenterSq = player.x * player.x + player.y * player.y;
            if (distFromCenterSq > this.platformRadiusSq) {
                
                console.log(`[SERVER-DROP] ${sessionId} crossed the edge! Pos: X:${player.x.toFixed(1)}, Z:${player.y.toFixed(1)}. Sending trigger_void_fall and starting 4s timer.`);

                // 1. Lock state to prevent infinite loops
                (player as any).isFalling = true;
                
                // 2. Tell the specific client to disable controls and trigger the cinematic dummy drop
                const client = this.clients.find(c => c.sessionId === sessionId);
                if (client) {
                    client.send("trigger_void_fall");
                }
                
                // 3. Let them fall for 4 full seconds before killing them and teleporting
                this.clock.setTimeout(() => {
                    if (this.state.players.has(sessionId)) {
                        console.log(`[SERVER-DROP] 4 seconds passed for ${sessionId}. Processing death and teleporting to town.`);
                        this.handlePlayerDeath(player, null);
                    }
                }, 4000);
            }
        }
    }

    async onJoin(client: Client, options: any) {
        await super.onJoin(client, options);
        
        const player = this.state.players.get(client.sessionId);
        if (player) {
            // Spawn the player safely outside the center Sacrificial Altar (Radius 28)
            const oldX = player.x;
            const oldY = player.y;
            
            player.x = 0;
            player.y = 35; 
            
            this.playerGrid.update(player, oldX, oldY, player.x, player.y);
            client.send("forcePosition", { x: player.x, z: player.y });
        }
    }

   // UPDATED: Must use code?: number
    async onLeave(client: Client, code?: number) {
        await super.onLeave(client, code);
    }

    private handlePlayerDeath(victim: any, killer: any | null) {
        // Unlock falling state
        (victim as any).isFalling = false;

        // Cache death location for dropping coins BEFORE resetting coordinates
        const deathX = victim.x;
        const deathZ = victim.y;

        // Reset the Victim to Town Spawn coordinates
        const oldX = victim.x;
        const oldY = victim.y;
        victim.x = 0;
        victim.y = 20; // Town Y spawn
        this.playerGrid.update(victim, oldX, oldY, victim.x, victim.y);

        // --- LOSER PENALTIES ---
        victim.inventory.clear(); // Lose all items
        victim.level = Math.max(1, victim.level - 1); // Lose a level
        victim.experience = 0;
        victim.skillTree.unspentAwakeningPoints = Math.max(0, victim.skillTree.unspentAwakeningPoints - 1);
        victim.hp = victim.maxHp; // Heal them so they aren't dead in town

        // Batch save to Firebase
        (this as any).markPlayerDirty(victim.sessionId);

        // Tell the victim they died and send them to town
        const victimClient = this.clients.find(c => c.sessionId === victim.sessionId);
        if (victimClient) {
            victimClient.send("forcePosition", { x: victim.x, z: victim.y });
            victimClient.send("underworld_death", { message: "💀 The Void consumed you. You lost your items and a Level." });
        }

        // --- VICTOR REWARDS & ESCAPE ---
        if (killer) {
            // 💥 DIABLO-STYLE LOOT EXPLOSION
            for(let i = 0; i < 5; i++) {
                (this as any).spawnDrop(deathX + (Math.random()-0.5)*3, deathZ + (Math.random()-0.5)*3, "Coin_1000");
            }

            killer.experience += 2000;
            
            // Reset the Killer to Town Spawn coordinates so they don't fall off upon loading town
            const kOldX = killer.x;
            const kOldY = killer.y;
            killer.x = 0;
            killer.y = 20; 
            this.playerGrid.update(killer, kOldX, kOldY, killer.x, killer.y);

            (this as any).markPlayerDirty(killer.sessionId);
            
            // Send killer to town (Victor keeps everything)
            const killerClient = this.clients.find(c => c.sessionId === killer.sessionId);
            if (killerClient) {
                killerClient.send("forcePosition", { x: killer.x, z: killer.y });
                killerClient.send("underworld_escape", { message: "🩸 Flawless Victory! You escape the Underworld." });
            }
        }
    }
}