import { Client } from "colyseus";
import { BaseRoom } from "./BaseRoom";
import { TownState } from "../schema/TownState";
import { ITEM_DB } from "../ItemDatabase"; 

function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

export class UnderworldRoom extends BaseRoom<TownState> {
    maxClients = 40;
    private platformRadiusSq = 300 * 300; 

    async onCreate(options: any) {
        // Change A: Set state first so BaseRoom handlers and intervals have access to it
        this.setState(new TownState());
        await super.onCreate(options); 

        this.onMessage("attack", (client, message: { targetX: number, targetZ: number }) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.isSleeping || attacker.isMeditating) return;

            const now = Date.now();
            const lastAttack = this.lastAttackTimes.get(client.sessionId) || 0;
            let speed = attacker.attackSpeed || 1;
            if ((attacker as any).attackSpeedBuff && Date.now() < (attacker as any).attackSpeedBuff) speed *= 1.5;
            const cooldownMs = 1000 / speed;

            if (now - lastAttack >= cooldownMs) {
                this.lastAttackTimes.set(client.sessionId, now);

                this.broadcastNearby(attacker.x, attacker.y, 50, "playerAttacked", { id: client.sessionId, targetX: message.targetX, targetZ: message.targetZ });

                let damage = 15 + (attacker.level * 2); 
                if (attacker.equippedItem && ITEM_DB[attacker.equippedItem]) {
                    damage += ITEM_DB[attacker.equippedItem]?.stats?.atk ?? 0;
                }

                const attackRadiusSq = 5.0; 
                let hitSomething = false;

                for (const victim of this.playerGrid.getNearby(message.targetX, message.targetZ, 3.0)) {
                    if (victim.sessionId === client.sessionId || victim.hp <= 0) continue; 

                    if (distSq(victim.x, victim.y, message.targetX, message.targetZ) <= attackRadiusSq) {
                        hitSomething = true;
                        
                        let totalDef = 0;
                        const armorSlots = [victim.equipHead, victim.equipChest, victim.equipBack, victim.equipLegs, victim.equipFeet, victim.equipOffHand];
                        armorSlots.forEach(itemName => {
                            if (itemName && ITEM_DB[itemName]) totalDef += ITEM_DB[itemName].stats?.def ?? 0;
                        });
                        
                        const finalDmg = Math.max(1, damage - totalDef);
                        victim.hp -= finalDmg;
                        
                        this.broadcastNearby(victim.x, victim.y, 40, "playerAttacked", { id: victim.sessionId, targetX: victim.x, targetZ: victim.y, damage: finalDmg, isCrit: true });

                        if (victim.hp <= 0) {
                            this.handlePlayerDeath(victim, attacker);
                        }
                    }
                }

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

    protected universalUpdate(deltaTime: number) {
        super.universalUpdate(deltaTime);

        for (const [sessionId, player] of this.state.players.entries()) {
            if ((player as any).isFalling) continue;

            const distFromCenterSq = player.x * player.x + player.y * player.y;
            if (distFromCenterSq > this.platformRadiusSq) {
                
                (player as any).isFalling = true;
                
                // Force lock WASD natively in BaseRoom so they can't walk on thin air
                player.rootedUntil = Date.now() + 5000;
                
                const client = this.clients.find(c => c.sessionId === sessionId);
                if (client) {
                    client.send("trigger_void_fall");
                }
                
                this.clock.setTimeout(() => {
                    if (this.state.players.has(sessionId)) {
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
           const oldX = player.x;
           const oldY = player.y;
           
           player.x = 0;
           player.y = 35; 
           
           player.hp = player.maxHp;
           player.mp = player.maxMp;
           player.hunger = player.maxHunger;
           
           this.playerGrid.update(player, oldX, oldY, player.x, player.y);
           
           // ✅ SAFELY DELAYED
           setTimeout(() => {
               if (this.clients.includes(client)) {
                   client.send("forcePosition", { x: player.x, z: player.y });
               }
           }, 500);
           
           (this as any).markPlayerDirty(client.sessionId);
       }
   }

   async onLeave(client: Client, code?: number) {
       await super.onLeave(client, code);
   }

    private async handlePlayerDeath(victim: any, killer: any | null) {
        (victim as any).isFalling = false;

        const distSqFromCenter = victim.x * victim.x + victim.y * victim.y;
        let dropX = victim.x;
        let dropZ = victim.y;

        // Pull the drop coordinate inside the platform so items don't fall in the void
        if (distSqFromCenter > (295 * 295)) {
            const angle = Math.atan2(victim.y, victim.x);
            dropX = Math.cos(angle) * 290; 
            dropZ = Math.sin(angle) * 290;
        }

        // Drop items
        if (victim.inventory) {
            victim.inventory.forEach((item: any, itemName: string) => {
                for (let i = 0; i < item.quantity; i++) {
                    (this as any).spawnDrop(
                        dropX + (Math.random() - 0.5) * 5, 
                        dropZ + (Math.random() - 0.5) * 5, 
                        itemName
                    );
                }
            });
        }

        const deathX = dropX;
        const deathZ = dropZ;

        // Penalties
        victim.inventory.clear(); 

        // Clear Worn Equipment
        victim.equippedItem = "";
        victim.equipHead = "";
        victim.equipChest = "";
        victim.equipBack = "";
        victim.equipLegs = "";
        victim.equipFeet = "";
        victim.equipOffHand = "";

        // Stat Penalty Sync
        if (victim.level > 1) {
            victim.level -= 1;
            victim.experience = 0;
            victim.experienceToNextLevel = Math.ceil(victim.experienceToNextLevel / 1.5);
            victim.maxHp = Math.max(100, victim.maxHp - 10);
            victim.maxMp = Math.max(100, victim.maxMp - 10);
            victim.maxStamina = Math.max(100, victim.maxStamina - 10);
            victim.maxHunger = Math.max(100, victim.maxHunger - 10);
        }
        victim.hp = victim.maxHp; 
        victim.skillTree.unspentAwakeningPoints = Math.max(0, victim.skillTree.unspentAwakeningPoints - 1);

        // Update DB save coordinates to Town (but DO NOT forcePosition them on the client yet!)
        const oldX = victim.x;
        const oldY = victim.y;
        victim.x = 0;
        victim.y = 20; 
        this.playerGrid.update(victim, oldX, oldY, victim.x, victim.y);

        (this as any).markPlayerDirty(victim.sessionId);

        // AWAIT FIRM DATABASE SAVE FIRST to prevent race conditions on reconnect
        await this.savePlayerToDB(victim.sessionId);

        // Change B: Send a single, combined death/teleport event with a delay
        const victimClient = this.clients.find(c => c.sessionId === victim.sessionId);
        if (victimClient) {
            victimClient.send("underworld_death", {
                message: "💀 The Void consumed you. You dropped your items and lost a Level.",
                zone: "town",
                delayMs: 1200
            });
        }

        if (killer) {
            for(let i = 0; i < 5; i++) {
                (this as any).spawnDrop(deathX + (Math.random()-0.5)*3, deathZ + (Math.random()-0.5)*3, "Coin_1000");
            }

            killer.experience += 2000;
            
            const kOldX = killer.x;
            const kOldY = killer.y;
            killer.x = 0;
            killer.y = 20; 
            this.playerGrid.update(killer, kOldX, kOldY, killer.x, killer.y);
            (this as any).markPlayerDirty(killer.sessionId);
            
            // Await the killer's save as well so they don't lose their 2000 XP / Items on transition
            await this.savePlayerToDB(killer.sessionId);

            // Change C: Send a single, combined escape/teleport event with a delay
            const killerClient = this.clients.find(c => c.sessionId === killer.sessionId);
            if (killerClient) {
                killerClient.send("underworld_escape", {
                    message: "🩸 Flawless Victory! You escape the Underworld.",
                    zone: "town",
                    delayMs: 1200
                });
            }
        }
    }
}