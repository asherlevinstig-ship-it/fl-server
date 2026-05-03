import { Room, Client, CloseCode } from "@colyseus/core";
import { MapSchema, ArraySchema } from "@colyseus/schema";
import { PlayerState, QuestProgressState } from "../schema/PlayerState";
import { LootState } from "../schema/LootState"; 
import { ActiveAbility, SkillUpgrade } from "../schema/SkillState";
import { InventoryItemState } from "../schema/InventoryItemState";
import { EnemyState, AfflictionState } from "../schema/EnemyState";
import { SceneryState } from "../schema/SceneryState";
import { BuildingState } from "../schema/BuildingState";
import { DecorationState } from "../schema/DecorationState";
import { StoreState } from "../schema/StoreState";
import { FamiliarState } from "../schema/FamiliarState";
import { ITEM_DB } from "../ItemDatabase";
import { db } from "../db/firebase";

import { getSkillDef, getAbilityCategory } from "../data/AbilityDatabase";
import { handleAbility } from "../AbilityController";
import { syncFamiliars, updateFamiliars, handleFamiliarAbility } from "../FamiliarController";
import { setupTradeSystem } from "./TradeController";

// --- NEW CONTROLLERS ---
import { processHazards } from "./HazardController";
import { processAttack, processDodge, updateEnemies } from "./CombatController";
import { progressQuest as handleQuestProgress } from "./QuestController"; // Renamed to avoid collision

import { 
    WORLD_RADIUS,
    checkTownCollision, 
    checkMazeCollision,
    checkUnderworldCollision,
    checkDynamicCollision, 
    distToSegmentSquared,
    SpatialGrid,
    TOWN_COLLIDERS
} from "../game/CollisionSystem";

