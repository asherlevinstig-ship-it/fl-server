import { Client } from "colyseus";
import { BaseRoom } from "./BaseRoom";
import { TownState } from "../schema/TownState";
import { generateMaze, distSq } from "../game/CollisionSystem";

export class MazeRoom extends BaseRoom<TownState> {
    maxClients = 40;
    private mazeEndTime: number = 0;
    private timeUpTriggered: boolean = false;

    async onCreate(options: any) {
        // 1. Initialize the universal physics, combat, and handlers from BaseRoom
        await super.onCreate(options); 
        
        // 2. Instantiate the State! BaseRoom relies on us to define the specific schema instance.
        this.setState(new TownState());
        this.state.zoneName = "The Labyrinth";

        // 3. Purge the invisible Town objects spawned by BaseRoom
        if (this.state.buildings) {
            this.state.buildings.clear();
        }
        if (this.state.scenery) {
            this.state.scenery.clear();
        }
        if (this.state.decorations) {
            this.state.decorations.clear();
        }

        // --- CRITICAL COLLISION FIX ---
        // Inject a flag so our CollisionSystem knows we are in the Maze
        // This stops checkDynamicCollision from throwing false positives on town assets
        (this.state as any).isMaze = true; 

        // Generate the exact same physical walls on the server using our fixed seed
        generateMaze(42);

        console.log("[MazeRoom] Maze colliders generated successfully on the server.");

        // 5. Set the 10-minute DOOM TIMER authoritatively on the server
        this.mazeEndTime = Date.now() + (10 * 60 * 1000);
        this.timeUpTriggered = false;

        // 6. Server-side tick to check for Time Out and Exit Proximity
        // Inherit BaseRoom's tick rate to prevent the movement validator from rejecting client packets.
        this.setSimulationInterval((deltaTime) => {
            super.universalUpdate(deltaTime); // Keep handling stamina/mana regen and hazards

            const now = Date.now();

            // Check if time is up
            if (!this.timeUpTriggered && now >= this.mazeEndTime) {
                this.timeUpTriggered = true;
                
                // Tell all connected clients they failed
                this.broadcast("maze_failed", { message: "⌛ TIME IS UP! The Labyrinth claims your soul..." });
                
                // Boot everyone and close the room instance after a short 3.5s delay
                // This gives the client time to read the message and transition to the Underworld
                setTimeout(() => {
                    this.disconnect(); 
                }, 3500); 
                
                return;
            }

            // 7. The Win Condition (Reaching the Exit Beacon at 350, 350)
            // By doing this in the update loop, we avoid overriding the "interact" message handler in BaseRoom
            if (!this.timeUpTriggered) {
                this.state.players.forEach((player, sessionId) => {
                    if (player.isSleeping || player.isMeditating || (player as any).hasEscaped) {
                        return;
                    }

                    // PERFORMANCE: Fast Squared Distance Check
                    // Using player.y because the Colyseus schema uses y for ground depth in a 2D grid
                    const distToExitSq = distSq(player.x, player.y, 350, 350);
                    
                    if (distToExitSq < 225.0) { // 15^2
                        // Lock state so they don't trigger this multiple times per second
                        (player as any).hasEscaped = true;

                        const client = this.clients.find(c => c.sessionId === sessionId);
                        if (client) {
                            // They made it! Give them a massive reward and let them escape
                            player.coins += 5000;
                            
                            // Grant some massive experience for beating the maze
                            player.experience += 2500;
                            
                            // Handle level up logic identically to BaseRoom
                            if (player.experience >= player.experienceToNextLevel) {
                                player.experience -= player.experienceToNextLevel;
                                player.level += 1;
                                player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.5);
                                player.skillTree.unspentAwakeningPoints += 1;
                                player.maxHp += 10; 
                                player.hp = player.maxHp;
                                player.maxMp += 10; 
                                player.mp = player.maxMp;
                                player.maxStamina += 10; 
                                player.stamina = player.maxStamina;
                                player.maxHunger += 10; 
                                player.hunger = player.maxHunger;
                            }

                            // Trigger the global broadcast to everyone in the maze
                            this.broadcast("server_event_log", {
                                html: `🏆 <b>${player.name}</b> has escaped The Labyrinth!`,
                                type: "event-win"
                            });

                            // Tell the specific client they won, which will trigger their scene transition
                            client.send("maze_escaped", { text: "🏆 YOU ESCAPED THE LABYRINTH!" });
                            
                            // PERFORMANCE: Batch save instead of blocking the thread
                            this.markPlayerDirty(sessionId);
                        }
                    }
                });
            }
        });
    }

    async onJoin(client: Client, options: any) {
        // Run the BaseRoom join logic (loads Firebase data, creates PlayerState, Unstuck mechanic, etc.)
        await super.onJoin(client, options);

        const player = this.state.players.get(client.sessionId);
        if (player) {
            // Reset escape flag for safety in case of reconnection loops
            (player as any).hasEscaped = false;

            // Explicitly clamp the player to 0,0 upon joining the maze instance
            const oldX = player.x;
            const oldY = player.y;

            player.x = 0;
            player.y = 0;

            // Sync the spatial grid to the new exact coordinates
            this.playerGrid.update(player, oldX, oldY, player.x, player.y);

            // Force the client's screen to completely sync to this exact valid starting coordinate
            client.send("forcePosition", {
                x: player.x,
                z: player.y
            });
        }

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
        
        // Ensure they get the correct time remaining upon reconnecting to the room
        const remainingMs = Math.max(0, this.mazeEndTime - Date.now());
        const remainingSeconds = Math.floor(remainingMs / 1000);
        client.send("maze_timer_sync", { remainingSeconds });
    }

    async onLeave(client: Client, code?: number) {
        // Fallback to the BaseRoom's pesrsistent saving and disconnect logic
        await super.onLeave(client, code);
    }
}