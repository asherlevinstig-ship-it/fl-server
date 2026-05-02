import { Client } from "@colyseus/core";
import { BaseRoom } from "./BaseRoom";
import { TownState } from "../schema/TownState";
import { generateMaze } from "../game/CollisionSystem";

export class MazeRoom extends BaseRoom<TownState> {
    maxClients = 20;

    private mazeDurationSeconds = 180;
    private mazeTimer = this.mazeDurationSeconds;
    private mazeFinished = false;

    async onCreate(options: any) {
        /**
         * IMPORTANT:
         * The state must exist BEFORE BaseRoom.onCreate() registers message handlers
         * and starts the simulation interval.
         */
        this.setState(new TownState());

        /**
         * BaseRoom.checkDynamicCollision() has a guard:
         * if (state.isMaze) return false;
         *
         * This prevents town buildings/scenery/decorations from blocking Maze movement.
         */
        (this.state as any).isMaze = true;

        /**
         * This must match MazeScene:
         * const mazeData = generateMaze(42);
         *
         * The client and server need the same generated collision data.
         */
        generateMaze(42);

        console.log("[MazeRoom] Maze colliders generated successfully on the server.");

        /**
         * Register BaseRoom handlers after state + maze flags are ready.
         * This gives MazeRoom the shared movement, attack, ability, interaction,
         * queue, and universal update logic.
         */
        await super.onCreate(options);

        console.log("[MazeRoom] BaseRoom handlers registered.");

        /**
         * Maze-specific timer.
         */
        this.clock.setInterval(() => {
            if (this.mazeFinished) return;

            this.mazeTimer--;

            this.broadcast("maze_timer_sync", {
                remainingSeconds: Math.max(0, this.mazeTimer)
            });

            if (this.mazeTimer <= 0) {
                this.failMaze();
            }
        }, 1000);
    }

    async onJoin(client: Client, options: any) {
        /**
         * Let BaseRoom create/load the PlayerState first.
         */
        await super.onJoin(client, options);

        const player = this.state.players.get(client.sessionId);

        if (!player) {
            console.warn("[MazeRoom] Player missing after super.onJoin", {
                sessionId: client.sessionId
            });
            return;
        }

        const oldX = player.x;
        const oldY = player.y;

        /**
         * Maze spawn.
         * Keep this away from generated walls.
         * Your generateMaze() already skips the central spawn radius, so 0,0 is fine.
         */
        player.x = 0;
        player.y = 0;

        player.hp = player.maxHp;
        player.mp = player.maxMp;
        player.hunger = player.maxHunger;

        /**
         * Reset movement acknowledgement for client prediction.
         * The client log showed lastProcessedInput stuck at 0.
         * Once BaseRoom.processMove() receives messages, this should increase.
         */
        player.lastProcessedInput = 0;

        /**
         * Update the spatial grid using the old position and new position.
         */
        this.playerGrid.update(player, oldX, oldY, player.x, player.y);

        /**
         * Send all coordinate aliases.
         * Some client code reads z first, then y.
         */
        client.send("forcePosition", {
            x: player.x,
            y: player.y,
            z: player.y
        });

        this.markPlayerDirty(client.sessionId);

        console.log("[MazeRoom] Player joined maze", {
            sessionId: client.sessionId,
            name: player.name,
            x: player.x,
            y: player.y,
            lastProcessedInput: player.lastProcessedInput
        });
    }

    protected universalUpdate(deltaTime: number) {
        /**
         * Keep all BaseRoom systems running:
         * - enemies
         * - hazards
         * - familiars
         * - dirty saves
         * - etc.
         */
        super.universalUpdate(deltaTime);

        if (this.mazeFinished) return;

        /**
         * Maze exit check.
         * Your MazeScene beacon is at 350,350:
         *
         * this.exitBeacon.position.set(350, 50, 350);
         */
        const exitX = 350;
        const exitY = 350;
        const exitRadiusSq = 10 * 10;

        for (const [sessionId, player] of this.state.players.entries()) {
            const dx = player.x - exitX;
            const dy = player.y - exitY;

            if (dx * dx + dy * dy <= exitRadiusSq) {
                this.completeMaze(sessionId);
                break;
            }
        }
    }

    private completeMaze(sessionId: string) {
        if (this.mazeFinished) return;
        this.mazeFinished = true;

        const player = this.state.players.get(sessionId);

        console.log("[MazeRoom] Maze escaped", {
            sessionId,
            name: player?.name
        });

        const client = this.clients.find(c => c.sessionId === sessionId);

        if (client) {
            client.send("maze_escaped", {
                text: "You escaped the Labyrinth!"
            });
        }

        /**
         * Let the client UI handle the zone switch after showing the result.
         * Main already listens for maze_escaped and switches to town.
         */
    }

    private failMaze() {
        if (this.mazeFinished) return;
        this.mazeFinished = true;

        console.log("[MazeRoom] Maze failed. Sending players to underworld.");

        for (const client of this.clients) {
            client.send("maze_failed", {
                message: "The Labyrinth consumed you..."
            });
        }

        /**
         * Main already listens for maze_failed and switches to underworld.
         */
    }

    async onLeave(client: Client, code?: number) {
        await super.onLeave(client, code);

        console.log("[MazeRoom] Player left maze", {
            sessionId: client.sessionId,
            code
        });
    }

    onDispose() {
        console.log("[MazeRoom] Disposed.");
    }
}