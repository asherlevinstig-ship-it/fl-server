import { Client } from "colyseus";
import { BaseRoom } from "./BaseRoom";
import { TownState } from "../schema/TownState";

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

        // Custom PvP Handler for the Underworld
        this.onMessage("pvp_attack", (client, message: { targetX: number, targetZ: number }) => {
            const attacker = this.state.players.get(client.sessionId);
            if (!attacker || attacker.isSleeping || attacker.isMeditating) return;

            const targetX = message.targetX;
            const targetZ = message.targetZ;

            // Broadcast the sword slash animation to everyone
            this.broadcastNearby(targetX, targetZ, 50, "playerAttacked", { id: client.sessionId, targetX, targetZ });

            // Base damage scaled slightly by the attacker's level
            const damage = 35 + (attacker.level * 2); 
            const attackRadiusSq = 9.0; // 3.0^2

            // PERFORMANCE: Spatial Grid lookup instead of looping all 40 players
            for (const victim of this.playerGrid.getNearby(targetX, targetZ, 3.0)) {
                if (victim.sessionId === client.sessionId) continue; // Don't hit yourself

                if (distSq(victim.x, victim.y, targetX, targetZ) <= attackRadiusSq) {
                    victim.hp -= damage;
                    
                    // Broadcast damage numbers to the victim
                    this.broadcastNearby(victim.x, victim.y, 40, "playerAttacked", { id: victim.sessionId, targetX: victim.x, targetZ: victim.y, damage, isCrit: true });

                    if (victim.hp <= 0) {
                        this.handlePlayerDeath(victim, attacker);
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
                
                // ---> SERVER LOG 1: The trigger <---
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
                        // ---> SERVER LOG 2: The Timer Finishes <---
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

    // UPDATED: Standardized Colyseus signature forwarding the disconnect code
    async onLeave(client: Client, code?: number) {
        // Forward the disconnect code up to the BaseRoom for core state cleanup
        await super.onLeave(client, code);
    }

    private handlePlayerDeath(victim: any, killer: any | null) {
        // Unlock falling state
        (victim as any).isFalling = false;

        // BUG FIX: We MUST move their coordinates back to the platform immediately 
        // after the 4-second fall finishes. If we don't, the server will trigger them 
        // falling again on the next frame and interrupt the town teleport sequence.
        const oldX = victim.x;
        const oldY = victim.y;
        victim.x = 0;
        victim.y = 35;
        this.playerGrid.update(victim, oldX, oldY, victim.x, victim.y);

        // ---> SERVER LOG 3: Teleport Check <---
        console.log(`[SERVER-DROP] ${victim.sessionId} coordinates reset to Town Safe Zone (0, 35). Sent 'underworld_death'.`);

        // 1. The Penalty: Lose all items
        victim.inventory.clear();
        
        // 2. The Penalty: Lose a level and all current experience
        victim.level = Math.max(1, victim.level - 1);
        victim.experience = 0;
        victim.skillTree.unspentAwakeningPoints = Math.max(0, victim.skillTree.unspentAwakeningPoints - 1);
        
        // 3. Restore HP for when they respawn in town
        victim.hp = victim.maxHp;

        // PERFORMANCE: Batch save to prevent Firebase from stalling the combat tick
        (this as any).markPlayerDirty(victim.sessionId);

        // Tell the victim they died and send them to town
        const victimClient = this.clients.find(c => c.sessionId === victim.sessionId);
        if (victimClient) {
            // Force the client to update to the safe coordinates before triggering death
            victimClient.send("forcePosition", { x: victim.x, z: victim.y });
            victimClient.send("underworld_death", { message: "💀 The Void consumed you. You lost your inventory and a Level." });
        }

        // If another player pushed them or killed them, reward the killer and let them escape
        if (killer) {
            killer.coins += 5000;
            killer.experience += 2000;
            
            (this as any).markPlayerDirty(killer.sessionId);
            
            const killerClient = this.clients.find(c => c.sessionId === killer.sessionId);
            if (killerClient) {
                killerClient.send("underworld_escape", { message: "🩸 Blood Sacrificed! You escape the Underworld!" });
            }
        }
    }
}