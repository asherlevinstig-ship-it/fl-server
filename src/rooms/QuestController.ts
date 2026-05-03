import { Client } from "@colyseus/core";
import { PlayerState, QuestProgressState } from "../schema/PlayerState";
import { QUEST_DB } from "../QuestDatabase";

export function progressQuest(
    room: any,
    player: PlayerState, 
    type: string, 
    targetId: string, 
    amount: number, 
    client: Client | undefined
) {
    if (!client) return;

    player.activeQuests.forEach((qProgress, qId) => {
        const qDef = QUEST_DB[qId];
        if (!qDef) return;

        const obj = qDef.objectives.find((o: any) => o.type === type && o.targetId === targetId);
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
                if (typeof room.markPlayerDirty === "function") {
                    room.markPlayerDirty(player.sessionId);
                }
            }
        }
    });
}