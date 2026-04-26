import config from "@colyseus/tools";
import express from "express";
import cors from "cors";
import path from "path";
import authRoutes from "./auth";

// --- CRITICAL FIX 1: INCREASE NETWORK BUFFER TO PREVENT STATE CORRUPTION ---
import { Encoder } from "@colyseus/schema";
Encoder.BUFFER_SIZE = 2048 * 1024; // Increased to 2MB to handle massive town states

// Temporary TS workaround for Colyseus 0.17 export typing mismatch
const { matchMaker } = require("colyseus") as { matchMaker: any };

// --- ROOM IMPORTS ---
import { TownRoom } from "./rooms/TownRoom";
import { MazeRoom } from "./rooms/MazeRoom";
import { UnderworldRoom } from "./rooms/UnderworldRoom";
import { BaseRoom } from "./rooms/BaseRoom";
import { DungeonRoom } from "./rooms/DungeonRoom";

// --- DATABASE ---
import "./db/firebase";

export default config({
  initializeGameServer: (gameServer) => {
    gameServer.define("town", TownRoom);
    gameServer.define("maze", MazeRoom);
    gameServer.define("underworld", UnderworldRoom);
    gameServer.define("dungeon", DungeonRoom);

    const EVENT_INTERVAL_MS = 30 * 60 * 1000;

    const AVAILABLE_EVENTS = [
      { name: "The Labyrinth", zone: "maze" },
      { name: "The Deep Dungeon", zone: "dungeon" }
    ];

    BaseRoom.nextEventTime = Date.now() + EVENT_INTERVAL_MS;
    BaseRoom.nextEventName = "The Labyrinth";
    BaseRoom.nextEventZone = "maze";

    setInterval(async () => {
      const activeEventName = BaseRoom.nextEventName;
      const activeEventZone = BaseRoom.nextEventZone;

      console.log(`🌟 GLOBAL EVENT STARTING: ${activeEventName} Opens!`);

      try {
        await matchMaker.createRoom(activeEventZone, {});
        
        // --- CRITICAL FIX 2: Safe broadcasting for remote room calls ---
        const activeRooms = await matchMaker.query({});
        for (const room of activeRooms) {
          if (room.name !== "maze" && room.name !== "underworld" && room.name !== "dungeon") {
            try {
                await matchMaker.remoteRoomCall(room.roomId, "triggerEventPull", [activeEventZone]);
            } catch (e) {} // Failsafe if room closed during iteration
          }
        }
      } catch (err) {
        console.error(`❌ Failed to execute global event ${activeEventName}:`, err);
      }

      const nextEv = AVAILABLE_EVENTS[Math.floor(Math.random() * AVAILABLE_EVENTS.length)];

      BaseRoom.nextEventName = nextEv.name;
      BaseRoom.nextEventZone = nextEv.zone;
      BaseRoom.nextEventTime = Date.now() + EVENT_INTERVAL_MS;

      try {
        const activeRooms = await matchMaker.query({});
        for (const room of activeRooms) {
          try {
              await matchMaker.remoteRoomCall(room.roomId, "syncGlobalEvent", [
                BaseRoom.nextEventName,
                BaseRoom.nextEventTime
              ]);
          } catch (e) {} // Failsafe if room closed during iteration
        }
      } catch (err) {
        console.error("❌ Failed to sync new event timer:", err);
      }
    }, EVENT_INTERVAL_MS);

    gameServer.onShutdown(async () => {
      console.log("⚠️ Server is shutting down! Colyseus is automatically kicking players and saving data...");
    });
  },

  initializeExpress: (app) => {
    // 1. The Bulletproof CORS configuration
    app.use(cors({
      origin: "*", // Accept requests from any domain (Vercel, Localhost, etc.)
      methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"]
    }));

    // 2. Explicitly intercept and approve all preflight requests
    app.options('*', cors());

    // 3. Parse JSON bodies (Must remain AFTER the CORS block)
    app.use(express.json());
    
    // --- Serve the admin dashboard from the public folder ---
    app.use(express.static(path.join(__dirname, "public")));
    
    // --- ADMIN API ROUTES ---
    app.post("/api/admin/update-player", async (req, res) => {
      const { adminToken, playerName, action, payload } = req.body;

      // 1. Verify Password
      if (adminToken !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ error: "Unauthorized: Invalid admin token." });
      }

      if (!playerName) {
        return res.status(400).json({ error: "Player name is required." });
      }

      try {
        const admin = require("firebase-admin");
        const db = admin.firestore();
        const playerRef = db.collection("players").doc(playerName);
        const doc = await playerRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: `Player '${playerName}' not found in database.` });
        }

        const playerData = doc.data();

        // 2. Handle specific admin actions
        if (action === "give_level") {
          await playerRef.update({
            level: (playerData.level || 1) + 1,
            hp: (playerData.maxHp || 100) + 10,
            maxHp: (playerData.maxHp || 100) + 10,
            mp: (playerData.maxMp || 100) + 10,
            maxMp: (playerData.maxMp || 100) + 10,
            "skillTree.unspentAwakeningPoints": (playerData.skillTree?.unspentAwakeningPoints || 0) + 1
          });
          return res.json({ success: true, message: `Granted 1 level to ${playerName}.` });
        }

        if (action === "reset_skills") {
          await playerRef.update({
            "skillTree.activeAbilities": {}, // Clears the object/map
            "skillTree.unspentAwakeningPoints": 5 + ((playerData.level || 1) - 1)
          });
          return res.json({ success: true, message: `Reset skills for ${playerName}.` });
        }

        if (action === "give_item") {
          const itemName = payload.itemName;
          const amount = parseInt(payload.amount, 10) || 1;
          
          let currentInventory = playerData.inventory || [];
          let itemFound = false;

          // Check if they already have it
          for (let i = 0; i < currentInventory.length; i++) {
            if (currentInventory[i].name === itemName) {
              currentInventory[i].quantity += amount;
              itemFound = true;
              break;
            }
          }

          // If not, add new item
          if (!itemFound) {
            currentInventory.push({
              name: itemName,
              quantity: amount,
              desc: "Granted by Admin."
            });
          }

          await playerRef.update({ inventory: currentInventory });
          return res.json({ success: true, message: `Gave ${amount}x ${itemName} to ${playerName}.` });
        }

        return res.status(400).json({ error: "Unknown action." });

      } catch (err) {
        console.error("Admin API Error:", err);
        return res.status(500).json({ error: "Internal server error." });
      }
    });

    // 4. Register your Auth routes
    app.use("/api", authRoutes);
  },

  beforeListen: () => {
    console.log("🚀 Server is preparing to listen...");
  }
});