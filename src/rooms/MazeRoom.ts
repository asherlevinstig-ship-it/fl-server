import { Client } from "colyseus";
import { BaseRoom } from "./BaseRoom";
import { TownState } from "../schema/TownState";
import { generateMaze, distSq } from "../game/CollisionSystem";

export class MazeRoom extends BaseRoom<TownState> {
    maxClients = 40;
    private mazeEndTime: number = 0;
    private timeUpTriggered: boolean = false;

    async onCreate(options: any) {
        // Initialize the universal physics, combat, and handlers from BaseRoom
        await super.onCreate(options); 
        
        // We can reuse the TownState schema since it holds players, enemies, and loot perfectly
        this.setState(new TownState());

        // 1. Generate the exact same physical walls on the server using our fixed seed
        generateMaze(42);

        // 2. Set the 10-minute DOOM TIMER authoritatively on the server
        this.mazeEndTime = Date.now() + (10 * 60 * 1000);
        this.timeUpTriggered = false;

        // 3. Server-side tick to check for Time Out
        this.setSimulationInterval((deltaTime) => {
            super.universalUpdate(deltaTime); // Keep handling stamina/mana regen and hazards

            // If time is up, forcefully end the event!
            if (!this.timeUpTriggered && Date.now() >= this.mazeEndTime) {
                this.timeUpTriggered = true;
                
                // Tell all connected clients they failed
                this.broadcast("maze_failed", { message: "⌛ TIME IS UP! The Labyrinth claims your soul..." });
                
                // Boot everyone and close the room instance after a short 3.5s delay
                // This gives the client time to read the message and transition to the Underworld
                setTimeout(() => {
                    this.disconnect(); 
                }, 3500); 
            }
        }, 50); // PERFORMANCE: Locked to exactly 50ms (20 TPS) to match our architecture

        // 4. The Win Condition (Reaching the Exit Beacon at 350, 350)
        // Note: By defining 'interact' here, it overrides the loot interact from BaseRoom.
        // This is perfect for the Labyrinth where pressing F near the beacon is your only goal!
        this.onMessage("interact", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating) return;

            // PERFORMANCE: Fast Squared Distance Check
            const distToExitSq = distSq(player.x, player.y, 350, 350);
            
            if (distToExitSq < 225.0) { // 15^2
                // They made it! Give them a massive reward and let them escape
                player.coins += 5000;
                
                // Grant some massive experience for beating the maze
                player.experience += 2500;
                if (player.experience >= player.experienceToNextLevel) {
                    player.experience -= player.experienceToNextLevel;
                    player.level += 1;
                    player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.5);
                    player.skillTree.unspentAwakeningPoints += 1;
                    player.maxHp += 10; player.hp = player.maxHp;
                    player.maxMp += 10; player.mp = player.maxMp;
                    player.maxStamina += 10; player.stamina = player.maxStamina;
                    player.maxHunger += 10; player.hunger = player.maxHunger;
                }

                // PERFORMANCE: Batch save instead of blocking the thread
                (this as any).markPlayerDirty(client.sessionId);
                
                // Send them the victory message (which triggers the teleport back to Town)
                client.send("maze_escaped", { text: "🏆 YOU ESCAPED THE LABYRINTH!" });
            }
        });
    }

    async onJoin(client: Client, options: any) {
        // Run the BaseRoom join logic (loads Firebase data, creates PlayerState, Unstuck mechanic, etc.)
        await super.onJoin(client, options);

        // Wait a tiny bit to ensure the client is fully registered before sending the timer
        setTimeout(() => {
            if (this.clients.includes(client)) {
                // Calculate EXACTLY how many seconds are left in the server's instance
                const remainingMs = Math.max(0, this.mazeEndTime - Date.now());
                const remainingSeconds = Math.floor(remainingMs / 1000);

                // Send this authoritative time to the specific player who just joined/reconnected
                client.send("maze_timer_sync", { remainingSeconds });
            }
        }, 500);
    }

    protected onClientReconnected(client: Client) {
        super.onClientReconnected(client);
        
        const remainingMs = Math.max(0, this.mazeEndTime - Date.now());
        const remainingSeconds = Math.floor(remainingMs / 1000);
        client.send("maze_timer_sync", { remainingSeconds });
    }

    // UPDATED: New Colyseus signature handling the disconnect code properly
    async onLeave(client: Client, code?: number) {
        await super.onLeave(client, code);
    }
}