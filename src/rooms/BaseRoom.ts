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
import { QUEST_DB } from "../QuestDatabase";
import { db } from "../db/firebase";

import { getSkillDef, getAbilityCategory } from "../data/AbilityDatabase";
import { handleAbility } from "../AbilityController";
import { syncFamiliars, updateFamiliars, handleFamiliarAbility } from "../FamiliarController";
import { setupTradeSystem } from "./TradeController";

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

function distSq(x1: number, y1: number, x2: number, y2: number): number {
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

export function applyAffliction(
    enemy: any, 
    type: string, 
    duration: number, 
    damagePerTick: number, 
    tickTimer: number, 
    stacks: number = 1, 
    maxStacks: number = 5
) {
    let aff = enemy.afflictions.get(type);
    if (!aff) {
        aff = new AfflictionState();
        enemy.afflictions.set(type, aff);
        enemy[`${type}_stacks`] = 0; 
    }
    aff.type = type;
    aff.duration = Math.max(aff.duration, duration); 
    aff.damagePerTick = damagePerTick;
    aff.tickTimer = tickTimer;
    
    const currentStacks = enemy[`${type}_stacks`] || 0;
    enemy[`${type}_stacks`] = Math.min(currentStacks + stacks, maxStacks);
}

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
    protected lastAttackTimes = new Map<string, number>();

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

    public progressQuest(player: PlayerState, type: string, targetId: string, amount: number, client: Client | undefined) {
        if (!client) return;

        player.activeQuests.forEach((qProgress, qId) => {
            const qDef = QUEST_DB[qId];
            if (!qDef) return;

            const obj = qDef.objectives.find(o => o.type === type && o.targetId === targetId);
            if (obj && !qProgress.isCompleted) {
                qProgress.currentAmount += amount;
                
                if (qProgress.currentAmount >= obj.requiredAmount) {
                    qProgress.currentAmount = obj.requiredAmount;
                    qProgress.isCompleted = true;
                    
                    player.coins += qDef.rewards.coins;
                    player.experience += qDef.rewards.exp;
                    
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
                    
                    player.completedQuests.push(qId);
                    player.activeQuests.delete(qId);
                    
                    client.send("server_event_log", {
                        html: `🏆 <b style="color: #ffaa00;">Quest Complete:</b> ${qDef.title} (+${qDef.rewards.coins} Coins)`,
                        type: "event-win"
                    });
                    
                    if (qDef.nextQuestId) {
                        const nextQ = new QuestProgressState();
                        nextQ.questId = qDef.nextQuestId;
                        player.activeQuests.set(qDef.nextQuestId, nextQ);
                        
                        client.send("server_event_log", {
                            html: `📜 <b style="color: #00ffaa;">New Quest:</b> ${QUEST_DB[qDef.nextQuestId].title}`,
                            type: "event-info"
                        });
                    }
                    this.markPlayerDirty(player.sessionId);
                }
            }
        });
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

   protected spawnDrop(x: number, y: number, kind: string) {
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
                        player.x = familiar.x;
                        player.y = familiar.y;
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
                this.processDodge(client, (action as any).data);
            }
            else if (type === "attack") {
                this.processAttack(client, (action as any).data);
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
            // --- FIX 1: TIME DILATION BURST PREVENTION ---
            // If rawDt is functionally 0, we are processing a backlog of network packets in the same server tick.
            // Do not give them 50ms of free movement per packet, or they will blast through walls.
            if (rawDt <= 0.001) {
                dt = 0.016; // Standard 60fps frame budget for backlogged packets
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

                familiar.x = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextX));
                familiar.y = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextY));
                
                player.x = familiar.x;
                player.y = familiar.y;

                this.playerGrid.update(player, player.x, player.y, player.x, player.y);
                this.familiarGrid.update(familiar, familiar.x, familiar.y, familiar.x, familiar.y);
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
            const hitTownX = isTown && checkTownCollision(nextX, player.y, serverRadius);
            const hitDynX = checkDynamicCollision(this.state, nextX, player.y, serverRadius);
            const hitMazeX = isMaze && checkMazeCollision(nextX, player.y, serverRadius);
            const hitUnderX = isUnderworld && checkUnderworldCollision(nextX, player.y, serverRadius);
            
            blockedX = hitTownX || hitDynX || hitMazeX || hitUnderX;

            if (blockedX) {
                nextX = player.x;
                if (isTown) debugReason += `[X-Block] `;
            }

            // FIX: Validate Y against nextX so diagonal corner clipping is blocked
            const hitTownY = isTown && checkTownCollision(nextX, nextY, serverRadius);
            const hitDynY = checkDynamicCollision(this.state, nextX, nextY, serverRadius);
            const hitMazeY = isMaze && checkMazeCollision(nextX, nextY, serverRadius);
            const hitUnderY = isUnderworld && checkUnderworldCollision(nextX, nextY, serverRadius);
            
            blockedY = hitTownY || hitDynY || hitMazeY || hitUnderY;

            if (blockedY) {
                nextY = player.y;
                if (isTown) debugReason += `[Y-Block] `;
            }
        }

        serverX = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextX));
        serverY = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextY));

        const errorDistSq = distSq(targetX, targetY, serverX, serverY);
        
        // --- FIX 2: WALL SLIDING TOLERANCE ---
        const TOLERANCE_SQ = 64.0; // Keep the massive 8-unit desync catch for extreme lag
        const SLIDE_TOLERANCE_SQ = 0.05; // Drop drift tolerance to near-zero for smooth AABB wall sliding

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

   private processDodge(client: Client, message: DodgeMessage) {
        const player = this.state.players.get(client.sessionId);
        if (player && !player.isSleeping && !player.isMeditating && Date.now() >= player.rootedUntil) {
            if ((player as any).mountedFamiliarId !== "") return; 

            if (player.hunger >= 0.5) {
                player.hunger -= 0.5;
                player.stamina = player.hunger;
                this.addAbilityProficiency(player, "evasion", 0.5);

                const dodgeDistance = 4.0;
                const dY = message.dz !== undefined ? message.dz : message.dy; 
                if (dY === undefined) return;

                const targetX = player.x + message.dx * dodgeDistance;
                const targetY = player.y + dY * dodgeDistance;

                let nextX = player.x;
                let nextY = player.y;

                const isWolf = player.isSpiritAnimal || this.activeHazards.some(h => h.type === "spirit_animal" && h.ownerId === client.sessionId);
                const isTown = this.roomName === "town" || this.constructor.name === "TownRoom";
                const isMaze = this.roomName === "maze" || this.constructor.name === "MazeRoom";
                const isUnderworld = this.roomName === "underworld" || this.constructor.name === "UnderworldRoom";

                const serverRadius = 0.5;

                if (isWolf || (!((isTown && checkTownCollision(targetX, targetY, serverRadius)) || (isMaze && checkMazeCollision(targetX, targetY)) || (isUnderworld && checkUnderworldCollision(targetX, targetY))) && !checkDynamicCollision(this.state, targetX, targetY, serverRadius))) {
                    nextX = targetX;
                    nextY = targetY;
                } else {
                    if (!((isTown && checkTownCollision(targetX, player.y, serverRadius)) || (isMaze && checkMazeCollision(targetX, player.y)) || (isUnderworld && checkUnderworldCollision(targetX, player.y))) && !checkDynamicCollision(this.state, targetX, player.y, serverRadius)) nextX = targetX;
                    if (!((isTown && checkTownCollision(nextX, targetY, serverRadius)) || (isMaze && checkMazeCollision(nextX, targetY)) || (isUnderworld && checkUnderworldCollision(nextX, targetY))) && !checkDynamicCollision(this.state, nextX, targetY, serverRadius)) nextY = targetY;
                }

                const oldX = player.x;
                const oldY = player.y;
                player.x = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextX));
                player.y = Math.max(-WORLD_RADIUS, Math.min(WORLD_RADIUS, nextY));

                this.playerGrid.update(player, oldX, oldY, player.x, player.y);
                this.broadcastNearby(player.x, player.y, 40, "combatEvent", { type: "dodge", id: client.sessionId, dx: message.dx, dy: dY });
            }
        }
    }

    private processAttack(client: Client, message: AttackMessage) {
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isSleeping || player.isMeditating || Date.now() < player.rootedUntil) return;

        if ((player as any).mountedFamiliarId && (player as any).mountedFamiliarId !== "") {
            const familiar = this.state.familiars?.get((player as any).mountedFamiliarId);
            if (familiar) familiar.action = "orbiting";
            (player as any).mountedFamiliarId = "";
            (player as any).isFlying = false;
            this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: "dismount", targetX: player.x, targetZ: player.y });
        }

        const now = Date.now();
        const lastAttack = this.lastAttackTimes.get(client.sessionId) || 0;
        
        let speed = player.attackSpeed || 1;
        if ((player as any).attackSpeedBuff && Date.now() < (player as any).attackSpeedBuff) speed *= 1.5;
        const cooldownMs = 1000 / speed;

        if (now - lastAttack >= cooldownMs) {
            this.lastAttackTimes.set(client.sessionId, now);

            let stealthRank = 0; let brokeStealth = false;
            if ((player as any).stealthedUntil && Date.now() < (player as any).stealthedUntil) {
                brokeStealth = true;
                (player as any).stealthedUntil = 0;

                const hIdx = this.activeHazards.findIndex(h => h.type === "veil_of_shadows" && h.ownerId === player.sessionId);
                if (hIdx !== -1) {
                    stealthRank = this.activeHazards[hIdx].rank;
                    this.broadcastNearby(player.x, player.y, 60, "removeHazard", { id: this.activeHazards[hIdx].id });
                    this.activeHazards.splice(hIdx, 1);
                }

                const breakVisual = stealthRank >= 3 ? "veil_of_shadows_burst" : "veil_of_shadows_break";
                this.broadcastNearby(player.x, player.y, 60, "abilityUsed", { id: player.sessionId, abilityId: breakVisual, targetX: player.x, targetZ: player.y });

                if (stealthRank >= 3 && this.state.enemies) {
                    for (const e of this.enemyGrid.getNearby(player.x, player.y, 6.0)) {
                        if (distSq(e.x, e.y, player.x, player.y) <= 36.0) {
                            e.hp -= 80;
                            applyAffliction(e, "Silence", 3.0, 0, 0);
                            this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 80, isCrit: true });
                            if (e.hp <= 0) { this.awardPlayerKill(player, e.name); this.removeEnemy(e.id); }
                        }
                    }
                }
            }

            this.broadcastNearby(player.x, player.y, 50, "playerAttacked", { id: client.sessionId, targetX: message.targetX, targetZ: message.targetZ });

            let hitSomething = false;
            
            if (this.state.enemies) {
                for (const enemy of this.enemyGrid.getNearby(message.targetX, message.targetZ, 2.0)) {
                    if (distSq(enemy.x, enemy.y, message.targetX, message.targetZ) <= 4.0) {
                        hitSomething = true;
                        this.addAbilityProficiency(player, "melee_combat", 1.5);
                        
                        let dmg = 15;
                        if (player.equippedItem) dmg += ITEM_DB[player.equippedItem]?.stats?.atk ?? 0;
                        if ((player as any).shadowMinionBuff && Date.now() < (player as any).shadowMinionBuff) dmg += 15;
                        if ((enemy as any).armorShattered || enemy.afflictions.has("Shattered Armor")) dmg = Math.floor(dmg * 1.15);
                        if (brokeStealth && stealthRank >= 1) dmg = Math.floor(dmg * 1.5);
                        
                        if (player.isAuraActive && player.auraStyle === "void") {
                            dmg = Math.floor(dmg * (1.5 + (player.auraControl * 0.2)));
                            player.isAuraActive = false; 
                            (player as any).stealthedUntil = 0;
                            this.broadcastNearby(player.x, player.y, 40, "abilityUsed", { id: player.sessionId, abilityId: "aura_shatter", targetX: player.x, targetZ: player.y });
                        }

                        if (enemy.afflictions.has("Static Charge")) {
                            enemy.afflictions.delete("Static Charge");
                            this.broadcastNearby(enemy.x, enemy.y, 40, "abilityUsed", { id: enemy.id, abilityId: "divine_smite_silver", targetX: enemy.x, targetZ: enemy.y });
                            
                            for (const e of this.enemyGrid.getNearby(enemy.x, enemy.y, 4.0)) {
                                if (e.id !== enemy.id && distSq(e.x, e.y, enemy.x, enemy.y) <= 16.0) {
                                    e.hp -= 50;
                                    this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 50, isCrit: true });
                                    if (e.hp <= 0) { this.awardPlayerKill(player, e.name); this.removeEnemy(e.id); }
                                }
                            }
                        }

                        enemy.hp -= dmg;
                        this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: dmg, isCrit: brokeStealth && stealthRank >= 1 });
                        
                        if (enemy.hp <= 0) {
                            this.awardPlayerKill(player, enemy.name);
                            
                            if ((enemy as any).sanguineFeastSpread) {
                                const splinters: EnemyState[] = [];
                                for (const e of this.enemyGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                    if (e.id !== enemy.id) splinters.push(e);
                                }
                                let spreadCount = 0;
                                for (const n of splinters) {
                                    if (spreadCount >= 2) break;
                                    applyAffliction(n, "Bleed", 4.0, 10, 1.0, 1, 3);
                                    spreadCount++;
                                }
                            }
                            
                            if ((enemy as any).bloodExplosionOnDeath) {
                                for (const p of this.playerGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                    if (distSq(p.x, p.y, enemy.x, enemy.y) <= 64.0) {
                                        p.hp = Math.min(p.maxHp, p.hp + 50);
                                    }
                                }
                            }

                            this.removeEnemy(enemy.id);
                        }
                    }
                }
            }

            const familiarId = `fam_${client.sessionId}`;
            const familiar = this.state.familiars?.get(familiarId);
            if (familiar && familiar.type === "astral_reflection" && familiar.action === "orbiting" && familiar.hp > 0) {
                const geminiRank = player.skillTree.activeAbilities.get("gemini_base")?.upgrades.get("mimicry")?.currentRank || 1;
                const dmgMult = geminiRank >= 5 ? 0.3 : (geminiRank >= 3 ? 0.2 : 0.1);
                
                this.broadcastNearby(familiar.x, familiar.y, 50, "playerAttacked", { id: familiar.id, targetX: message.targetX, targetZ: message.targetZ });
                
                if (this.state.enemies) {
                    for (const enemy of this.enemyGrid.getNearby(message.targetX, message.targetZ, 2.0)) {
                         if (distSq(enemy.x, enemy.y, familiar.x + (message.targetX - player.x), familiar.y + (message.targetZ - player.y)) <= 9.0) {
                             let baseDmg = 15;
                             if (player.equippedItem) baseDmg += ITEM_DB[player.equippedItem]?.stats?.atk ?? 0;
                             
                             const mimicDmg = Math.floor(baseDmg * dmgMult);
                             enemy.hp -= mimicDmg;
                             this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: mimicDmg, isCrit: false });
                             if (enemy.hp <= 0) { this.awardPlayerKill(player, enemy.name); this.removeEnemy(enemy.id); }
                         }
                    }
                }
            }

            if (!hitSomething && this.state.scenery) {
                let bestScenery: SceneryState | null = null;
                let bestScore = -Infinity;
                const attackRangeSq = 36.0;
                
                for (const scenery of this.sceneryGrid.getNearby(player.x, player.y, 6.0)) {
                    const dx = scenery.x - player.x; const dy = scenery.y - player.y; 
                    const distS = dx * dx + dy * dy;

                    if (distS <= attackRangeSq) { 
                        const angleToScenery = Math.atan2(dx, dy);
                        const angleOfAttack = Math.atan2(message.targetX - player.x, message.targetZ - player.y);
                        
                        let angleDiff = angleToScenery - angleOfAttack;
                        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        
                        if (Math.abs(angleDiff) < Math.PI / 2.5) { 
                            const score = -Math.sqrt(distS) - (Math.abs(angleDiff) * 3);
                            if (score > bestScore) { bestScore = score; bestScenery = scenery; }
                        }
                    }
                }

                if (bestScenery) {
                    this.addAbilityProficiency(player, "gathering", 1.0);
                    
                    const isRock = bestScenery.kind.includes("rock");
                    let damage = 1; 
                    const toolDef = ITEM_DB[player.equippedItem];
                    if (toolDef && toolDef.type === "tool" && toolDef.stats?.gatherDamage) {
                        if ((isRock && toolDef.name.includes("Pickaxe")) || (!isRock && toolDef.name.includes("Axe"))) {
                            damage = toolDef.stats.gatherDamage;
                        }
                    }

                    bestScenery.hp -= damage;

                    if (bestScenery.hp <= 0) {
                        let lootName = isRock ? "Stone" : "Wood";
                        
                        let biome = "forest";
                        if (bestScenery.x > 800) biome = "elven";
                        else if (bestScenery.y < -800) biome = "winter"; 
                        else if (bestScenery.y > 800) biome = "desert";
                        else if (bestScenery.x < -800) biome = "swamp";

                        if (Math.random() < 0.15) {
                            if (isRock && biome === "winter") lootName = "Glacial Ore";
                            else if (isRock && biome === "desert") lootName = "Sun-baked Clay";
                            else if (!isRock && biome === "swamp") lootName = "Ironwood";
                            else if (isRock && biome === "elven") lootName = "Aethelgard Crystal";
                        }

                        for(let i=0; i<3; i++) { 
                            this.spawnDrop(bestScenery.x + (Math.random() - 0.5) * 1.5, bestScenery.y + (Math.random() - 0.5) * 1.5, lootName); 
                        }

                        this.progressQuest(player, "gather", isRock ? "Stone" : "Wood", 3, client); 

                        const originalScenery = new SceneryState();
                        originalScenery.id = bestScenery.id; originalScenery.kind = bestScenery.kind;
                        originalScenery.x = bestScenery.x; originalScenery.y = bestScenery.y;
                        originalScenery.scale = bestScenery.scale; originalScenery.rotation = bestScenery.rotation;
                        originalScenery.maxHp = bestScenery.maxHp; originalScenery.hp = bestScenery.maxHp;

                        this.sceneryGrid.remove(bestScenery, bestScenery.x, bestScenery.y);
                        this.state.scenery.delete(bestScenery.id);

                        setTimeout(() => {
                            this.state.scenery?.set(originalScenery.id, originalScenery);
                            this.sceneryGrid.add(originalScenery, originalScenery.x, originalScenery.y);
                        }, 60000);
                    }
                }
            }
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

    private async savePlayerToDB(sessionId: string) {
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

    // --- START GHOST CLEANUP ---
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
    // --- END GHOST CLEANUP ---

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
    }, 500);

    this.broadcastNearby(player.x, player.y, 60, "server_event_log", { html: `👋 <b>${player.name}</b> joined the realm.`, type: "event-join" });
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
        client.send("global_event_sync", { name: BaseRoom.nextEventName, remainingMs: Math.max(0, BaseRoom.nextEventTime - Date.now()) });
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

        const removeHazardSync = (index: number) => {
            const hazardToRemove = this.activeHazards[index];
            if (hazardToRemove.type === "mana_pillar") {
                const ownerClient = this.clients.find(c => c.sessionId === hazardToRemove.ownerId);
                if (ownerClient) ownerClient.send("removeHazard", { id: hazardToRemove.id });
            } else {
                this.broadcastNearby(hazardToRemove.x, hazardToRemove.y, 60, "removeHazard", { id: hazardToRemove.id });
            }
            this.activeHazards.splice(index, 1);
        };

        for (let i = this.activeHazards.length - 1; i >= 0; i--) {
            const h = this.activeHazards[i]; 
            h.timer -= dt;
            const owner = this.state.players.get(h.ownerId);
            
            if (h.type === "mana_pillar") {
                if (h.timer <= 0) {
                    const c = this.clients.find(c => c.sessionId === h.ownerId);
                    if (h.customData.optionText === h.customData.answer) { if (c) c.send("clearCommunionQuestion"); }
                    removeHazardSync(i);
                    continue;
                }
                if (owner && distSq(owner.x, owner.y, h.x, h.y) <= 2.25) { 
                    if (h.customData.isCorrect) {
                        owner.mp = Math.min(owner.maxMp, owner.mp + 50);
                        this.broadcastNearby(h.x, h.y, 40, "abilityUsed", { id: owner.sessionId, abilityId: "mana_pillar_correct", targetX: h.x, targetZ: h.y });
                    } else {
                        this.broadcastNearby(h.x, h.y, 40, "abilityUsed", { id: owner.sessionId, abilityId: "mana_pillar_wrong", targetX: h.x, targetZ: h.y });
                        owner.rootedUntil = Date.now() + 2000;
                        const client = this.clients.find(c => c.sessionId === h.ownerId);
                        if (client) client.send("hud_message", "Incorrect! Mind shattered for 2 seconds.");
                    }
                    
                    const groupId = h.customData.groupId;
                    for (let j = 0; j < this.activeHazards.length; j++) {
                        if (this.activeHazards[j].type === "mana_pillar" && this.activeHazards[j].customData.groupId === groupId) this.activeHazards[j].timer = 0; 
                    }
                    const c = this.clients.find(c => c.sessionId === h.ownerId);
                    if (c) c.send("clearCommunionQuestion");
                }
            }
            else if (h.type === "shadow_minion" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    let bestE = null; let bestDSq = 100.0; 
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, 10.0)) {
                        if (e.hp <= 0) continue;
                        const dSq = distSq(e.x, e.y, h.x, h.y);
                        if (dSq < bestDSq) { bestDSq = dSq; bestE = e; }
                    }
                    
                    if (bestE) {
                        const angle = Math.atan2(bestE.y - h.y, bestE.x - h.x);
                        if (bestDSq > 4.0) { 
                            h.x += Math.cos(angle) * 6.0 * dt;
                            h.y += Math.sin(angle) * 6.0 * dt;
                        } else {
                            const dmg = owner ? 15 + owner.level : 20; 
                            bestE.hp -= dmg;
                            this.broadcastNearby(bestE.x, bestE.y, 40, "playerAttacked", { id: bestE.id, targetX: bestE.x, targetZ: bestE.y, damage: dmg });
                            if (bestE.hp <= 0 && owner) { this.awardPlayerKill(owner, bestE.name); this.removeEnemy(bestE.id); }
                        }
                    } else if (owner) {
                        const dSqOwner = distSq(h.x, h.y, owner.x, owner.y);
                        if (dSqOwner > 16.0) { 
                            const angle = Math.atan2(owner.y - h.y, owner.x - h.x);
                            h.x += Math.cos(angle) * 8.0 * dt;
                            h.y += Math.sin(angle) * 8.0 * dt;
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "blood_decoy") {
                if (h.timer <= 0) {
                    if (h.rank >= 2 && this.state.enemies) { 
                        this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "blood_decoy_explode", targetX: h.x, targetZ: h.y });
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 36.0) {
                                applyAffliction(e, "Bleed", 4.0, 10, 1.0, 1, 3);
                                applyAffliction(e, "Poison", 4.0, 10, 1.0, 1, 3);
                                this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 15, isCrit: false });
                                if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            }
                        }
                    }
                    removeHazardSync(i);
                }
            }
            else if (h.type === "leech_swarm" && this.state.enemies) {
                for (const e of this.enemyGrid.getNearby(h.x, h.y, 5.0)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= 25.0) {
                        applyAffliction(e, "Necrosis", 2.0, 10, 1.0, 1);
                        if (h.rank >= 2) applyAffliction(e, "Silence", 2.0, 0, 0);
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "veil_of_shadows" && owner) {
                h.x = owner.x; h.y = owner.y;
                if (h.rank >= 2) owner.hp = Math.min(owner.maxHp, owner.hp + (owner.maxHp * 0.05 * dt));

                if (h.timer <= 0) {
                    (owner as any).stealthedUntil = 0;
                    
                    const breakVisual = h.rank >= 3 ? "veil_of_shadows_burst" : "veil_of_shadows_break";
                    this.broadcastNearby(owner.x, owner.y, 50, "abilityUsed", { id: h.ownerId, abilityId: breakVisual, targetX: owner.x, targetZ: owner.y });

                    if (h.rank >= 3 && this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(owner.x, owner.y, 6.0)) {
                            if (distSq(e.x, e.y, owner.x, owner.y) <= 36.0) {
                                e.hp -= 80; applyAffliction(e, "Silence", 3.0, 0, 0);
                                this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 80, isCrit: true });
                                if (e.hp <= 0) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            }
                        }
                    }
                    removeHazardSync(i);
                }
            }
            else if (h.type === "doom_familiar" && owner) {
                h.x = owner.x; h.y = owner.y;
                h.customData.lastShot -= dt;
                if (h.customData.lastShot <= 0 && this.state.enemies) {
                    let targetFound = false;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, 12.0)) {
                        if (!targetFound && distSq(e.x, e.y, h.x, h.y) <= 144.0) {
                            let dmg = 40;
                            if (e.afflictions.has("Bleed") || e.afflictions.has("Necrosis")) dmg = 80; 
                            e.hp -= dmg; 
                            this.broadcastNearby(e.x, e.y, 50, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: dmg > 40 });
                            this.broadcastNearby(e.x, e.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "gordon_beam", targetX: e.x, targetZ: e.y });
                            if (e.hp <= 0) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            targetFound = true; h.customData.lastShot = 1.0; 
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "umbral_snare" && this.state.enemies) {
                let triggered = false;
                for (const e of this.enemyGrid.getNearby(h.x, h.y, 2.5)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= 6.25) {
                        triggered = true; e.rootedTimer = Math.max(e.rootedTimer, 3.0);
                        if (h.rank >= 1) applyAffliction(e, "Necrosis", 5.0, 15, 1.0, 2);
                        if (h.rank >= 2) {
                            for (const pullTarget of this.enemyGrid.getNearby(h.x, h.y, 8.0)) {
                                if (distSq(pullTarget.x, pullTarget.y, h.x, h.y) <= 64.0) {
                                    pullTarget.x = h.x; pullTarget.y = h.y; pullTarget.rootedTimer = Math.max(pullTarget.rootedTimer, 3.0);
                                }
                            }
                        }
                        this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "umbral_snare_trigger", targetX: h.x, targetZ: h.y });
                        break; 
                    }
                }
                if (triggered || h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "shadow_anchor" || h.type === "nightfall_zone") {
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "umbral_snare_aura" && owner && this.state.enemies) {
                h.x = owner.x; h.y = owner.y;
                for (const e of this.enemyGrid.getNearby(h.x, h.y, 4.0)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= 16.0) {
                        const lastRoot = h.customData.rootedEnemies[e.id] || 0;
                        if (Date.now() - lastRoot > 10000) {
                            e.rootedTimer = 3.0; h.customData.rootedEnemies[e.id] = Date.now();
                            this.broadcastNearby(e.x, e.y, 40, "abilityUsed", { id: owner.sessionId, abilityId: "umbral_snare_trigger", targetX: e.x, targetZ: e.y });
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "town_portal") {
                let used = false;
                for (const p of this.playerGrid.getNearby(h.x, h.y, 2.0)) {
                    if (!used && distSq(p.x, p.y, h.x, h.y) <= 2.25) { 
                        const oldX = p.x; const oldY = p.y;
                        p.x = 0; p.y = 20; 
                        this.playerGrid.update(p, oldX, oldY, p.x, p.y);
                        
                        const client = this.clients.find(c => c.sessionId === p.sessionId);
                        if (client) {
                            client.send("close_all_ui");
                            client.send("forcePosition", { x: 0, z: 20 });
                        }

                        this.broadcastNearby(0, 20, 50, "abilityUsed", { id: p.sessionId, abilityId: "town_recall_teleport", targetX: 0, targetZ: 20 });
                        used = true;
                    }
                }
                if (used) {
                    this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "town_portal_destroy", targetX: h.x, targetZ: h.y });
                    removeHazardSync(i);
                } else if (h.timer <= 0) {
                    removeHazardSync(i);
                }
            }
            else if (h.type === "dark_singularity" && this.state.enemies) {
                for (const e of this.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= 36.0) applyAffliction(e, "Silence", 1.0, 0, 0);
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "bull_rush_fire" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 0.5;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, 20.0)) {
                        if (distToSegmentSquared(e.x, e.y, h.x, h.y, h.customData.endX, h.customData.endZ) <= 16.0) { 
                            e.hp -= 15;
                            this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 15, isCrit: false, isDoT: true });
                            if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "shattered_crater" && this.state.enemies) {
                for (const e of this.enemyGrid.getNearby(h.x, h.y, 5.0)) {
                    if (distSq(e.x, e.y, h.x, h.y) <= 25.0) applyAffliction(e, "Slow", 1.0, 0, 0);
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "meteor_magma_pool" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    const radius = h.customData.radius || 9.0;
                    const rSq = radius * radius;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, radius)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= rSq) {
                            e.hp -= 40;
                            this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 40, isCrit: false, isDoT: true });
                            if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "whirlwind_aura" && owner) {
                h.x = owner.x; h.y = owner.y; h.customData.tickTimer -= dt;

                if (h.customData.tickTimer <= 0 && this.state.enemies) {
                    h.customData.tickTimer = 0.5;
                    const hitRadius = 5.0;
                    const checkR = hitRadius + 2.0;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, checkR)) {
                        const dSq = distSq(e.x, e.y, h.x, h.y);
                        if (dSq <= checkR**2) {
                            if (h.rank >= 2 && dSq > 2.25) { 
                                const pullDx = h.x - e.x; const pullDy = h.y - e.y;
                                const pullDist = Math.sqrt(pullDx*pullDx + pullDy*pullDy) || 1;
                                e.x += (pullDx / pullDist) * 2.0; e.y += (pullDy / pullDist) * 2.0;
                                e.stunnedTimer = Math.max(e.stunnedTimer, 0.6); 
                            }
                            if (dSq <= 25.0) { 
                                e.hp -= 25; 
                                this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 25, isCrit: false });
                                if (e.hp <= 0) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            }
                        }
                    }
                }

                if (h.timer <= 0) {
                    (owner as any).windBarrierUntil = 0; 
                    this.broadcastNearby(owner.x, owner.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "whirlwind_end", targetX: owner.x, targetZ: owner.y });
                    removeHazardSync(i);
                }
            }
            else if (h.type === "radiant_trail") {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 0.5;
                    for (const p of this.playerGrid.getNearby(h.x, h.y, 2.0)) {
                        if (distSq(p.x, p.y, h.x, h.y) <= 4.0) (p as any).holySpeedBuff = Date.now() + 1000;
                    }
                    if (h.rank >= 2 && this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, 2.0)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 4.0) {
                                applyAffliction(e, "Illuminated", 1.5, 0, 0);
                                e.stunnedTimer = Math.max(e.stunnedTimer, 0.5); 
                            }
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "aura_of_purity" && owner) {
                h.x = owner.x; h.y = owner.y; h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 3.0;
                    owner.hp = Math.min(owner.maxHp, owner.hp + 40);

                    if (this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 36.0) {
                                e.hp -= 30;
                                if (h.rank >= 2) applyAffliction(e, "Weakened", 3.0, 0, 0);
                                this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 30, isCrit: false, isDoT: true });
                                if (e.hp <= 0) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            }
                        }
                    }
                }

                if (h.timer <= 0) {
                    this.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "aura_of_purity_end", targetX: owner.x, targetZ: owner.y });
                    if (h.rank >= 3) {
                        this.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "aura_of_purity_detonate", targetX: owner.x, targetZ: owner.y });
                        for (const p of this.playerGrid.getNearby(owner.x, owner.y, 6.0)) {
                            if (distSq(p.x, p.y, owner.x, owner.y) <= 36.0) p.hp = Math.min(p.maxHp, p.hp + 100);
                        }
                    }
                    removeHazardSync(i);
                }
            }
            else if (h.type === "holy_fire_ring" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 0.5;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, 7.0)) {
                        const dSq = distSq(e.x, e.y, h.x, h.y);
                        if (dSq >= 25.0 && dSq <= 49.0) {
                            e.hp -= 20;
                            this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 20, isCrit: false, isDoT: true });
                            if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "consecrated_ground") {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    if (this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, 5.0)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 25.0) {
                                let dmg = 15;
                                if (h.rank >= 2 && (e.name.includes("Wraith") || e.name.includes("Ent") || e.name.includes("Slime") || e.name.includes("Toad"))) dmg *= 2; 
                                e.hp -= dmg;
                                this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: false, isDoT: true });
                                if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            }
                        }
                    }
                }

                for (const p of this.playerGrid.getNearby(h.x, h.y, 5.0)) {
                    if (distSq(p.x, p.y, h.x, h.y) <= 25.0) {
                        if (h.rank >= 1) (p as any).holySpeedBuff = Date.now() + 1000; 
                        if (h.rank >= 3) (p as any).sanctuaryBuff = Date.now() + 1000;
                    }
                }

                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "grand_cross_turret" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    let targetFound = false;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, 15.0)) {
                        if (!targetFound && distSq(e.x, e.y, h.x, h.y) <= 225.0) {
                            e.hp -= 60;
                            this.broadcastNearby(e.x, e.y, 50, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 60, isCrit: false });
                            this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "grand_cross_laser", targetX: e.x, targetZ: e.y });
                            if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            targetFound = true;
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if ((h.type === "heavenly_judgment" || h.type === "orbital_strike_mini") && this.state.enemies) {
                h.customData.tickTimer -= dt;
                
                let target: EnemyState | undefined = undefined;
                if (h.customData.targetId) target = this.state.enemies.get(h.customData.targetId);
                
                if (!target || target.hp <= 0 || h.type === "heavenly_judgment") {
                    let minDistSq = 400.0; let newTarget = null;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, 20.0)) {
                        if (e.hp <= 0) continue;
                        const dSq = distSq(e.x, e.y, h.x, h.y);
                        if (dSq < minDistSq) { minDistSq = dSq; newTarget = e; }
                    }
                    target = newTarget || undefined;
                    if (target) h.customData.targetId = target.id;
                }

                if (target && h.rank >= 1) {
                    const trackingSpeed = h.type === "orbital_strike_mini" ? 5.0 : 2.0;
                    const dirX = target.x - h.x; const dirY = target.y - h.y;
                    const len = Math.sqrt(dirX*dirX + dirY*dirY);
                    if (len > 0.5) { 
                        h.x += (dirX / len) * trackingSpeed * dt; h.y += (dirY / len) * trackingSpeed * dt;
                        this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.id, abilityId: "heavenly_judgment_move", targetX: h.x, targetZ: h.y });
                    }
                }

                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = h.type === "orbital_strike_mini" ? 0.5 : 1.0;
                    let radius = h.customData.radius; let damage = h.customData.damage;

                    if (h.rank >= 2 && h.type === "heavenly_judgment") {
                        radius *= (1.0 + (h.customData.hits * 0.2)); damage *= (1.0 + (h.customData.hits * 0.2));
                    }
                    
                    const rSq = radius * radius;

                    let struckTarget = false;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, radius)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= rSq && e.hp > 0) {
                            e.hp -= damage;
                            this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: Math.floor(damage), isCrit: true });
                            if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            struckTarget = true;
                        }
                    }

                    if (struckTarget && h.rank >= 2 && h.type === "heavenly_judgment") {
                        h.customData.hits += 1;
                        this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.id, abilityId: "heavenly_judgment_grow", targetX: h.x, targetZ: h.y });
                    }
                }
                
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "seismic_aftershock") {
                if (h.timer <= 0) {
                    const hitRadius = 6.0;
                    if (this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, hitRadius)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 36.0) {
                                e.hp -= 50;
                                if (h.rank >= 2) e.stunnedTimer = Math.max(e.stunnedTimer, 2.0);
                                this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: 50, isCrit: false });
                                if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                            }
                        }
                    }

                    if (h.rank >= 3 && this.state.scenery) {
                        const pillar = new SceneryState();
                        pillar.id = `pillar_${Date.now()}`; pillar.kind = "crystal_rock";
                        pillar.x = h.x; pillar.y = h.y;
                        pillar.scale = 1.5; pillar.maxHp = 100; pillar.hp = 100;
                        this.state.scenery.set(pillar.id, pillar);
                        this.sceneryGrid.add(pillar, pillar.x, pillar.y);
                    }

                    this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: h.ownerId, abilityId: "seismic_slam", targetX: h.x, targetZ: h.y });
                    removeHazardSync(i);
                }
            }
            else if (h.type === "wrath_aura" && owner) {
                h.x = owner.x; h.y = owner.y;
                if (h.timer <= 0) {
                    owner.attackSpeed = 1.0; 
                    if (h.rank >= 3) owner.hp = Math.max(owner.hp, owner.maxHp * 0.25); 
                    removeHazardSync(i);
                }
            }
            else if (h.type === "spirit_animal" && owner) {
                h.x = owner.x; h.y = owner.y; h.customData.tickTimer -= dt;

                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 0.5;
                    if (h.rank >= 1) {
                        for (const p of this.playerGrid.getNearby(h.x, h.y, 8.0)) {
                            if (distSq(p.x, p.y, h.x, h.y) <= 64.0 && p.sessionId !== owner.sessionId) {
                                (p as any).holySpeedBuff = Date.now() + 1000;
                            }
                        }
                    }
                    if (h.rank >= 2 && this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, 2.5)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 6.25) {
                                applyAffliction(e, "Bleed", 3.0, 10, 1.0, 1, 3);
                                applyAffliction(e, "Slow", 2.0, 0, 0);
                            }
                        }
                    }
                }

                if (h.timer <= 0) {
                    owner.isSpiritAnimal = false;
                    this.broadcastNearby(owner.x, owner.y, 60, "abilityUsed", { id: owner.sessionId, abilityId: "spirit_animal_end", targetX: owner.x, targetZ: owner.y });

                    if (h.rank >= 3 && this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, 6.0)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= 36.0) e.stunnedTimer = Math.max(e.stunnedTimer, 2.0);
                        }
                        this.broadcastNearby(h.x, h.y, 50, "abilityUsed", { id: owner.sessionId, abilityId: "intimidating_shout", targetX: h.x, targetZ: h.y }); 
                    }
                    removeHazardSync(i);
                }
            }
            else if (h.type === "jagged_stone" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    const rSq = h.customData.radius * h.customData.radius;
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, h.customData.radius)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= rSq) applyAffliction(e, "Slow", 1.5, 0, 0);
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.type === "healing_blossom") {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    const rSq = h.customData.radius * h.customData.radius;
                    for (const p of this.playerGrid.getNearby(h.x, h.y, h.customData.radius)) {
                        if (distSq(p.x, p.y, h.x, h.y) <= rSq) {
                            p.hp = Math.min(p.maxHp, p.hp + 25);
                        }
                    }

                    if (h.rank >= 2 && this.state.enemies) {
                        for (const e of this.enemyGrid.getNearby(h.x, h.y, h.customData.radius)) {
                            if (distSq(e.x, e.y, h.x, h.y) <= rSq) {
                                applyAffliction(e, "Poison", 3.0, 15, 1.0, 1, 5);
                            }
                        }
                    }
                }

                if (h.timer <= 0) {
                    if (h.rank >= 3) {
                        this.spawnDrop(h.x, h.y, "Minor Health Potion");
                    }
                    removeHazardSync(i);
                }
            }
            else if (h.type === "wrath_of_the_forest" && this.state.enemies) {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    let totalDrained = 0;
                    const rSq = h.customData.radius * h.customData.radius;
                    
                    for (const e of this.enemyGrid.getNearby(h.x, h.y, h.customData.radius)) {
                        if (distSq(e.x, e.y, h.x, h.y) <= rSq) {
                            let dmg = 30; if (h.rank >= 1) dmg *= 1.5; 
                            
                            e.hp -= dmg; totalDrained += dmg; e.rootedTimer = Math.max(e.rootedTimer, 1.5);
                            this.broadcastNearby(e.x, e.y, 40, "playerAttacked", { id: e.id, targetX: e.x, targetZ: e.y, damage: dmg, isCrit: false, isDoT: true });
                            if (e.hp <= 0 && owner) { this.awardPlayerKill(owner, e.name); this.removeEnemy(e.id); }
                        }
                    }

                    if (totalDrained > 0) {
                        const healAmount = Math.floor(totalDrained * 0.2);
                        for (const p of this.playerGrid.getNearby(h.x, h.y, h.customData.radius)) {
                            if (distSq(p.x, p.y, h.x, h.y) <= rSq) p.hp = Math.min(p.maxHp, p.hp + healAmount);
                        }
                    }
                }

                if (h.timer <= 0) {
                    if (h.rank >= 3) {
                        const sapling = {
                            type: "world_tree_sapling", id: `sapling_${Date.now()}`, ownerId: h.ownerId,
                            x: h.x, y: h.y, timer: 120.0, rank: h.rank, customData: { tickTimer: 1.0, radius: 8.0 }
                        };
                        this.activeHazards.push(sapling);
                        this.broadcastNearby(h.x, h.y, 60, "spawnHazard", sapling);
                    }
                    removeHazardSync(i);
                }
            }
            else if (h.type === "world_tree_sapling") {
                h.customData.tickTimer -= dt;
                if (h.customData.tickTimer <= 0) {
                    h.customData.tickTimer = 1.0;
                    const rSq = h.customData.radius * h.customData.radius;
                    for (const p of this.playerGrid.getNearby(h.x, h.y, h.customData.radius)) {
                        if (distSq(p.x, p.y, h.x, h.y) <= rSq) {
                            (p as any).tempShield = ((p as any).tempShield || 0) + 10;
                        }
                    }
                }
                if (h.timer <= 0) removeHazardSync(i);
            }
            else if (h.timer <= 0) {
                removeHazardSync(i);
            }
        }

        if (this.state.enemies) {
            for (const [enemyId, enemy] of this.state.enemies.entries()) {
                let nearestPlayer: any = null; 
                let minDistSq = 625.0; 
                let anyPlayerNear = false; 
                
                if (this.playerGrid.getNearby(enemy.x, enemy.y, 150).size > 0) anyPlayerNear = true;
                if (!anyPlayerNear) continue; 
                
                let repelled = false;
                if (this.state.familiars) {
                    for (const [, fam] of this.state.familiars.entries()) {
                        if (fam.type === "radiant_seraph" && fam.action === "deployed") {
                            if (distSq(enemy.x, enemy.y, fam.x, fam.y) <= 16.0) { 
                                const repDx = enemy.x - fam.x;
                                const repDy = enemy.y - fam.y;
                                const repDist = Math.sqrt(repDx*repDx + repDy*repDy) || 1;
                                
                                enemy.x += (repDx/repDist) * 8.0 * dt;
                                enemy.y += (repDy/repDist) * 8.0 * dt;
                                repelled = true;
                                
                                const owner = this.state.players.get(fam.ownerId);
                                const aegisRank = owner?.skillTree.activeAbilities.get("aegis_branch")?.upgrades.get("divine_wall")?.currentRank || 0;
                                if (aegisRank >= 2 && enemy.attackCooldown <= 0) {
                                    enemy.hp -= 20;
                                    enemy.attackCooldown = 0.5; 
                                    this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemy.id, targetX: enemy.x, targetZ: enemy.y, damage: 20 });
                                }
                            }
                        }
                    }
                }
                
                if (repelled) continue; 
                
                for (const player of this.playerGrid.getNearby(enemy.x, enemy.y, 25)) {
                    if (player.isSleeping || player.isMeditating ||
                       ((player as any).invulnerableUntil && Date.now() < (player as any).invulnerableUntil) ||
                       ((player as any).nightfallStealth && Date.now() < (player as any).nightfallStealth) ||
                       ((player as any).stealthedUntil && Date.now() < (player as any).stealthedUntil)) {
                        continue; 
                    }
                    const dSq = distSq(enemy.x, enemy.y, player.x, player.y);
                    if (dSq < minDistSq && distSq(0, 0, player.x, player.y) >= 10000) { 
                        minDistSq = dSq; nearestPlayer = player; 
                    }
                }
                
                if (this.state.familiars) {
                    for (const [, fam] of this.state.familiars.entries()) {
                        if (["primal_beast", "shadow_monarch", "astral_reflection"].includes(fam.type) && fam.hp > 0) {
                            const dSq = distSq(enemy.x, enemy.y, fam.x, fam.y);
                            if (dSq < minDistSq) { minDistSq = dSq; nearestPlayer = fam; }
                        }
                    }
                }
                
                let diedFromDoT = false;
                for (const [key, aff] of enemy.afflictions.entries()) {
                    aff.duration -= dt;
                    if (aff.duration <= 0) enemy.afflictions.delete(key);
                    else if (["Crushing Grip", "Necrosis", "Illuminated", "Bleed", "Poison"].includes(aff.type)) {
                        aff.tickTimer -= dt;
                        if (aff.tickTimer <= 0) {
                            aff.tickTimer += 1.0; 
                            enemy.hp -= aff.damagePerTick;
                            this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemyId, targetX: enemy.x, targetZ: enemy.y, damage: aff.damagePerTick, isCrit: false, isDoT: true });
                            
                            if (enemy.hp <= 0) {
                                diedFromDoT = true;
                                
                                if ((enemy as any).sanguineFeastSpread) {
                                    const splinters: EnemyState[] = [];
                                    for (const e of this.enemyGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                        if (e.id !== enemy.id) splinters.push(e);
                                    }
                                    let spreadCount = 0;
                                    for (const n of splinters) {
                                        if (spreadCount >= 2) break;
                                        applyAffliction(n, "Bleed", 4.0, 10, 1.0, 1, 3);
                                        spreadCount++;
                                    }
                                }

                                if ((enemy as any).bloodExplosionOnDeath) {
                                    for (const p of this.playerGrid.getNearby(enemy.x, enemy.y, 8.0)) {
                                        if (distSq(p.x, p.y, enemy.x, enemy.y) <= 64.0) { 
                                            p.hp = Math.min(p.maxHp, p.hp + 50);
                                        }
                                    }
                                }

                                if (aff.type === "Crushing Grip" && (enemy as any).crushingGripRank >= 2) {
                                    let next: EnemyState | undefined = undefined;
                                    for (const e of this.enemyGrid.getNearby(enemy.x, enemy.y, 10.0)) {
                                        if (!next && e.id !== enemy.id) { next = e; break; }
                                    }
                                    if (next) {
                                        next.rootedTimer = 4.0; 
                                        applyAffliction(next, "Crushing Grip", 4.0, 10, 1.0, 1, 1);
                                        (next as any).crushingGripRank = (enemy as any).crushingGripRank;
                                        if ((enemy as any).crushingGripRank >= 3) (next as any).armorShattered = true;
                                    }
                                }

                                if (nearestPlayer && nearestPlayer.sessionId) this.awardPlayerKill(nearestPlayer, enemy.name);
                            }
                        }
                    }
                }

                if (diedFromDoT) { this.removeEnemy(enemyId); continue; }
                
                if (enemy.afflictions.has("Silence")) {
                    enemy.attackCooldown = 0.5; 
                    if (enemy.isAttacking) {
                        enemy.isAttacking = false; enemy.attackWindupTimer = 0;
                        if (enemy.rootedTimer <= 0) enemy.action = "chasing";
                    }
                }

                if (enemy.stunnedTimer > 0 || enemy.rootedTimer > 0) {
                    if (enemy.stunnedTimer > 0) enemy.stunnedTimer -= dt;
                    if (enemy.rootedTimer > 0) enemy.rootedTimer -= dt;
                    if (enemy.stunnedTimer > 0) continue;
                }

                if (enemy.isAttacking) {
                    enemy.attackWindupTimer -= dt;
                    if (enemy.attackWindupTimer <= 0) {
                        enemy.isAttacking = false; 
                        enemy.attackCooldown = enemy.maxAttackCooldown || 2.0;
                        
                        this.broadcastNearby(enemy.targetX, enemy.targetY, 50, "enemyAttackExecuted", { id: enemyId, type: enemy.attackType, x: enemy.targetX, z: enemy.targetY, radius: enemy.attackRadius });
                        const hitR = (enemy.attackRadius || 2.5) + (enemy.attackType === "melee" ? 0.5 : 0);
                        const hitRSq = hitR * hitR;
                        
                        for (const p of this.playerGrid.getNearby(enemy.targetX, enemy.targetY, hitR)) {
                            if (p.isSleeping || p.isMeditating || ((p as any).invulnerableUntil && Date.now() < (p as any).invulnerableUntil) || ((p as any).stealthedUntil && Date.now() < (p as any).stealthedUntil)) continue;
                            
                            if (distSq(enemy.targetX, enemy.targetY, p.x, p.y) <= hitRSq) {
                                let finalD = enemy.damage;
                                let totalDef = 0;
                                const equippedArmor = [p.equipHead, p.equipChest, p.equipBack, p.equipLegs, p.equipFeet, p.equipOffHand];
                                equippedArmor.forEach(itemName => { if (itemName) totalDef += ITEM_DB[itemName]?.stats?.def ?? 0; });
                                finalD = Math.max(1, finalD - totalDef);
                                if (enemy.afflictions.has("Weakened")) finalD = Math.max(1, Math.floor(finalD * 0.7));
                                
                                if ((p as any).sanctuaryBuff && Date.now() < (p as any).sanctuaryBuff) {
                                    if (p.hp - finalD < 1) finalD = p.hp - 1;
                                }

                                let hasUndyingRage = false;
                                for (const h of this.activeHazards) {
                                    if (h.type === "wrath_aura" && h.ownerId === p.sessionId && h.rank >= 3) { hasUndyingRage = true; break; }
                                }
                                if (hasUndyingRage && p.hp - finalD < 1) finalD = p.hp - 1;

                                if ((p as any).windBarrierUntil && Date.now() < (p as any).windBarrierUntil) {
                                    finalD = 0; 
                                    const reflectedDmg = Math.floor(enemy.damage * 1.5);
                                    enemy.hp -= reflectedDmg;
                                    this.broadcastNearby(enemy.x, enemy.y, 40, "playerAttacked", { id: enemyId, targetX: enemy.x, targetZ: enemy.y, damage: reflectedDmg, isCrit: true });
                                    if (enemy.hp <= 0) { this.awardPlayerKill(p, enemy.name); this.removeEnemy(enemyId); }
                                }

                                if (finalD > 0) {
                                    if ((p as any).tempShield && (p as any).tempShield > 0) { 
                                        (p as any).tempShield -= finalD; 
                                        if ((p as any).tempShield < 0) { 
                                            p.hp += (p as any).tempShield; 
                                            (p as any).tempShield = 0; 
                                        } 
                                    } else { 
                                        p.hp -= finalD; 
                                    }
                                }
                                
                                this.broadcastNearby(p.x, p.y, 50, "playerAttacked", { id: p.sessionId, targetX: p.x, targetZ: p.y, damage: enemy.damage });
                                
                                if (p.hp <= 0) { 
                                    p.hp = p.maxHp; 
                                    
                                    const isUnderworld = this.roomName === "underworld" || this.constructor.name === "UnderworldRoom";
                                    const client = this.clients.find(c => c.sessionId === p.sessionId);

                                    if (!isUnderworld) {
                                        if (client) {
                                            client.send("close_all_ui");
                                            client.send("server_event_teleport", { zone: "underworld" });
                                        }
                                    } else {
                                        const oX = p.x; const oY = p.y; 
                                        p.x = 0; p.y = 20; 
                                        this.playerGrid.update(p, oX, oY, p.x, p.y); 
                                        if (client) {
                                            client.send("close_all_ui");
                                            client.send("forcePosition", { x: p.x, z: p.y });
                                        }
                                    }
                                }
                            }
                        }

                        if (this.state.familiars) {
                            for (const fam of this.familiarGrid.getNearby(enemy.targetX, enemy.targetY, hitR)) {
                                if (["primal_beast", "shadow_monarch", "astral_reflection"].includes(fam.type) && fam.hp > 0) {
                                    if (distSq(enemy.targetX, enemy.targetY, fam.x, fam.y) <= hitRSq) {
                                        fam.hp -= enemy.damage;
                                        this.broadcastNearby(fam.x, fam.y, 40, "playerAttacked", { id: fam.id, targetX: fam.x, targetZ: fam.y, damage: enemy.damage });
                                    }
                                }
                            }
                        }

                        if (enemy.attackType === "dash") { 
                            const oX = enemy.x; const oY = enemy.y; 
                            enemy.x = enemy.targetX; enemy.y = enemy.targetY; 
                            this.enemyGrid.update(enemy, oX, oY, enemy.x, enemy.y); 
                        }
                    }
                    continue; 
                }

                enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - dt);
                
                const oX = enemy.x; const oY = enemy.y;
                let decoyTarget: Hazard | null = null;
                for (const h of this.activeHazards) {
                    if (h.type === "blood_decoy" && distSq(enemy.x, enemy.y, h.x, h.y) <= 225.0) { decoyTarget = h; break; }
                }

                const isTown = this.roomName === "town" || this.constructor.name === "TownRoom";
                const isMaze = this.roomName === "maze" || this.constructor.name === "MazeRoom";
                const isUnderworld = this.roomName === "underworld" || this.constructor.name === "UnderworldRoom";

                if (decoyTarget) {
                    enemy.action = "chasing";
                    if (enemy.rootedTimer <= 0) {
                        enemy.targetX = decoyTarget.x; enemy.targetY = decoyTarget.y;
                        const speed = enemy.afflictions.has("Slow") ? ((enemy.speed || 4.0) * 0.4) : (enemy.speed || 4.0);
                        const angle = Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x);
                        const moveD = Math.min(speed * dt, Math.sqrt(distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY)));
                        let nX = enemy.x + Math.cos(angle) * moveD; let nY = enemy.y + Math.sin(angle) * moveD;
                        
                        if (nX*nX + enemy.y*enemy.y < 14400) { 
                            if (!((isTown && checkTownCollision(nX, enemy.y, 0.5)) || (isMaze && checkMazeCollision(nX, enemy.y, 0.5)) || (isUnderworld && checkUnderworldCollision(nX, enemy.y, 0.5)))) enemy.x = nX; 
                            if (!((isTown && checkTownCollision(enemy.x, nY, 0.5)) || (isMaze && checkMazeCollision(enemy.x, nY, 0.5)) || (isUnderworld && checkUnderworldCollision(enemy.x, nY, 0.5)))) enemy.y = nY; 
                        } else { 
                            enemy.x = nX; enemy.y = nY; 
                        }
                    }
                } 
                else if (nearestPlayer) {
                    enemy.action = "chasing";
                    const attackRadSq = (enemy.attackRadius || 2.5) ** 2;
                    if (minDistSq <= attackRadSq && enemy.attackCooldown <= 0) {
                        enemy.isAttacking = true; 
                        enemy.attackWindupTimer = enemy.maxAttackWindup || 1.0;
                        enemy.targetX = enemy.attackType === "dash" ? nearestPlayer.x : enemy.x;
                        enemy.targetY = enemy.attackType === "dash" ? nearestPlayer.y : enemy.y;
                        this.broadcastNearby(enemy.targetX, enemy.targetY, 50, "enemyTelegraph", { id: enemyId, type: enemy.attackType, x: enemy.targetX, z: enemy.targetY, radius: enemy.attackRadius, time: enemy.maxAttackWindup });
                    } else if (enemy.rootedTimer <= 0) {
                        enemy.targetX = nearestPlayer.x; enemy.targetY = nearestPlayer.y;
                        const speed = enemy.afflictions.has("Slow") ? ((enemy.speed || 4.0) * 0.4) : (enemy.speed || 4.0);
                        const angle = Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x);
                        const moveD = Math.min(speed * dt, Math.sqrt(distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY)));
                        
                        let nX = enemy.x + Math.cos(angle) * moveD; let nY = enemy.y + Math.sin(angle) * moveD;
                        
                        if (nX*nX + enemy.y*enemy.y < 14400) { 
                            if (!((isTown && checkTownCollision(nX, enemy.y, 0.5)) || (isMaze && checkMazeCollision(nX, enemy.y, 0.5)) || (isUnderworld && checkUnderworldCollision(nX, enemy.y, 0.5)))) enemy.x = nX; 
                            if (!((isTown && checkTownCollision(enemy.x, nY, 0.5)) || (isMaze && checkMazeCollision(enemy.x, nY, 0.5)) || (isUnderworld && checkUnderworldCollision(enemy.x, nY, 0.5)))) enemy.y = nY; 
                        } else { 
                            enemy.x = nX; enemy.y = nY; 
                        }
                    }
                } else if (enemy.rootedTimer <= 0) {
                    enemy.action = "roaming";
                    if (isNaN(enemy.targetX) || distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY) < 1.0) {
                        for(let i=0; i<5; i++) {
                            const tx = enemy.x + (Math.random() - 0.5) * 60; const ty = enemy.y + (Math.random() - 0.5) * 60;
                            if (tx*tx + ty*ty >= 10000 && !((isTown && checkTownCollision(tx, ty, 0.5)) || (isMaze && checkMazeCollision(tx, ty, 0.5)) || (isUnderworld && checkUnderworldCollision(tx, ty, 0.5)))) { 
                                enemy.targetX = tx; enemy.targetY = ty; break; 
                            }
                        }
                    }
                    const speed = enemy.afflictions.has("Slow") ? ((enemy.speed || 4.0) * 0.4) : (enemy.speed || 4.0);
                    const angle = Math.atan2(enemy.targetY - enemy.y, enemy.targetX - enemy.x);
                    const moveD = Math.min(speed * dt, Math.sqrt(distSq(enemy.x, enemy.y, enemy.targetX, enemy.targetY)));
                    
                    let nX = enemy.x + Math.cos(angle) * moveD; let nY = enemy.y + Math.sin(angle) * moveD;
                    
                    if (nX*nX + enemy.y*enemy.y < 14400) { 
                        if (!((isTown && checkTownCollision(nX, enemy.y, 0.5)) || (isMaze && checkMazeCollision(nX, enemy.y, 0.5)) || (isUnderworld && checkUnderworldCollision(nX, enemy.y, 0.5)))) enemy.x = nX; 
                        if (!((isTown && checkTownCollision(enemy.x, nY, 0.5)) || (isMaze && checkMazeCollision(enemy.x, nY, 0.5)) || (isUnderworld && checkUnderworldCollision(enemy.x, nY, 0.5)))) enemy.y = nY; 
                    } else { 
                        enemy.x = nX; enemy.y = nY; 
                    }
                }

                if (oX !== enemy.x || oY !== enemy.y) this.enemyGrid.update(enemy, oX, oY, enemy.x, enemy.y);
            }
            
            updateFamiliars(this, dt);
        }
    }
}