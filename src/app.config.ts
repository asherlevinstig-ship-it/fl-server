import config from "@colyseus/tools";
import { matchMaker } from "colyseus";
import express from "express";
import cors from "cors";
import authRoutes from "./auth"; // <-- IMPORT YOUR NEW AUTH ROUTES

// --- ROOM IMPORTS ---
import { TownRoom } from "./rooms/TownRoom";
import { MazeRoom } from "./rooms/MazeRoom";
import { UnderworldRoom } from "./rooms/UnderworldRoom";
import { BaseRoom } from "./rooms/BaseRoom";
// import { FloorFieldRoom } from "./rooms/FloorFieldRoom";
import { DungeonRoom } from "./rooms/DungeonRoom"; 

// --- DATABASE ---
import "./db/firebase"; 

export default config({
  initializeGameServer: (gameServer) => {
    // 1. Register your rooms
    gameServer.define("town", TownRoom);
    gameServer.define("maze", MazeRoom);
    gameServer.define("underworld", UnderworldRoom);
    // gameServer.define("field", FloorFieldRoom);
    gameServer.define("dungeon", DungeonRoom);

    // 2. Setup the Master Global Event Scheduler
    const EVENT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

    // Define available events (zone string MUST match the room definitions above)
    const AVAILABLE_EVENTS = [
        { name: "The Labyrinth", zone: "maze" },
        { name: "The Deep Dungeon", zone: "dungeon" }
    ];

    // Initialize the very first event on server boot
    BaseRoom.nextEventTime = Date.now() + EVENT_INTERVAL_MS;
    BaseRoom.nextEventName = "The Labyrinth";
    BaseRoom.nextEventZone = "maze"; 

    // The Master Clock: Runs once every 30 minutes
    setInterval(async () => {
        const activeEventName = BaseRoom.nextEventName;
        const activeEventZone = BaseRoom.nextEventZone;

        console.log(`🌟 GLOBAL EVENT STARTING: ${activeEventName} Opens!`);

        try {
            // 1. Create the specific room for the event (maze or dungeon)
            await matchMaker.createRoom(activeEventZone, {});

            // 2. Query all active rooms on the server
            const activeRooms = await matchMaker.query({});
            
            for (const room of activeRooms) {
                // 3. Pull players from safe zones (like town or field) into the event
                if (room.name !== "maze" && room.name !== "underworld" && room.name !== "dungeon") {
                    // This triggers the triggerEventPull method inside BaseRoom
                    matchMaker.remoteRoomCall(room.roomId, "triggerEventPull", [activeEventZone]);
                }
            }
        } catch (err) {
            console.error(`❌ Failed to execute global event ${activeEventName}:`, err);
        }

        // 4. Randomly select the NEXT event for 30 minutes from now
        const nextEv = AVAILABLE_EVENTS[Math.floor(Math.random() * AVAILABLE_EVENTS.length)];
        
        BaseRoom.nextEventName = nextEv.name;
        BaseRoom.nextEventZone = nextEv.zone;
        BaseRoom.nextEventTime = Date.now() + EVENT_INTERVAL_MS;

        // 5. Broadcast the NEW upcoming event to all clients so their HUD updates
        try {
            const activeRooms = await matchMaker.query({});
            for (const room of activeRooms) {
                matchMaker.remoteRoomCall(room.roomId, "syncGlobalEvent", [BaseRoom.nextEventName, BaseRoom.nextEventTime]);
            }
        } catch (err) {
            console.error("❌ Failed to sync new event timer:", err);
        }

    }, EVENT_INTERVAL_MS);

    // --- GRACEFUL SHUTDOWN HOOK ---
    gameServer.onShutdown(async () => {
        console.log("⚠️ Server is shutting down! Colyseus is automatically kicking players and saving data...");
        // You don't need to call gracefullyShutdown() manually anymore, Colyseus does it for you.
        // It will trigger onLeave() in BaseRoom.ts, which saves the player to Firebase!
    });
  },

  initializeExpress: (app) => {
    // --- MOUNT AUTHENTICATION & API ROUTES HERE ---
    app.use(cors());
    app.use(express.json()); // Required to parse the JSON payloads from our client UI
    app.use("/api", authRoutes);
  },

  beforeListen: () => {
    console.log("🚀 Server is preparing to listen...");
  }
});