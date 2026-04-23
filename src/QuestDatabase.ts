export type QuestObjective = {
    type: "kill" | "gather" | "action";
    targetId: string; // e.g., "Dire Wolf", "Wood", "catch_fish", "select_ability"
    requiredAmount: number;
};

export type QuestDef = {
    id: string;
    title: string;
    giverName: string;
    dialogue: string;
    objectives: QuestObjective[];
    rewards: {
        coins: number;
        exp: number;
        items?: { name: string, quantity: number }[];
    };
    nextQuestId?: string; // For chaining questlines automatically
};

export const QUEST_DB: Record<string, QuestDef> = {
    "tutorial_0_ability": {
        id: "tutorial_0_ability",
        title: "Awakening: Your First Skill",
        giverName: "Lord Protector",
        dialogue: "Welcome to the realm! Before you brave the wilds, you must awaken your power. Open your Skill Tree (<span class='hud-key'>K</span>), choose a path, and click <b>SELECT SLOT</b> to commit your first skill!",
        objectives: [
            { type: "action", targetId: "select_ability", requiredAmount: 1 }
        ],
        rewards: { coins: 100, exp: 50 },
        nextQuestId: "tutorial_1_fish"
    },
    "tutorial_1_fish": {
        id: "tutorial_1_fish",
        title: "Survival 101: Fishing",
        giverName: "Lord Protector",
        dialogue: "The town needs food. Head to the lake to the North-West (X: -180, Z: 180) and press <span class='hud-key'>F</span> to cast your line.",
        objectives: [
            { type: "action", targetId: "catch_fish", requiredAmount: 1 }
        ],
        rewards: { coins: 50, exp: 100 },
        nextQuestId: "tutorial_2_tree"
    },
    "tutorial_2_tree": {
        id: "tutorial_2_tree",
        title: "Survival 102: Gathering",
        giverName: "Lord Protector",
        dialogue: "Excellent catch. Now we need materials. Find a tree and attack it to gather Wood.",
        objectives: [
            { type: "gather", targetId: "Wood", requiredAmount: 3 }
        ],
        rewards: { coins: 100, exp: 200 }
    }
};