export function distSq(x1: number, y1: number, x2: number, y2: number): number {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

const MEDITATION_QUESTIONS = [
    { text: "A _ attack attempts to flood a server with useless traffic to crash it.", answer: "ddos" },
    { text: "Malicious software designed to disrupt or gain unauthorized access is called _.", answer: "malware" },
    { text: "_ is the process of scrambling data into an unreadable format using a key.", answer: "encryption" },
    { text: "A _-hat hacker exploits vulnerabilities maliciously for personal gain.", answer: "black" },
    { text: "An attack that secretly intercepts communication between two parties is a _-in-the-middle attack.", answer: "man" },
    { text: "Tricking someone into giving away personal information is known as _ engineering.", answer: "social" },
    { text: "A network security system that monitors and controls incoming traffic is a _.", answer: "firewall" }
];

const COMMUNION_QUESTIONS = [
    { question: "Which protocol securely encrypts web traffic?", options: ["HTTP", "FTP", "HTTPS", "SMTP"], answer: "HTTPS" },
    { question: "What malware replicates itself across networks automatically?", options: ["Virus", "Worm", "Trojan", "Spyware"], answer: "Worm" },
    { question: "Which attack secretly intercepts communication between two parties?", options: ["DDoS", "Phishing", "Man-in-the-Middle", "SQL Injection"], answer: "Man-in-the-Middle" },
    { question: "What is the process of scrambling data into an unreadable format?", options: ["Hashing", "Encoding", "Encryption", "Obfuscation"], answer: "Encryption" },
    { question: "What attack tricks users into giving away personal information?", options: ["Phishing", "Brute Force", "Eavesdropping", "Spoofing"], answer: "Phishing" },
    { question: "What security system monitors and controls incoming network traffic?", options: ["Antivirus", "Firewall", "VPN", "Proxy"], answer: "Firewall" }
];

export type MoveMessage = { x: number; y?: number; z?: number; seq?: number; };
export type DodgeMessage = { dx: number; dy?: number; dz?: number; };
export type AttackMessage = { targetX: number; targetZ: number; };

export type Hazard = {
    type: string;
    id: string;
    ownerId: string;
    x: number;
    y: number;
    timer: number;
    rank: number;
    customData?: any;
};

export interface IBaseState {
    players: MapSchema<PlayerState>;
    lootItems: MapSchema<LootState>;
    enemies?: MapSchema<EnemyState>;
    scenery?: MapSchema<SceneryState>;
    buildings?: MapSchema<BuildingState>;
    decorations?: MapSchema<DecorationState>;
    stores?: MapSchema<StoreState>;
    familiars?: MapSchema<FamiliarState>;
}

type QueuedAction = 
    | { type: "move", client: Client, data: MoveMessage }
    | { type: "attack", client: Client, data: AttackMessage }
    | { type: "dodge", client: Client, data: DodgeMessage }
    | { type: "ability", client: Client, data: any }
    | { type: "interact", client: Client };

export class BaseRoom<T extends IBaseState> extends Room<{ state: T }> {
    public state!: T; 
    public playerGrid = new SpatialGrid<PlayerState>(50);
    public enemyGrid = new SpatialGrid<EnemyState>(50);
    public sceneryGrid = new SpatialGrid<SceneryState>(50);
    public buildingGrid = new SpatialGrid<BuildingState>(50);
    public decoGrid = new SpatialGrid<DecorationState>(50);
    public familiarGrid = new SpatialGrid<FamiliarState>(50);
    
    public activeHazards: Hazard[] = [];
    
    protected lastMoveTimes = new Map<string, number>();
    public lastAttackTimes = new Map<string, number>();

    private actionQueue: QueuedAction[] = [];
    private dirtyPlayers = new Set<string>(); 

    public static availableEvents = [
        { name: "The Labyrinth", zone: "maze" },
        { name: "The Deep Dungeon", zone: "dungeon" }
    ];

    public static nextEventTime: number = Date.now() + (30 * 60 * 1000);
    public static nextEventName: string = "The Labyrinth"; 
    public static nextEventZone: string = "maze";
    
    public static isEventActive: boolean = false; 
    private hasTriggeredCurrentEvent = false;

    public activeTeams = new Map<number, { leader: string, members: Set<string> }>();

    public broadcastNearby(x: number, y: number, radius: number, messageType: string, data: any) {
        const radiusSq = radius * radius;
        for (const p of this.playerGrid.getNearby(x, y, radius)) {
            if (distSq(x, y, p.x, p.y) <= radiusSq) {
                const client = this.clients.find(c => c.sessionId === p.sessionId);
                if (client) client.send(messageType, data);
            }
        }
    }

    private getNextTeamId(): number {
        let id = 1;
        while (this.activeTeams.has(id)) {
            id++;
        }
        return id;
    }

    // --- WRAPPER EXPOSED FOR CONTROLLERS ---
    public progressQuest(player: PlayerState, type: string, targetId: string, amount: number, client: Client | undefined) {
        handleQuestProgress(this, player, type, targetId, amount, client);
    }

    public removePlayerFromTeam(sessionId: string, kicked: boolean = false) {
        const player = this.state.players.get(sessionId);
        if (!player || player.teamId === 0) return;

        const teamId = player.teamId;
        const team = this.activeTeams.get(teamId);
        
        if (team) {
            team.members.delete(sessionId);
            
            const client = this.clients.find(c => c.sessionId === sessionId);
            if (client) client.send("hud_message", kicked ? "You were kicked from the team." : "You left the team.");

            if (team.members.size === 0) {
                this.activeTeams.delete(teamId);
            } else if (team.leader === sessionId) {
                const newLeader = Array.from(team.members)[0];
                team.leader = newLeader;
                const newLeaderPlayer = this.state.players.get(newLeader);
                if (newLeaderPlayer) {
                    newLeaderPlayer.isTeamLeader = true;
                    const nlClient = this.clients.find(c => c.sessionId === newLeader);
                    if (nlClient) nlClient.send("hud_message", "You are now the team leader.");
                }
            }

            if (this.activeTeams.has(teamId)) {
                team.members.forEach(memberId => {
                    const memberClient = this.clients.find(c => c.sessionId === memberId);
                    if (memberClient) memberClient.send("hud_message", `${player.name} ${kicked ? 'was kicked' : 'left'}.`);
                });
            }
        }

        player.teamId = 0;
        player.isTeamLeader = false;
        
        this.markPlayerDirty(sessionId);
    }

    public addAbilityProficiency(player: PlayerState, abilityId: string, amount: number) {
        if (!player || !abilityId) return;
        
        let ability = player.skillTree.activeAbilities.get(abilityId);
        
        if (!ability) {
            const fundamentals = ["melee_combat", "evasion", "gathering"];
            if (fundamentals.includes(abilityId)) {
                ability = new ActiveAbility();
                ability.id = abilityId;
                ability.rank = "Iron";
                ability.level = 0;
                ability.proficiency = 0;
                ability.unconsolidatedProficiency = 0;
                player.skillTree.activeAbilities.set(abilityId, ability);
            } else {
                return; 
            }
        }

        if (!(ability.rank === "Diamond" && ability.level === 9)) {
            ability.unconsolidatedProficiency += amount;
        }
    }

    public awardPlayerKill(player: PlayerState, victimName?: string) {
        player.experience += 100;

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

        for (const h of this.activeHazards) {
            if (h.type === "wrath_aura" && h.ownerId === player.sessionId && h.rank >= 1) {
                h.timer += 2.0; 
            }
        }

        if (player.skillTree.activeAbilities.has("monarch_base")) {
            const capRank = player.skillTree.activeAbilities.get("monarch_base")?.upgrades.get("shadow_capacity")?.currentRank || 1;
            const maxSouls = capRank >= 4 ? 20 : (capRank >= 3 ? 10 : (capRank >= 2 ? 5 : 3));
            
            (player as any).shadowSouls = Math.min(((player as any).shadowSouls || 0) + 1, maxSouls);
        }

        if (victimName) {
            this.broadcast("server_event_log", {
                html: `⚔️ <b>${player.name}</b> defeated <b>${victimName}</b>.`,
                type: "event-kill"
            });

            const client = this.clients.find(c => c.sessionId === player.sessionId);
            if (client) {
                this.progressQuest(player, "kill", victimName, 1, client);
            }
        }

        this.markPlayerDirty(player.sessionId);
    }

    public isLocationInShadow(x: number, z: number, clientSessionId: string): boolean {
        for (const scenery of this.sceneryGrid.getNearby(x, z, 15.0)) {
            if (distSq(x, z, scenery.x, scenery.y) <= (scenery.scale * 7.0)**2) return true;
        }
        for (const bldg of this.buildingGrid.getNearby(x, z, 15.0)) {
            if (distSq(x, z, bldg.x, bldg.z) <= 144.0) return true;
        }
        const r = 4.0;
        for (const box of TOWN_COLLIDERS) {
            if (x + r > box.minX && x - r < box.maxX && z + r > box.minY && z - r < box.maxY) return true;
        }
        for (const enemy of this.enemyGrid.getNearby(x, z, 8.0)) {
            if (distSq(x, z, enemy.x, enemy.y) <= 16.0) return true;
        }
        for (const p of this.playerGrid.getNearby(x, z, 6.0)) {
            if (p.sessionId !== clientSessionId && distSq(x, z, p.x, p.y) <= 9.0) return true;
        }
        return false;
    }

    public removeEnemy(enemyId: string) {
        if (!this.state.enemies) return;
        const enemy = this.state.enemies.get(enemyId);
        if (enemy) {
            this.spawnDrop(enemy.x, enemy.y, "Coin_15");

            if (Math.random() > 0.7) {
                const drops = ["Minor Health Potion", "Crispy Apple", "Iron Sword", "Leather Boots", "Silk Bandana", "Mana Vial", "Bronze-Forged Battleaxe"];
                const dropName = drops[Math.floor(Math.random() * drops.length)];
                this.spawnDrop(enemy.x, enemy.y, dropName);
            }

            const specificDrops: Record<string, { name: string, chance: number }[]> = {
                "Dire Wolf": [{ name: "Dire Wolf Pelt", chance: 0.6 }],
                "Plague Toad": [{ name: "Plague Toad Skin", chance: 0.5 }],
                "Sand Crawler": [{ name: "Sand Crawler Chitin", chance: 0.5 }],
                "Frost Elemental": [{ name: "Frost Elemental Core", chance: 0.4 }],
                "Corrupted Ent": [{ name: "Ent Bark", chance: 0.5 }, { name: "Wood", chance: 0.8 }]
            };

            const dropsForEnemy = specificDrops[enemy.name];
            if (dropsForEnemy) {
                for (const potentialDrop of dropsForEnemy) {
                    if (Math.random() <= potentialDrop.chance) {
                        this.spawnDrop(enemy.x, enemy.y, potentialDrop.name);
                    }
                }
            }

            this.enemyGrid.remove(enemy, enemy.x, enemy.y);
            this.state.enemies.delete(enemyId);
        }
    }

    public spawnDrop(x: number, y: number, kind: string) {
        const drop = new LootState();
        drop.id = `drop_${Date.now()}_${Math.random()}`;
        drop.kind = kind;
        drop.x = x + (Math.random() - 0.5);
        drop.y = y + (Math.random() - 0.5);
        drop.isOpen = false; 
        
        this.state.lootItems.set(drop.id, drop);
        
        setTimeout(() => {
            if (this.state.lootItems.has(drop.id)) {
                this.state.lootItems.delete(drop.id);
            }
        }, 60000);
    }

    public triggerEventPull(targetZone: string) {
        this.broadcast("server_event_log", {
            html: `🔥 <b>${BaseRoom.nextEventName}</b> has opened! Check your invites.`,
            type: "event-info"
        });
        
        this.broadcast("event_invite", { 
            eventName: BaseRoom.nextEventName, 
            targetZone: targetZone 
        }); 
    }

    public syncGlobalEvent(name: string, targetEpochTime: number) {
        const remainingMs = Math.max(0, targetEpochTime - Date.now());
        this.broadcast("global_event_sync", { name, remainingMs });
    }

    async onCreate(options: any) {
        
        setupTradeSystem(this);

        setInterval(() => {
            const now = Date.now();
            const eventDurationMs = 5 * 60 * 1000; 

            if (now >= BaseRoom.nextEventTime && now < BaseRoom.nextEventTime + eventDurationMs) {
                BaseRoom.isEventActive = true;
                
                if (!this.hasTriggeredCurrentEvent) {
                    this.triggerEventPull(BaseRoom.nextEventZone);
                    this.hasTriggeredCurrentEvent = true;
                }
            } 
            else if (now >= BaseRoom.nextEventTime + eventDurationMs) {
                BaseRoom.isEventActive = false;
                this.hasTriggeredCurrentEvent = false; 

                BaseRoom.nextEventTime = now + (25 * 60 * 1000);
                const nextEvt = BaseRoom.availableEvents[Math.floor(Math.random() * BaseRoom.availableEvents.length)];
                BaseRoom.nextEventName = nextEvt.name;
                BaseRoom.nextEventZone = nextEvt.zone;

                this.syncGlobalEvent(BaseRoom.nextEventName, BaseRoom.nextEventTime);
            }
        }, 1000);

        setInterval(() => {
            if (this.dirtyPlayers.size > 0) {
                const toSave = Array.from(this.dirtyPlayers);
                this.dirtyPlayers.clear();
                
                toSave.forEach(sessionId => {
                    if (this.state.players.has(sessionId)) {
                        this.savePlayerToDB(sessionId);
                    }
                });
            }
        }, 15000); 

        this.setSimulationInterval((deltaTime) => {
            this.processActionQueue();
            this.universalUpdate(deltaTime);
        }, 50); 

        this.onMessage("updateAppearance", (client, message: { gender: string, skinColor: string, hairStyle: string, hairColor: string, eyeColor: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isSleeping && !player.isMeditating) {
                if (message.gender) player.gender = message.gender;
                if (message.skinColor) player.skinColor = message.skinColor;
                if (message.hairStyle) player.hairStyle = message.hairStyle;
                if (message.hairColor) player.hairColor = message.hairColor;
                if (message.eyeColor) player.eyeColor = message.eyeColor;
                
                this.markPlayerDirty(client.sessionId);
                client.send("hud_message", "Appearance updated!");
            }
        });

        this.onMessage("teleport", (client, message: { destination: string, x?: number, z?: number }) => {
            const p = this.state.players.get(client.sessionId);
            if (!p || p.isSleeping || p.isMeditating || Date.now() < p.rootedUntil) return;

            client.send("close_all_ui");
            client.send("server_event_teleport", { zone: message.destination, x: message.x, z: message.z });
        });

        this.onMessage("updateHotbar", (client, message: { slot: string, abilityId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.hotbar.set(message.slot, message.abilityId);
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("changeUtilityPathway", (client, message: { pathwayId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.utilityPathway = message.pathwayId;
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("changeFamiliarPathway", (client, message: { pathwayId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.familiarPathway = message.pathwayId;
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("move", (client, message: MoveMessage) => {
            this.actionQueue.push({ type: "move", client, data: message });
        });

        this.onMessage("dodge", (client, message: DodgeMessage) => {
            this.actionQueue.push({ type: "dodge", client, data: message });
        });
        
        this.onMessage("attack", (client, message: AttackMessage) => {
            this.actionQueue.push({ type: "attack", client, data: message });
        });

        this.onMessage("useAbility", (client, message) => {
            this.actionQueue.push({ type: "ability", client, data: message });
        });
        
        this.onMessage("interact", (client) => {
            this.actionQueue.push({ type: "interact", client });
        });

        this.onMessage("quest_action", (client, message: { actionId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating) return;

            if (message.actionId === "toggle_utility") {
                this.progressQuest(player, "action", "toggle_utility", 1, client);
            }
        });

        this.onMessage("setSprint", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isSleeping && !player.isMeditating && Date.now() >= player.rootedUntil) {
                player.isSprinting = !!(data.isSprinting && player.hunger > 0);
            }
        });

        this.onMessage("toggle_mount", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || Date.now() < player.rootedUntil) return;

            const familiarId = `fam_${client.sessionId}`;
            const familiar = this.state.familiars?.get(familiarId);

            if (!familiar) return;

            if ((player as any).mountedFamiliarId === familiarId) {
                (player as any).mountedFamiliarId = "";
                (player as any).isFlying = false;
                familiar.action = "orbiting";
                this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "dismount", targetX: player.x, targetZ: player.y });
            } else {
                if (familiar.type === "storm_gryphon" || familiar.type === "ironclad_behemoth" || familiar.type === "dragon_hoarder") {
                    const coreKey = familiar.type === "storm_gryphon" ? "gryphon_base" : (familiar.type === "ironclad_behemoth" ? "behemoth_base" : "stash_base");
                    const coreNode = player.skillTree.activeAbilities.get(coreKey);
                    let canMount = false;
                    if (coreNode) {
                        coreNode.upgrades.forEach(u => {
                            if (u.currentRank >= 5) canMount = true;
                        });
                    }
                    
                    if (canMount || (familiar.type === "dragon_hoarder" && familiar.action === "transformed")) {
                        (player as any).mountedFamiliarId = familiarId;
                        familiar.action = "mounted";
                        
                        const oldPlayerX = player.x;
                        const oldPlayerY = player.y;
                        const oldFamX = familiar.x;
                        const oldFamY = familiar.y;

                        player.x = familiar.x;
                        player.y = familiar.y;

                        this.playerGrid.update(player, oldPlayerX, oldPlayerY, player.x, player.y);
                        this.familiarGrid.update(familiar, oldFamX, oldFamY, familiar.x, familiar.y);

                        this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "mount_up", targetX: player.x, targetZ: player.y });
                    } else {
                        client.send("hud_message", "Familiar is not strong enough to carry you yet.");
                    }
                }
            }
        });

        this.onMessage("toggle_flight", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || (player as any).mountedFamiliarId === "") return;

            const familiar = this.state.familiars?.get((player as any).mountedFamiliarId);
            if (!familiar) return;

            if (familiar.type === "storm_gryphon" || familiar.type === "dragon_hoarder") {
                let canFly = false;
                const activeNode = player.skillTree.activeAbilities.get("sky_lord_branch") || 
                                   player.skillTree.activeAbilities.get("true_form_branch");
                
                if (activeNode) {
                    activeNode.upgrades.forEach((u: any) => {
                        if (u.currentRank >= 6) canFly = true;
                    });
                }

                if (familiar.type === "dragon_hoarder" && familiar.action === "transformed") canFly = true;

                if (canFly) {
                    (player as any).isFlying = !(player as any).isFlying;
                    this.markPlayerDirty(client.sessionId);
                    client.send("hud_message", (player as any).isFlying ? "Liftoff!" : "Landing...");
                } else {
                    client.send("hud_message", "Your mount hasn't mastered flight yet.");
                }
            }
        });

        this.onMessage("changePathway", (client, message: { pathwayId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                player.pathwayId = message.pathwayId;
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("upgradeSkill", (client, message: { abilityId: string, upgradeId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.skillTree.unspentAwakeningPoints <= 0) return;

            const abilityData = getSkillDef(message.abilityId);
            if (!abilityData || !abilityData.upgrades[message.upgradeId]) return;

            const category = getAbilityCategory(message.abilityId);
            let isLockedOut = false;
            if (category) {
                for (const [activeId, activeAbil] of player.skillTree.activeAbilities.entries()) {
                    if (activeId !== message.abilityId && getAbilityCategory(activeId) === category) {
                        let pointsSpent = false;
                        activeAbil.upgrades.forEach((u: any) => { if (u.currentRank > 0) pointsSpent = true; });
                        if (pointsSpent) isLockedOut = true;
                    }
                }
            }
            if (isLockedOut) return; 

            const maxRank = abilityData.upgrades[message.upgradeId].maxRank;
            let activeAbility = player.skillTree.activeAbilities.get(message.abilityId);
            if (!activeAbility) {
                const newAbility = new ActiveAbility();
                newAbility.id = message.abilityId; newAbility.baseLevel = 1;
                player.skillTree.activeAbilities.set(message.abilityId, newAbility);
                activeAbility = player.skillTree.activeAbilities.get(message.abilityId)!;
            }

            let skillUpgrade = activeAbility.upgrades.get(message.upgradeId);
            if (!skillUpgrade) {
                const newUpgrade = new SkillUpgrade();
                newUpgrade.id = message.upgradeId; newUpgrade.unlocked = true; newUpgrade.currentRank = 0; newUpgrade.maxRank = maxRank;
                activeAbility.upgrades.set(message.upgradeId, newUpgrade);
                skillUpgrade = activeAbility.upgrades.get(message.upgradeId)!;
            }

            if (skillUpgrade.currentRank >= maxRank) return;

            const rankHierarchy: Record<string, number> = { "Iron": 1, "Bronze": 2, "Silver": 3, "Gold": 4, "Diamond": 5 };
            if ((rankHierarchy[player.rank] || 1) < skillUpgrade.currentRank + 1) return; 

            player.skillTree.unspentAwakeningPoints -= 1;
            skillUpgrade.currentRank += 1;
            this.markPlayerDirty(client.sessionId);
            
            syncFamiliars(this);

            this.progressQuest(player, "action", "select_ability", 1, client);
        });

        this.onMessage("adminLevelUp", (client, message: any = {}) => {
            if (!(client as any).isAdmin) {
                client.send("hud_message", "Unauthorized access.");
                return;
            }
            const targetId = message.targetSessionId || client.sessionId;
            const player = this.state.players.get(targetId);
            if (!player) return;
            player.level += 1;
            player.skillTree.unspentAwakeningPoints += 1; 
            player.maxHp += 10; player.hp = player.maxHp;
            player.maxMp += 10; player.mp = player.maxMp;
            player.maxStamina += 10; player.stamina = player.maxStamina;
            player.maxHunger += 10; player.hunger = player.maxHunger;
            this.markPlayerDirty(targetId);
        });

        this.onMessage("adminResetSkills", (client, message: any = {}) => {
            if (!(client as any).isAdmin) {
                client.send("hud_message", "Unauthorized access.");
                return;
            }
            const targetId = message.targetSessionId || client.sessionId;
            const player = this.state.players.get(targetId);
            if (!player) return;
            player.skillTree.activeAbilities.clear();
            player.skillTree.unspentAwakeningPoints = 5 + (player.level - 1);
            this.activeHazards = this.activeHazards.filter(h => h.ownerId !== targetId);
            this.markPlayerDirty(targetId);
            syncFamiliars(this);
        });

        this.onMessage("adminTriggerEvent", (client) => {
            if (!(client as any).isAdmin) return;
            BaseRoom.nextEventTime = Date.now();
            this.syncGlobalEvent(BaseRoom.nextEventName, BaseRoom.nextEventTime);
        });

        this.onMessage("createTeam", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.teamId !== 0) return;

            const newTeamId = this.getNextTeamId();
            player.teamId = newTeamId;
            player.isTeamLeader = true;

            this.activeTeams.set(newTeamId, {
                leader: client.sessionId,
                members: new Set([client.sessionId])
            });

            this.markPlayerDirty(client.sessionId);
            client.send("hud_message", `Team ${newTeamId} formed!`);
        });

        this.onMessage("joinTeam", (client, message: { teamId: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.teamId !== 0) {
                client.send("hud_message", "You are already in a team.");
                return;
            }

            const team = this.activeTeams.get(message.teamId);
            if (!team) {
                client.send("hud_message", "Team does not exist.");
                return;
            }

            if (team.members.size >= 5) {
                client.send("hud_message", "Team is full (Max 5).");
                return;
            }

            team.members.add(client.sessionId);
            player.teamId = message.teamId;
            player.isTeamLeader = false;

            this.markPlayerDirty(client.sessionId);

            team.members.forEach(memberId => {
                const memberClient = this.clients.find(c => c.sessionId === memberId);
                if (memberClient) memberClient.send("hud_message", `${player.name} joined Team ${message.teamId}.`);
            });
        });

        this.onMessage("leaveTeam", (client) => {
            this.removePlayerFromTeam(client.sessionId);
        });

        this.onMessage("kickMember", (client, message: { targetSessionId: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.teamId === 0 || !player.isTeamLeader) return;

            const team = this.activeTeams.get(player.teamId);
            if (!team || !team.members.has(message.targetSessionId)) return;

            if (client.sessionId === message.targetSessionId) return; 

            this.removePlayerFromTeam(message.targetSessionId, true);
        });

       this.onMessage("quick_chat", (client, message: { channel: "local" | "team" | "global", msgId: string }) => {
            const p = this.state.players.get(client.sessionId);
            if (!p || p.isSleeping || p.isMeditating) return;

            const CHAT_PRESETS: Record<string, string> = {
                "1": "Hello!", "2": "Follow me!", "3": "I need help!", "4": "Enemies spotted!",
                "5": "Thank you!", "6": "Good job!", "7": "Wait here.", "8": "Run away!"
            };

            const text = CHAT_PRESETS[message.msgId];
            if (!text) return; 

            const outMsg = {
                senderId: client.sessionId,
                senderName: p.name,
                text: text,
                channel: message.channel,
                teamId: p.teamId 
            };

            if (message.channel === "team") {
                if (p.teamId > 0) {
                    const team = this.activeTeams.get(p.teamId);
                    if (team) {
                        team.members.forEach(mId => {
                            const c = this.clients.find(c => c.sessionId === mId);
                            if (c) c.send("chat_received", outMsg);
                        });
                    }
                } else {
                    client.send("hud_message", "You aren't in a team!");
                }
            } else if (message.channel === "global") {
                this.broadcast("chat_received", outMsg);
            } else {
                this.broadcastNearby(p.x, p.y, 40, "chat_received", outMsg);
            }

            this.progressQuest(p, "action", "use_chat", 1, client);
        });

        this.onMessage("equipItem", (client, message: { itemName: string }) => {
            const p = this.state.players.get(client.sessionId);
            if (!p || p.isSleeping || p.isMeditating) return;
            const def = ITEM_DB[message.itemName];
            if (!def || !p.inventory.has(message.itemName)) return;
            
            if (def.equipSlot === "head") p.equipHead = (p.equipHead === message.itemName) ? "" : message.itemName;
            else if (def.equipSlot === "chest") p.equipChest = (p.equipChest === message.itemName) ? "" : message.itemName;
            else if (def.equipSlot === "back") p.equipBack = (p.equipBack === message.itemName) ? "" : message.itemName;
            else if (def.equipSlot === "legs") p.equipLegs = (p.equipLegs === message.itemName) ? "" : message.itemName;
            else if (def.equipSlot === "feet") p.equipFeet = (p.equipFeet === message.itemName) ? "" : message.itemName;
            else if (def.equipSlot === "offhand") p.equipOffHand = (p.equipOffHand === message.itemName) ? "" : message.itemName;
            else if (def.type !== "armor" && def.type !== "cosmetic") p.equippedItem = (p.equippedItem === message.itemName) ? "" : message.itemName;
            
            this.markPlayerDirty(client.sessionId);
        });

        this.onMessage("useItem", (client, message: { itemName: string }) => {
            const p = this.state.players.get(client.sessionId);
            if (!p || p.isSleeping || p.isMeditating) return;
            const inv = p.inventory.get(message.itemName);
            
            if (inv && inv.quantity > 0) {
                const def = ITEM_DB[message.itemName];

                if (message.itemName === "Tome of Awakening") {
                    inv.quantity -= 1;
                    p.skillTree.unspentAwakeningPoints += 1;
                    this.broadcastNearby(p.x, p.y, 60, "server_event_log", {
                        html: `✨ <b>${p.name}</b> has absorbed the knowledge of an ancient Tome!`,
                        type: "event-info"
                    });
                    if (inv.quantity <= 0) {
                        if (p.equippedItem === message.itemName) p.equippedItem = "";
                        p.inventory.delete(message.itemName);
                    }
                    this.markPlayerDirty(client.sessionId);
                    return; 
                }

                if (message.itemName === "Tattered Map") {
                    inv.quantity -= 1;
                    
                    const signX = Math.random() > 0.5 ? 1 : -1;
                    const signZ = Math.random() > 0.5 ? 1 : -1;
                    const targetX = p.x + (signX * (1000 + Math.random() * 1000));
                    const targetZ = p.y + (signZ * (1000 + Math.random() * 1000));

                    const h: Hazard = {
                        id: `treasure_${Date.now()}`, type: "map_marker", ownerId: client.sessionId,
                        x: targetX, y: targetZ, timer: 3600.0, rank: 1,
                        customData: { isTreasure: true }
                    };
                    this.activeHazards.push(h);
                    client.send("spawnHazard", h);
                    client.send("hud_message", `Treasure located at X: ${Math.floor(targetX)}, Z: ${Math.floor(targetZ)}.`);
                    
                    if (inv.quantity <= 0) {
                        if (p.equippedItem === message.itemName) p.equippedItem = "";
                        p.inventory.delete(message.itemName);
                    }
                    this.markPlayerDirty(client.sessionId);
                    return; 
                }

                if (def?.type === "consumable" && def.stats) {
                    inv.quantity -= 1;
                    if (def.stats) {
                        p.hp = Math.min(p.maxHp, p.hp + (def.stats.hp ?? 0));
                        p.mp = Math.min(p.maxMp, p.mp + (def.stats.mp ?? 0));
                        const energyRestore = (def.stats.ap ?? 0) + (def.stats.hunger ?? 0);
                        p.hunger = Math.min(p.maxHunger, p.hunger + energyRestore);
                    }
                    if (message.itemName.match(/Apple|Meat|Bread|Food|Mushroom|Berry/)) p.hunger = Math.min(p.maxHunger, p.hunger + 40);
                    
                    p.stamina = p.hunger;

                    if (inv.quantity <= 0) {
                        if (p.equippedItem === message.itemName) p.equippedItem = "";
                        p.inventory.delete(message.itemName);
                    }
                }
            }
        });

        this.onMessage("depositChest", (client, message: { chestId: string, itemName: string }) => {
            const p = this.state.players.get(client.sessionId);
            const chest = this.state.decorations?.get(message.chestId);
            
            if (!p || !chest || p.isSleeping || p.isMeditating) return;
            if (distSq(p.x, p.y, chest.x, chest.y) > 16.0) return;

            const invItem = p.inventory.get(message.itemName);
            if (invItem && invItem.quantity > 0) {
                invItem.quantity -= 1;
                if (invItem.quantity <= 0) {
                    if (p.equippedItem === message.itemName) p.equippedItem = "";
                    p.inventory.delete(message.itemName);
                }

                if (!chest.inventory) chest.inventory = new MapSchema<InventoryItemState>();
                if (chest.inventory.has(message.itemName)) {
                    chest.inventory.get(message.itemName)!.quantity += 1;
                } else {
                    const newItem = new InventoryItemState();
                    newItem.name = invItem.name;
                    newItem.desc = invItem.desc;
                    newItem.quantity = 1;
                    chest.inventory.set(message.itemName, newItem);
                }
                
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("withdrawChest", (client, message: { chestId: string, itemName: string }) => {
            const p = this.state.players.get(client.sessionId);
            const chest = this.state.decorations?.get(message.chestId);
            
            if (!p || !chest || p.isSleeping || p.isMeditating || !chest.inventory) return;
            if (distSq(p.x, p.y, chest.x, chest.y) > 16.0) return;

            const chestItem = chest.inventory.get(message.itemName);
            if (chestItem && chestItem.quantity > 0) {
                chestItem.quantity -= 1;
                if (chestItem.quantity <= 0) chest.inventory.delete(message.itemName);

                if (p.inventory.has(message.itemName)) {
                    p.inventory.get(message.itemName)!.quantity += 1;
                } else {
                    const newItem = new InventoryItemState();
                    newItem.name = chestItem.name;
                    newItem.desc = chestItem.desc;
                    newItem.quantity = 1;
                    p.inventory.set(message.itemName, newItem);
                }
                
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("buyItem", (client, message: { storeId: string, itemName: string }) => {
            const p = this.state.players.get(client.sessionId);
            const store = this.state.stores?.get(message.storeId);
            
            if (!p || !store || p.isSleeping || p.isMeditating) return;
            if (distSq(p.x, p.y, store.x, store.y) > 36.0) return;

            const storeItem = store.inventory.get(message.itemName);
            if (!storeItem) return;

            const isOwned = !!store.ownerId;
            if (isOwned && storeItem.stock <= 0) return;

            if (p.coins >= storeItem.price) {
                p.coins -= storeItem.price;

                if (isOwned) {
                    storeItem.stock -= 1;
                    store.vault += storeItem.price;
                }

                if (p.inventory.has(message.itemName)) {
                    p.inventory.get(message.itemName)!.quantity += 1;
                } else {
                    const newItem = new InventoryItemState();
                    newItem.name = storeItem.name;
                    newItem.desc = storeItem.desc;
                    newItem.quantity = 1;
                    p.inventory.set(message.itemName, newItem);
                }

                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("buyStore", (client, message: { storeId: string }) => {
            const p = this.state.players.get(client.sessionId);
            const store = this.state.stores?.get(message.storeId);
            
            if (!p || !store || p.isSleeping || p.isMeditating) return;
            if (distSq(p.x, p.y, store.x, store.y) > 36.0) return;
            if (store.ownerId) return;

            const leaseCost = 1000;
            if (p.coins >= leaseCost) {
                p.coins -= leaseCost;
                store.ownerId = p.sessionId;
                store.ownerName = p.name;
                store.ownershipUntil = Date.now() + (14 * 24 * 60 * 60 * 1000);
                store.vault = 0;
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("collectVault", (client, message: { storeId: string }) => {
            const p = this.state.players.get(client.sessionId);
            const store = this.state.stores?.get(message.storeId);
            
            if (!p || !store || p.isSleeping || p.isMeditating) return;
            if (distSq(p.x, p.y, store.x, store.y) > 36.0) return;
            if (store.ownerId !== p.sessionId || store.vault <= 0) return;

            p.coins += store.vault;
            store.vault = 0;
            this.markPlayerDirty(client.sessionId);
        });

        this.onMessage("restockItem", (client, message: { storeId: string, itemName: string, amount: number }) => {
            const p = this.state.players.get(client.sessionId);
            const store = this.state.stores?.get(message.storeId);
            
            if (!p || !store || p.isSleeping || p.isMeditating) return;
            if (distSq(p.x, p.y, store.x, store.y) > 36.0) return;
            if (store.ownerId !== p.sessionId) return;

            const storeItem = store.inventory.get(message.itemName);
            if (!storeItem) return;

            const cost = storeItem.wholesalePrice * message.amount;
            if (p.coins >= cost) {
                p.coins -= cost;
                storeItem.stock += message.amount;
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("teleportToMarker", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating) return;
            const activeAbility = player.skillTree.activeAbilities.get("traveler_branch");
            const travRank = activeAbility?.upgrades.get("branch_progression")?.currentRank || 0;

            if (travRank >= 3) {
                const marker = this.activeHazards.find(h => h.type === "map_marker" && h.ownerId === client.sessionId);
                if (marker) {
                    const oldX = player.x; const oldY = player.y;
                    player.x = marker.x; player.y = marker.y;
                    this.playerGrid.update(player, oldX, oldY, player.x, player.y);
                    client.send("forcePosition", { x: marker.x, z: marker.y });
                    this.broadcastNearby(marker.x, marker.y, 40, "abilityUsed", { id: player.sessionId, abilityId: "teleport_warp", targetX: marker.x, targetZ: marker.y });
                }
            }
        });

        this.onMessage("wakeUp", (client) => {
            const p = this.state.players.get(client.sessionId);
            if (p && p.isSleeping) {
                p.isSleeping = false;
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("toggle_aura", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isSleeping && !player.isMeditating) {
                player.isAuraActive = !player.isAuraActive;
                if (player.isAuraActive) {
                    this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "aura_activate", targetX: player.x, targetZ: player.y });
                } else {
                    this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "aura_shatter", targetX: player.x, targetZ: player.y });
                }
            }
        });

        this.onMessage("set_aura_style", (client, message: { style: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (player && ["tyrant", "sanctuary", "void", "storm"].includes(message.style)) {
                player.auraStyle = message.style;
                player.isAuraActive = false; 
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("requestCommunion", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isSleeping || player.isMeditating || Date.now() < player.rootedUntil) return;
            if (this.activeHazards.some(h => h.type === "mana_pillar" && h.ownerId === client.sessionId)) return;

            const q = COMMUNION_QUESTIONS[Math.floor(Math.random() * COMMUNION_QUESTIONS.length)];
            const groupId = `communion_${Date.now()}`;
            const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
            const options = [...q.options].sort(() => Math.random() - 0.5);

            for (let i = 0; i < 4; i++) {
                const h: Hazard = {
                    id: `pillar_${groupId}_${i}`, type: "mana_pillar", ownerId: client.sessionId,
                    x: player.x + Math.cos(angles[i]) * 10.0, y: player.y + Math.sin(angles[i]) * 10.0,
                    timer: 30.0, rank: 1,
                    customData: { groupId: groupId, optionText: options[i], isCorrect: options[i] === q.answer, answer: q.answer }
                };
                this.activeHazards.push(h);
                client.send("spawnHazard", h);
            }
            client.send("showCommunionQuestion", { question: q.question });
            this.broadcastNearby(player.x, player.y, 40, "abilityUsed", { id: player.sessionId, abilityId: "communion_start", targetX: player.x, targetZ: player.y });
        });

        this.onMessage("toggle_meditate", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isSleeping && Date.now() >= player.rootedUntil) {
                player.isMeditating = !player.isMeditating;
                if (player.isMeditating) {
                    player.isSprinting = false; player.isAuraActive = false; 
                    const qIndex = Math.floor(Math.random() * MEDITATION_QUESTIONS.length);
                    client.send("meditation_question", { index: qIndex, text: MEDITATION_QUESTIONS[qIndex].text });
                }
                this.markPlayerDirty(client.sessionId);
            }
        });

        this.onMessage("submit_meditation", (client, message: { answer: string, index: number }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.isMeditating) return;
            const question = MEDITATION_QUESTIONS[message.index];
            if (question && message.answer.toLowerCase().trim() === question.answer) {
                player.mp = Math.min(player.mp + 25, player.maxMp);
                player.meditationCount += 1;

                let consolidatedText = "";
                const ranks = ["Iron", "Bronze", "Silver", "Gold", "Diamond"];
                const currentPlayerRankIndex = ranks.indexOf(player.rank);
                let abilitiesAtNextRank = 0; 
                
                player.skillTree.activeAbilities.forEach((ability, key) => {
                    if (ability.unconsolidatedProficiency > 0) {
                        let convertAmount = Math.min(Math.max(15.0, ability.unconsolidatedProficiency * 0.2), ability.unconsolidatedProficiency);
                        if (ability.proficiency + convertAmount > 100) convertAmount = 100 - ability.proficiency;
                        
                        ability.unconsolidatedProficiency -= convertAmount;
                        ability.proficiency += convertAmount;

                        if (ability.proficiency >= 100) {
                            ability.proficiency = 0; ability.level += 1;
                            let rankedUp = false;
                            if (ability.level > 9) {
                                const currentRankIndex = ranks.indexOf(ability.rank);
                                if (currentRankIndex < ranks.length - 1) {
                                    ability.rank = ranks[currentRankIndex + 1]; ability.level = 0; rankedUp = true;
                                } else {
                                    ability.level = 9; ability.proficiency = 100; ability.unconsolidatedProficiency = 0; 
                                }
                            }
                            const displayName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            consolidatedText += rankedUp ? `\n🌟 ${displayName} evolved to ${ability.rank}!` : `\n✨ ${displayName} reached Level ${ability.level}!`;
                        }
                    }
                    if (ranks.indexOf(ability.rank) > currentPlayerRankIndex) abilitiesAtNextRank++;
                });

                if (abilitiesAtNextRank >= 6 && currentPlayerRankIndex < ranks.length - 1) {
                    player.rank = ranks[currentPlayerRankIndex + 1];
                    consolidatedText += `\n\n💥 SOUL BREAKTHROUGH! You have ascended to ${player.rank} Rank!`;
                    player.maxHp += 250; player.hp = player.maxHp;
                    player.maxMp += 250; player.mp = player.maxMp;
                    player.maxStamina += 150; player.stamina = player.maxStamina;
                    player.skillTree.unspentAwakeningPoints += 5;
                }

                client.send("meditation_result", { correct: true, text: `Focus deepened. +25 MP.${consolidatedText}` });
                setTimeout(() => {
                    const p = this.state.players.get(client.sessionId);
                    if (p && p.isMeditating) {
                        if (p.meditationCount % 5 === 0) client.send("meditation_upgrade_choice");
                        else {
                            const nextQ = Math.floor(Math.random() * MEDITATION_QUESTIONS.length);
                            client.send("meditation_question", { index: nextQ, text: MEDITATION_QUESTIONS[nextQ].text });
                        }
                    }
                }, 1500);
            } else {
                client.send("meditation_result", { correct: false, text: "Your focus wavers... Try again." });
            }
        });

        this.onMessage("choose_aura_upgrade", (client, message: { choice: string }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.isMeditating) return;
            if (message.choice === "strength") player.auraStrength += 1.0;
            else if (message.choice === "control") player.auraControl += 1.0;
            this.markPlayerDirty(client.sessionId);

            const nextQ = Math.floor(Math.random() * MEDITATION_QUESTIONS.length);
            client.send("meditation_question", { index: nextQ, text: MEDITATION_QUESTIONS[nextQ].text });
        });

        this.onMessage("cancelSpiritAnimal", (client) => {
            const hIdx = this.activeHazards.findIndex(h => h.type === "spirit_animal" && h.ownerId === client.sessionId);
            if (hIdx !== -1) this.activeHazards[hIdx].timer = 0; 
        });

        this.onMessage("wolfAttack", (client, message: { dx: number, dy: number }) => {
            const player = this.state.players.get(client.sessionId);
            const isWolf = player?.isSpiritAnimal || this.activeHazards.some(h => h.type === "spirit_animal" && h.ownerId === client.sessionId);
            
            if (!player || player.isSleeping || player.isMeditating || !isWolf || Date.now() < player.rootedUntil) return;

            const now = Date.now();
            if (now - (this.lastAttackTimes.get(client.sessionId) || 0) >= 600) {
                if (player.hunger < 0.2) return;

                player.hunger -= 0.2;
                player.stamina = player.hunger;
                this.lastAttackTimes.set(client.sessionId, now);

                const lungeDist = 2.0;
                const oldX = player.x; const oldY = player.y;
                player.x += (message.dx * lungeDist);
                player.y += (message.dy * lungeDist);
                this.playerGrid.update(player, oldX, oldY, player.x, player.y);

                const attackX = player.x + (message.dx * 1.5);
                const attackZ = player.y + (message.dy * 1.5);

                this.broadcastNearby(attackX, attackZ, 40, "abilityUsed", { id: client.sessionId, abilityId: "wolf_bite", targetX: attackX, targetZ: attackZ });

                let hitSomething = false;
                if (this.state.enemies) {
                    for (const enemy of this.enemyGrid.getNearby(attackX, attackZ, 3.5)) {
                        if (distSq(enemy.x, enemy.y, attackX, attackZ) <= 12.25) {
                            enemy.hp -= 25; hitSomething = true;
                            this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 25, isCrit: false });
                            if (enemy.hp <= 0) { this.awardPlayerKill(player, enemy.name); this.removeEnemy(enemy.id); }
                        }
                    }
                }
                if (hitSomething) this.addAbilityProficiency(player, "wolf_bite", 2.0);
            } else {
                client.send("forcePosition", { x: player.x, z: player.y });
            }
        });
    }

    private processActionQueue() {
        const queueSize = this.actionQueue.length;
        for (let i = 0; i < queueSize; i++) {
            const action = this.actionQueue.shift();
            if (!action) continue;

            const { type, client } = action;

            if (type === "move") {
                this.processMove(client, (action as any).data);
            } 
            else if (type === "dodge") {
                processDodge(this, client, (action as any).data);
            }
            else if (type === "attack") {
                processAttack(this, client, (action as any).data);
            }
            else if (type === "ability") {
                this.processAbility(client, (action as any).data);
            }
            else if (type === "interact") {
                this.processInteract(client);
            }
        }
    }

    private processMove(client: Client, message: MoveMessage) {
        const player = this.state.players.get(client.sessionId);
        
        if (!player || player.isSleeping || player.isMeditating || Date.now() < player.rootedUntil) {
            if (player) client.send("forcePosition", { x: player.x, z: player.y });
            return;
        }

        const targetX = message.x;
        const targetY = message.z !== undefined ? message.z : message.y;
        if (targetX === undefined || targetY === undefined) return;

        if (message.seq !== undefined) {
            (player as any).lastProcessedInput = message.seq;
        }

        const now = Date.now();
        let dt = 0.05; 
        
        if (this.lastMoveTimes.has(client.sessionId)) {
            const rawDt = (now - this.lastMoveTimes.get(client.sessionId)!) / 1000;
            if (rawDt <= 0.001) {
                dt = 0.016; 
            } else {
                dt = Math.max(0.016, Math.min(rawDt, 0.4)); 
            }
        }
        this.lastMoveTimes.set(client.sessionId, now);

        const isTown = this.roomName === "town" || this.constructor.name === "TownRoom";
        const isMaze = this.roomName === "maze" || this.constructor.name === "MazeRoom";
        const isUnderworld = this.roomName === "underworld" || this.constructor.name === "UnderworldRoom";

        const mountedFamiliarId = (player as any).mountedFamiliarId;
        if (mountedFamiliarId && mountedFamiliarId !== "") {
            const familiar = this.state.familiars?.get(mountedFamiliarId);
            if (familiar && familiar.hp > 0) {
                const isFlying = (player as any).isFlying;
                let nextX = targetX;
                let nextY = targetY;

                if (!isFlying) {
                    const hitTownX = isTown && checkTownCollision(nextX, player.y, 0.5);
                    const hitDynX = checkDynamicCollision(this.state, nextX, player.y, 0.5);
                    const hitMazeX = isMaze && checkMazeCollision(nextX, player.y, 0.5);
                    const hitUnderX = isUnderworld && checkUnderworldCollision(nextX, player.y, 0.5);
                    if (hitTownX || hitDynX || hitMazeX || hitUnderX) nextX = player.x;

                    const hitTownY = isTown && checkTownCollision(player.x, nextY, 0.5);
                    const hitDynY = checkDynamicCollision(this.state, player.x, nextY, 0.5);
                    const hitMazeY = isMaze && checkMazeCollision(player.x, nextY, 0.5);
                    const hitUnderY = isUnderworld && checkUnderworldCollision(player.x, nextY, 0.5);
                    if (hitTownY || hitDynY || hitMazeY || hitUnderY) nextY = player.y;
                }

                const oldPlayerX = player.x;
                const oldPlayerY = player.y;
                const oldFamX = familiar.x;
                const oldFamY = familiar.y;

                familiar.x = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextX));
                familiar.y = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextY));
                
                player.x = familiar.x;
                player.y = familiar.y;

                this.playerGrid.update(player, oldPlayerX, oldPlayerY, player.x, player.y);
                this.familiarGrid.update(familiar, oldFamX, oldFamY, familiar.x, familiar.y);
            } else {
                (player as any).mountedFamiliarId = "";
                (player as any).isFlying = false;
            }
            return; 
        }

        const moveSpeed = player.isSprinting ? player.movementSpeed * 1.6 : player.movementSpeed;
        
        const allowedDistSq = (moveSpeed * dt * 1.5 + 4.5) ** 2;
        const requestedDistSq = distSq(player.x, player.y, targetX, targetY);

        const isWolf = player.isSpiritAnimal || this.activeHazards.some(h => h.type === "spirit_animal" && h.ownerId === client.sessionId);
        
        let serverX = player.x;
        let serverY = player.y;
        
        let debugReason = "";
        let nextX = targetX;
        let nextY = targetY;

        if (requestedDistSq > allowedDistSq) {
            const dist = Math.sqrt(requestedDistSq);
            const maxDist = Math.sqrt(allowedDistSq);
            const ratio = maxDist / dist;
            nextX = player.x + (targetX - player.x) * ratio;
            nextY = player.y + (targetY - player.y) * ratio;
            debugReason += `[Clamped: Req ${dist.toFixed(1)} > Max ${maxDist.toFixed(1)}] `;
        }

        let blockedX = false;
        let blockedY = false;

        if (!isWolf) {
            const serverRadius = 0.5;
            
            const isSafeDistX = (nextX * nextX + player.y * player.y) < 87025; 
            const isSafeDistY = (nextX * nextX + nextY * nextY) < 87025;

            const hitTownX = isTown && checkTownCollision(nextX, player.y, serverRadius);
            const hitDynX = checkDynamicCollision(this.state, nextX, player.y, serverRadius);
            const hitMazeX = isMaze && checkMazeCollision(nextX, player.y, serverRadius);
            const hitUnderX = isUnderworld && isSafeDistX && checkUnderworldCollision(nextX, player.y, serverRadius);
            
            blockedX = hitTownX || hitDynX || hitMazeX || hitUnderX;

            if (blockedX) {
                nextX = player.x;
                if (isTown) debugReason += `[X-Block] `;
            }

            const hitTownY = isTown && checkTownCollision(nextX, nextY, serverRadius);
            const hitDynY = checkDynamicCollision(this.state, nextX, nextY, serverRadius);
            const hitMazeY = isMaze && checkMazeCollision(nextX, nextY, serverRadius);
            const hitUnderY = isUnderworld && isSafeDistY && checkUnderworldCollision(nextX, nextY, serverRadius);
            
            blockedY = hitTownY || hitDynY || hitMazeY || hitUnderY;

            if (blockedY) {
                nextY = player.y;
                if (isTown) debugReason += `[Y-Block] `;
            }
        }

        serverX = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextX));
        serverY = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextY));

        const errorDistSq = distSq(targetX, targetY, serverX, serverY);
        
        const TOLERANCE_SQ = 64.0; 
        const SLIDE_TOLERANCE_SQ = 0.05; 

        const oldX = player.x;
        const oldY = player.y;
        player.x = serverX;
        player.y = serverY;
        this.playerGrid.update(player, oldX, oldY, player.x, player.y);

        if (errorDistSq > TOLERANCE_SQ) {
            console.warn(`[SNAP] ${player.name} snapped. ErrorDistSq: ${errorDistSq.toFixed(2)}. Reason: ${debugReason}`);
            client.send("forcePosition", { x: player.x, z: player.y });
        } else if ((blockedX || blockedY) && errorDistSq > SLIDE_TOLERANCE_SQ) {
            client.send("forcePosition", { x: player.x, z: player.y });
        }
    }

    private processAbility(client: Client, message: any) {
        const player = this.state.players.get(client.sessionId);
        if (player && !player.isMeditating && Date.now() >= player.rootedUntil) {
            
            const isFamiliarCommand = [
                "devour_branch", "annihilation_branch", "legion_branch", 
                "arise_branch", "true_form_branch", "lifeline_branch", 
                "transposition_branch", "kill_command_branch", "aegis_branch", 
                "sky_lord_branch", "siege_engine_branch"
            ].includes(message.abilityId);

            if (isFamiliarCommand) {
                handleFamiliarAbility(this, client, message);
            } else {
                handleAbility(this, client, message); 
            }
            
            this.addAbilityProficiency(player, message.abilityId, 2.5);
        }
    }

    private processInteract(client: Client) {
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isSleeping || player.isMeditating) return;

        for (const [id, loot] of this.state.lootItems.entries()) {
            if (loot.kind.startsWith("Coin_")) continue;

            if (distSq(player.x, player.y, loot.x, loot.y) <= 4.0) {
                if (loot.kind === "chest" && !loot.isOpen) {
                    loot.isOpen = true;
                    player.coins += 50;
                    const rewardPotions = 2;
                    
                    if (player.inventory.has("Minor Health Potion")) {
                        player.inventory.get("Minor Health Potion")!.quantity += rewardPotions;
                    } else {
                        const invItem = new InventoryItemState();
                        invItem.name = "Minor Health Potion"; invItem.quantity = rewardPotions;
                        invItem.desc = ITEM_DB["Minor Health Potion"]?.desc || "Restores Health Points.";
                        player.inventory.set("Minor Health Potion", invItem);
                    }
                    this.markPlayerDirty(client.sessionId);
                    setTimeout(() => { if (this.state.lootItems.has(id)) this.state.lootItems.get(id)!.isOpen = false; }, 300000);
                    break;
                } else if (loot.kind !== "chest") {
                    const lootName = loot.kind;
                    const lootDef = ITEM_DB[lootName];
                    
                    if (player.inventory.has(lootName)) {
                        player.inventory.get(lootName)!.quantity += 1;
                    } else {
                        const invItem = new InventoryItemState();
                        invItem.name = lootName; 
                        invItem.quantity = 1;
                        invItem.desc = lootDef?.desc || "A material.";
                        player.inventory.set(lootName, invItem);
                    }
                    this.state.lootItems.delete(id);
                    this.markPlayerDirty(client.sessionId);
                    
                    this.progressQuest(player, "gather", lootName, 1, client);
                    
                    break; 
                }
            }
        }
    }

    public markPlayerDirty(sessionId: string) {
        this.dirtyPlayers.add(sessionId);
    }

    public async savePlayerToDB(sessionId: string) {
        const p = this.state.players.get(sessionId); 
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
        
        const savedCompletedQuests = Array.from(p.completedQuests);

        const savedHotbar: Record<string, string> = {};
        p.hotbar.forEach((abilityId, slot) => savedHotbar[slot] = abilityId);
        
        try { 
            await db.collection("players").doc(p.name).set({ 
                sessionId: p.sessionId, name: p.name, classId: p.classId, pathwayId: p.pathwayId, 
                utilityPathway: p.utilityPathway, familiarPathway: p.familiarPathway, 
                gender: p.gender, skinColor: p.skinColor, hairStyle: p.hairStyle, hairColor: p.hairColor, eyeColor: p.eyeColor,
                rank: p.rank, level: p.level, experience: p.experience, experienceToNextLevel: p.experienceToNextLevel,
                teamId: p.teamId, isTeamLeader: p.isTeamLeader, 
                x: p.x, y: p.y, hp: p.hp, mp: p.mp, stamina: p.stamina, maxStamina: p.maxStamina, hunger: p.hunger, maxHunger: p.maxHunger, coins: p.coins, 
                manaLevel: p.manaLevel, auraStrength: p.auraStrength, auraControl: p.auraControl, auraStyle: p.auraStyle, meditationCount: p.meditationCount,
                inventory: inv, equippedItem: p.equippedItem, equipHead: p.equipHead, equipChest: p.equipChest, equipBack: p.equipBack, equipLegs: p.equipLegs, equipFeet: p.equipFeet, equipOffHand: p.equipOffHand, 
                skillTree: { unspentEssencePoints: p.skillTree.unspentEssencePoints, unspentAwakeningPoints: p.skillTree.unspentAwakeningPoints, unlockedPassives: passives, activeAbilities: abilitiesList },
                shadowSouls: (p as any).shadowSouls || 0,
                activeQuests: savedActiveQuests,
                completedQuests: savedCompletedQuests,
                hotbar: savedHotbar,
                hasUnlockedAura: p.hasUnlockedAura,
                hasUnlockedBuilding: p.hasUnlockedBuilding,
                hasUnlockedSkillTree: p.hasUnlockedSkillTree
            }, { merge: true }); 
        } catch (err) {
            console.error("Failed to save player to DB:", err);
        }
    }

    async onJoin(client: Client, options: { name?: string, classId?: string, pathwayId?: string, adminToken?: string } = {}) {
        if (options.adminToken && options.adminToken === process.env.ADMIN_TOKEN) {
            (client as any).isAdmin = true;
        }

        if (options.adminToken && options.adminToken === "goal1234") {
            (client as any).isAdmin = true;
        }

        const playerName = options.name || `Player-${client.sessionId.slice(0, 4)}`;

        const existingPlayer = Array.from(this.state.players.values()).find(p => p.name === playerName);
        
        if (existingPlayer) {
            console.log(`Cleaning up ghost session for ${playerName}`);
            
            this.playerGrid.remove(existingPlayer, existingPlayer.x, existingPlayer.y);
            
            const oldFamiliarId = `fam_${existingPlayer.sessionId}`;
            const oldFamiliar = this.state.familiars?.get(oldFamiliarId);
            if (oldFamiliar) {
                this.familiarGrid.remove(oldFamiliar, oldFamiliar.x, oldFamiliar.y);
                this.state.familiars!.delete(oldFamiliarId);
            }

            this.state.players.delete(existingPlayer.sessionId);

            const oldClient = this.clients.find(c => c.sessionId === existingPlayer.sessionId);
            if (oldClient) {
                oldClient.leave();
            }
        }

        const player = new PlayerState(); 
        player.sessionId = client.sessionId; 
        player.name = playerName;
        if (options.classId) player.classId = options.classId; 
        if (options.pathwayId) player.pathwayId = options.pathwayId;
        
        player.utilityPathway = "wayfinder";
        player.familiarPathway = "apocalyptic_swarm";
        
        player.gender = "body1";
        player.skinColor = "#ffccaa";
        player.hairStyle = "short";
        player.hairColor = "#333333";
        player.eyeColor = "#00aaff";

        player.rank = "Iron";
        player.level = 1; player.experience = 0; player.experienceToNextLevel = 500;
        player.x = 0; player.y = 0; 
        player.hp = 100; player.maxHp = 100; player.mp = 100; player.maxMp = 100; 
        player.stamina = 100; player.maxStamina = 100; player.hunger = 100; player.maxHunger = 100;
        player.manaLevel = 1; player.auraStrength = 1.0; player.auraControl = 1.0;
        player.auraStyle = "tyrant"; player.isAuraActive = false;
        player.attackSpeed = 1.0; player.movementSpeed = 12.0; player.coins = 2500; 
        
        player.equippedItem = ""; player.equipHead = ""; player.equipChest = ""; player.equipBack = "";
        player.equipLegs = ""; player.equipFeet = ""; player.equipOffHand = ""; 
        player.isSleeping = false; player.sleepRot = 0; player.isMeditating = false;
        player.meditationCount = 0; player.rootedUntil = 0;
        player.skillTree.unspentEssencePoints = 2; player.skillTree.unspentAwakeningPoints = 5;

        const starterSword = new InventoryItemState();
        starterSword.name = "Wooden Sword";
        starterSword.quantity = 1;
        starterSword.desc = ITEM_DB["Wooden Sword"]?.desc || "A basic training sword made of wood. Better than your fists. +2 ATK.";
        player.inventory.set("Wooden Sword", starterSword);
        player.equippedItem = "Wooden Sword"; 
        
        player.teamId = 0;
        player.isTeamLeader = false;
        (player as any).shadowSouls = 0;

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
                if (d.x !== undefined) player.x = d.x; if (d.y !== undefined) player.y = d.y; 
                if (d.hp !== undefined) player.hp = d.hp; if (d.mp !== undefined) player.mp = d.mp; 
                if (d.stamina !== undefined) player.stamina = d.stamina; if (d.maxStamina !== undefined) player.maxStamina = d.maxStamina;
                if (d.hunger !== undefined) player.hunger = d.hunger; if (d.maxHunger !== undefined) player.maxHunger = d.maxHunger;
                if (d.coins !== undefined) player.coins = d.coins;
                if (d.manaLevel !== undefined) player.manaLevel = d.manaLevel;
                if (d.auraStrength !== undefined) player.auraStrength = d.auraStrength;
                if (d.auraControl !== undefined) player.auraControl = d.auraControl;
                if (d.auraStyle !== undefined) player.auraStyle = d.auraStyle;
                if (d.meditationCount !== undefined) player.meditationCount = d.meditationCount;
                if (d.shadowSouls !== undefined) (player as any).shadowSouls = d.shadowSouls;
                if (d.hasUnlockedAura !== undefined) player.hasUnlockedAura = d.hasUnlockedAura;
                if (d.hasUnlockedBuilding !== undefined) player.hasUnlockedBuilding = d.hasUnlockedBuilding;
                if (d.hasUnlockedSkillTree !== undefined) player.hasUnlockedSkillTree = d.hasUnlockedSkillTree;
                if (d.teamId !== undefined) player.teamId = d.teamId;
                if (d.isTeamLeader !== undefined) player.isTeamLeader = d.isTeamLeader;

                if (player.teamId > 0) {
                    if (!this.activeTeams.has(player.teamId)) {
                        this.activeTeams.set(player.teamId, { leader: player.isTeamLeader ? client.sessionId : client.sessionId, members: new Set([client.sessionId]) });
                        player.isTeamLeader = true;
                    } else {
                        const team = this.activeTeams.get(player.teamId)!; team.members.add(client.sessionId);
                        if (player.isTeamLeader) team.leader = client.sessionId;
                    }
                }

                if (d.equippedItem !== undefined) { const loaded = d.equippedItem; const def = ITEM_DB[loaded]; player.equippedItem = (def?.type === "armor" || def?.type === "cosmetic") ? "" : loaded; }
                if (d.equipHead !== undefined) player.equipHead = d.equipHead; if (d.equipChest !== undefined) player.equipChest = d.equipChest; 
                if (d.equipBack !== undefined) player.equipBack = d.equipBack; if (d.equipLegs !== undefined) player.equipLegs = d.equipLegs; 
                if (d.equipFeet !== undefined) player.equipFeet = d.equipFeet; if (d.equipOffHand !== undefined) player.equipOffHand = d.equipOffHand;
                
                if (d.inventory && Array.isArray(d.inventory)) { d.inventory.forEach((inv: any) => { const item = new InventoryItemState(); item.name = inv.name; item.quantity = inv.quantity; item.desc = inv.desc; player.inventory.set(inv.name, item); }); }
                
                if (d.skillTree) {
                    player.skillTree.unspentEssencePoints = d.skillTree.unspentEssencePoints || 0; player.skillTree.unspentAwakeningPoints = d.skillTree.unspentAwakeningPoints || 0;
                    if (d.skillTree.unlockedPassives) { for (const [k, v] of Object.entries(d.skillTree.unlockedPassives)) player.skillTree.unlockedPassives.set(k, v as number); }
                    if (d.skillTree.activeAbilities) {
                        if (Array.isArray(d.skillTree.activeAbilities)) {
                            d.skillTree.activeAbilities.forEach((data: any) => {
                                const ability = new ActiveAbility(); 
                                ability.id = data.id; ability.baseLevel = data.baseLevel; ability.rank = data.rank || "Iron"; ability.level = data.level || 0; ability.proficiency = data.proficiency || 0.0; ability.unconsolidatedProficiency = data.unconsolidatedProficiency || 0.0;
                                if (data.upgrades) { for (const [upk, upv] of Object.entries(data.upgrades)) { const up = upv as any; const upgrade = new SkillUpgrade(); upgrade.id = up.id; upgrade.unlocked = up.unlocked; upgrade.currentRank = up.currentRank; upgrade.maxRank = up.maxRank; ability.upgrades.set(upk, upgrade); } }
                                player.skillTree.activeAbilities.set(data.abilityKey || data.id, ability);
                            });
                        } else {
                            for (const [k, v] of Object.entries(d.skillTree.activeAbilities)) {
                                const data = v as any; const ability = new ActiveAbility(); 
                                ability.id = data.id; ability.baseLevel = data.baseLevel; ability.rank = data.rank || "Iron"; ability.level = data.level || 0; ability.proficiency = data.proficiency || 0.0; ability.unconsolidatedProficiency = data.unconsolidatedProficiency || 0.0;
                                if (data.upgrades) { for (const [upk, upv] of Object.entries(data.upgrades)) { const up = upv as any; const upgrade = new SkillUpgrade(); upgrade.id = up.id; upgrade.unlocked = up.unlocked; upgrade.currentRank = up.currentRank; upgrade.maxRank = up.maxRank; ability.upgrades.set(upk, upgrade); } }
                                player.skillTree.activeAbilities.set(k, ability);
                            }
                        }
                    }
                }
                
                if (d.completedQuests) { d.completedQuests.forEach((qId: string) => player.completedQuests.push(qId)); }
                if (d.activeQuests) {
                    if (Array.isArray(d.activeQuests)) {
                        d.activeQuests.forEach((data: any) => {
                            const qState = new QuestProgressState();
                            qState.questId = data.questId; qState.currentAmount = data.currentAmount; qState.isCompleted = data.isCompleted;
                            player.activeQuests.set(data.questId, qState);
                        });
                    } else {
                        for (const [k, v] of Object.entries(d.activeQuests)) {
                            const data = v as any; const qState = new QuestProgressState();
                            qState.questId = k; qState.currentAmount = data.currentAmount; qState.isCompleted = data.isCompleted;
                            player.activeQuests.set(k, qState);
                        }
                    }
                }

                if (d.hotbar) {
                    for (const [slot, abilityId] of Object.entries(d.hotbar)) {
                        player.hotbar.set(slot, abilityId as string);
                    }
                } else {
                    player.hotbar.set("slot2", "");
                    player.hotbar.set("slot3", "");
                    player.hotbar.set("slot4", "");
                    player.hotbar.set("slot5", "");
                    player.hotbar.set("slot6", "");
                    player.hotbar.set("slot7", "");
                    player.hotbar.set("slot8", "");
                    player.hotbar.set("slot9", "");
                }
            }
        } catch (err) {
            console.error("Error loading player from DB:", err);
        }

        if (player.completedQuests.length === 0 && player.activeQuests.size === 0) {
            const firstQuest = new QuestProgressState();
            firstQuest.questId = "tutorial_0_ability";
            player.activeQuests.set("tutorial_0_ability", firstQuest);
            this.markPlayerDirty(player.sessionId);
        }
        
        if (!this.clients.includes(client)) return;

        const isTown = this.roomName === "town" || this.constructor.name === "TownRoom";
        const isMaze = this.roomName === "maze" || this.constructor.name === "MazeRoom";

        if (isMaze) {
            player.x = 0; player.y = 0;
        } else {
            const isBlocked = (isTown && checkTownCollision(player.x, player.y, 0.5)) || checkDynamicCollision(this.state, player.x, player.y, 0.5);
            if (isBlocked) { player.x = 0; player.y = 20; }
        }

        let bonusSpd = 0; 
        const itemsToCheck = [player.equippedItem, player.equipHead, player.equipChest, player.equipBack, player.equipLegs, player.equipFeet, player.equipOffHand];
        itemsToCheck.forEach(name => { if(name) bonusSpd += ITEM_DB[name]?.stats?.spd ?? 0; });
        
        player.movementSpeed = 12.0 + bonusSpd; 
        this.state.players.set(client.sessionId, player); 
        this.playerGrid.add(player, player.x, player.y);

      setTimeout(() => {
            if (this.clients.includes(client)) {
                if (BaseRoom.isEventActive) {
                    client.send("event_invite", { 
                        eventName: BaseRoom.nextEventName, 
                        targetZone: BaseRoom.nextEventZone 
                    });
                } else {
                    client.send("global_event_sync", { 
                        name: BaseRoom.nextEventName, 
                        remainingMs: Math.max(0, BaseRoom.nextEventTime - Date.now()) 
                    });
                }
            }
            
            this.broadcastNearby(player.x, player.y, 60, "server_event_log", { 
                html: `👋 <b>${player.name}</b> joined the realm.`, 
                type: "event-join" 
            });
            
        }, 500);

        syncFamiliars(this);
    }

    async onLeave(client: Client, code?: number) { 
        const consented = (code === CloseCode.CONSENTED);
        const player = this.state.players.get(client.sessionId); 
        if (!player) return; 

        if (!consented) {
            try { client = await this.allowReconnection(client, 15); this.onClientReconnected(client); return; } catch (e) { }
        }

        this.broadcastNearby(player.x, player.y, 60, "server_event_log", { html: `🚪 <b>${player.name}</b> left the realm.`, type: "event-info" });

        this.playerGrid.remove(player, player.x, player.y); 
        this.lastMoveTimes.delete(client.sessionId);
        await this.savePlayerToDB(client.sessionId); 
        this.dirtyPlayers.delete(client.sessionId);
        this.lastAttackTimes.delete(client.sessionId); 
        this.state.players.delete(client.sessionId); 
        
        const existingFamiliar = this.state.familiars?.get(`fam_${client.sessionId}`);
        if (existingFamiliar) {
            this.familiarGrid.remove(existingFamiliar, existingFamiliar.x, existingFamiliar.y);
            this.state.familiars!.delete(`fam_${client.sessionId}`);
        }
    }

    protected onClientReconnected(client: Client) {
        setTimeout(() => {
            if (this.clients.includes(client)) {
                client.send("global_event_sync", { 
                    name: BaseRoom.nextEventName, 
                    remainingMs: Math.max(0, BaseRoom.nextEventTime - Date.now()) 
                });
            }
        }, 500); 
    }

    protected universalUpdate(deltaTime: number) {
        const dt = deltaTime / 1000; 

        this.state.players.forEach((player, sessionId) => {
            if (!player.isMeditating) {
                if (player.isAuraActive) {
                    let mpDrain = Math.max(2.0, 5.0 + (player.auraStrength * 4.0) - (player.auraControl * 3.0));
                    
                    let energyDrain = Math.max(0.1, 0.5 + (player.auraStrength * 0.2) - (player.auraControl * 0.15));

                    if (player.auraStyle === "void") energyDrain *= 1.5;
                    if (player.auraStyle === "sanctuary") mpDrain *= 1.5;
                    
                    player.mp -= mpDrain * dt; 
                    player.hunger -= energyDrain * dt; 

                    if (player.mp <= 0 || player.hunger <= 0) {
                        player.mp = Math.max(0, player.mp); player.hunger = Math.max(0, player.hunger);
                        player.isAuraActive = false;
                        this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "aura_shatter", targetX: player.x, targetZ: player.y });
                    } else {
                        if (player.auraStyle === "void") {
                            (player as any).stealthedUntil = Date.now() + 500;
                        } else if (player.auraStyle === "sanctuary") {
                            const auraRadius = 8.0 + (player.auraStrength * 0.5);
                            for (const p of this.playerGrid.getNearby(player.x, player.y, auraRadius)) {
                                if (distSq(p.x, p.y, player.x, player.y) <= auraRadius**2) {
                                    p.hp = Math.min(p.maxHp, p.hp + (player.auraStrength + player.auraControl) * 0.5 * dt);
                                }
                            }
                        }
                        player.auraControl = Math.min(10.0, player.auraControl + (0.001 * dt));
                    }
                }

                if (player.isSprinting) {
                    player.hunger -= 0.15 * dt; 
                    if (player.hunger <= 0) {
                        player.hunger = 0; player.isSprinting = false;
                    }
                } else {
                    if (!player.isSleeping) { player.hunger -= 0.01 * dt; if (player.hunger < 0) player.hunger = 0; }
                }

                player.stamina = player.hunger;

                if (player.isSleeping) {
                    if (player.hp < player.maxHp) player.hp = Math.min(player.hp + 5.0 * dt, player.maxHp);
                    if (player.mp < player.maxMp) player.mp = Math.min(player.mp + 10.0 * dt, player.maxMp);
                }
                else if (player.hunger > 30.0) {
                    if (player.hp < player.maxHp) player.hp = Math.min(player.hp + 0.5 * dt, player.maxHp);
                    if (player.mp < player.maxMp && !player.isAuraActive) player.mp = Math.min(player.mp + 2.0 * dt, player.maxMp);
                }

                let currentSpeed = 12.0;
                
                [player.equippedItem, player.equipHead, player.equipChest, player.equipBack, player.equipLegs, player.equipFeet, player.equipOffHand].forEach(n => {
                    if (n && ITEM_DB[n]?.stats?.spd) currentSpeed += ITEM_DB[n].stats.spd;
                });
                
                if ((player as any).holySpeedBuff && Date.now() < (player as any).holySpeedBuff) currentSpeed += 2.4; 
                
                let hasWhirlwind = false;
                for (const h of this.activeHazards) {
                    if (h.type === "whirlwind_aura" && h.ownerId === sessionId && h.rank >= 1) {
                        hasWhirlwind = true; break;
                    }
                }
                if (hasWhirlwind) currentSpeed *= 1.5;

                if (player.hunger <= 0) {
                    currentSpeed *= 0.4; 
                    
                    if (!(player as any).isStarvingMsgSent) {
                        (player as any).isStarvingMsgSent = true;
                        const client = this.clients.find(c => c.sessionId === sessionId);
                        if (client) client.send("hud_message", "⚠️ You are starving. Movement speed severely reduced.");
                    }
                } else if ((player as any).isStarvingMsgSent) {
                    (player as any).isStarvingMsgSent = false;
                }

                if (player.movementSpeed !== currentSpeed) {
                    player.movementSpeed = currentSpeed;
                }
            }
        });

        for (const [id, loot] of this.state.lootItems.entries()) {
            if (loot.kind.startsWith("Coin_")) {
                for (const p of this.playerGrid.getNearby(loot.x, loot.y, 2.0)) {
                    if (!p.isSleeping && !p.isMeditating && distSq(p.x, p.y, loot.x, loot.y) <= 4.0) {
                        const amount = parseInt(loot.kind.split("_")[1]) || 15;
                        p.coins += amount;
                        this.markPlayerDirty(p.sessionId);
                        this.state.lootItems.delete(id);
                        
                        const client = this.clients.find(c => c.sessionId === p.sessionId);
                        if (client) client.send("coin_pickup", { amount });
                        break; 
                    }
                }
            }
        }

        processHazards(this, dt);
        updateEnemies(this, dt);
        updateFamiliars(this, dt);
    }
}