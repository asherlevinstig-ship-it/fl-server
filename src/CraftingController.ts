import { BaseRoom } from "./rooms/BaseRoom"; 
import { PlayerState } from "./schema/PlayerState";
import { InventoryItemState } from "./schema/InventoryItemState";
import { ITEM_DB } from "./ItemDatabase";
import { CRAFTING_RECIPES } from "./RecipeDatabase";

// --- CORE CRAFTING LOGIC ---
export function handleCrafting(room: BaseRoom<any>, client: any, message: { recipeId: string }) {
    const player = room.state.players.get(client.sessionId) as PlayerState;
    if (!player || player.isSleeping || player.isMeditating) return;

    // Look up the recipe from the shared database
    const recipe = CRAFTING_RECIPES.find(r => r.id === message.recipeId);
    if (!recipe) {
        client.send("hud_message", "Unknown recipe.");
        return;
    }

    // Map properties from the shared RecipeDatabase format
    const outputItemName = recipe.name; 
    const outputQuantity = 1; // Default yield for blacksmith items
    
    const outputItemDef = ITEM_DB[outputItemName];
    if (!outputItemDef) {
        console.error(`Crafting error: Output item ${outputItemName} does not exist in ITEM_DB.`);
        return;
    }

    // 1. Check Coin Cost
    if (player.coins < recipe.cost) {
        client.send("hud_message", `<span style="color: #ff4444;">Not enough coins. Need ${recipe.cost}.</span>`);
        return;
    }

    // 2. Validate Ingredients & Cache References (O(1) Map Lookups)
    const itemsToConsume: { state: InventoryItemState, qty: number, name: string }[] = [];
    
    for (const req of recipe.reqs) {
        const playerItem = player.inventory.get(req.n);
        if (!playerItem || playerItem.quantity < req.q) {
            client.send("hud_message", `<span style="color: #ff4444;">Missing materials: Need more ${req.n}.</span>`);
            return;
        }
        // Cache the reference so we don't have to `.get()` it again during deduction
        itemsToConsume.push({ state: playerItem, qty: req.q, name: req.n });
    }

    // 3. Deduct Resources (Coins & Items)
    player.coins -= recipe.cost;

    for (const item of itemsToConsume) {
        item.state.quantity -= item.qty;
        
        // Remove item entirely if quantity drops to 0
        if (item.state.quantity <= 0) {
            if (player.equippedItem === item.name) player.equippedItem = "";
            player.inventory.delete(item.name);
        }
    }

    // 4. Grant Crafted Item
    if (player.inventory.has(outputItemName)) {
        player.inventory.get(outputItemName)!.quantity += outputQuantity;
    } else {
        const newItem = new InventoryItemState();
        newItem.name = outputItemName;
        newItem.quantity = outputQuantity;
        newItem.desc = outputItemDef.desc;
        player.inventory.set(outputItemName, newItem);
    }

    // 5. Visuals and Feedback
    client.send("hud_message", `<span style="color: #00ffaa;">Successfully crafted ${outputItemName}!</span>`);
    
    // PERFORMANCE: Use Interest Management instead of global broadcast
    if (typeof (room as any).broadcastNearby === "function") {
        (room as any).broadcastNearby(player.x, player.y, 60, "abilityUsed", { 
            id: player.sessionId, 
            abilityId: "holy_fire_ring", // Reuse this VFX for a crafting flash!
            targetX: player.x, 
            targetZ: player.y 
        });

        (room as any).broadcastNearby(player.x, player.y, 60, "server_event_log", {
            html: `⚒️ <b>${player.name}</b> forged a <b>${outputItemName}</b>.`,
            type: "event-info"
        });
    }

    // 6. Save to Firebase lazily via the tick loop
    if (typeof (room as any).markPlayerDirty === "function") {
        (room as any).markPlayerDirty(client.sessionId);
    }
}