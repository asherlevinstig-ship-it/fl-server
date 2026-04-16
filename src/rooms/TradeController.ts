import { Client } from "colyseus";
import { BaseRoom } from "./BaseRoom";
import { InventoryItemState } from "../schema/InventoryItemState";
import { ITEM_DB } from "../ItemDatabase";

export interface TradeOffer {
    coins: number;
    items: Record<string, number>; // itemName -> quantity offered
    isReady: boolean;
    hasConfirmed: boolean;
}

export interface TradeSession {
    id: string;
    p1Id: string;
    p2Id: string;
    p1Offer: TradeOffer;
    p2Offer: TradeOffer;
}

const activeTrades = new Map<string, TradeSession>();
const pendingInvites = new Map<string, { targetId: string, expires: number }>();

function getPlayerOffer(session: TradeSession, sessionId: string): TradeOffer | null {
    if (session.p1Id === sessionId) return session.p1Offer;
    if (session.p2Id === sessionId) return session.p2Offer;
    return null;
}

function getTradePartner(session: TradeSession, sessionId: string): string | null {
    if (session.p1Id === sessionId) return session.p2Id;
    if (session.p2Id === sessionId) return session.p1Id;
    return null;
}

export function setupTradeSystem(room: BaseRoom<any>) {
    
    // 1. Request a Trade
    room.onMessage("trade_request", (client: Client, message: { targetId: string }) => {
        const p1 = room.state.players.get(client.sessionId);
        const p2 = room.state.players.get(message.targetId);
        
        if (!p1 || !p2 || p1.isSleeping || p2.isSleeping || client.sessionId === message.targetId) return;

        // Distance check
        const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
        if (distSq > 64.0) { // 8^2
            client.send("hud_message", "<span style='color:#ff4444;'>Player is too far away to trade.</span>");
            return;
        }

        pendingInvites.set(client.sessionId, { targetId: message.targetId, expires: Date.now() + 15000 });
        
        const targetClient = room.clients.find(c => c.sessionId === message.targetId);
        if (targetClient) {
            targetClient.send("trade_invite_received", { requesterId: client.sessionId, requesterName: p1.name });
            client.send("hud_message", `Trade request sent to ${p2.name}.`);
        }
    });

    // 2. Accept Trade
    room.onMessage("trade_accept", (client: Client, message: { requesterId: string }) => {
        const invite = pendingInvites.get(message.requesterId);
        if (!invite || invite.targetId !== client.sessionId || Date.now() > invite.expires) {
            client.send("hud_message", "<span style='color:#ff4444;'>Trade request expired or invalid.</span>");
            return;
        }

        pendingInvites.delete(message.requesterId);

        const tradeId = `trade_${Date.now()}`;
        const session: TradeSession = {
            id: tradeId,
            p1Id: message.requesterId,
            p2Id: client.sessionId,
            p1Offer: { coins: 0, items: {}, isReady: false, hasConfirmed: false },
            p2Offer: { coins: 0, items: {}, isReady: false, hasConfirmed: false }
        };

        activeTrades.set(tradeId, session);

        const p1Client = room.clients.find(c => c.sessionId === session.p1Id);
        const p2Client = room.clients.find(c => c.sessionId === session.p2Id);

        if (p1Client && p2Client) {
            p1Client.send("trade_started", { tradeId, partnerName: room.state.players.get(session.p2Id)?.name });
            p2Client.send("trade_started", { tradeId, partnerName: room.state.players.get(session.p1Id)?.name });
            broadcastTradeSync(room, session);
        }
    });

    // 3. Decline Trade
    room.onMessage("trade_decline", (client: Client, message: { requesterId: string }) => {
        pendingInvites.delete(message.requesterId);
        const reqClient = room.clients.find(c => c.sessionId === message.requesterId);
        if (reqClient) reqClient.send("hud_message", "<span style='color:#ffaa00;'>Trade request was declined.</span>");
    });

    // 4. Modify Trade Offer (Items & Coins)
    room.onMessage("trade_update_offer", (client: Client, message: { tradeId: string, coins: number, items: Record<string, number> }) => {
        const session = activeTrades.get(message.tradeId);
        if (!session) return;

        const offer = getPlayerOffer(session, client.sessionId);
        const player = room.state.players.get(client.sessionId);
        
        if (!offer || !player || offer.isReady) return; // Cannot modify if ready

        // Validate Coins
        let safeCoins = Math.max(0, Math.floor(message.coins));
        if (player.coins < safeCoins) safeCoins = player.coins;
        offer.coins = safeCoins;

        // Validate Items
        offer.items = {};
        for (const [itemName, qty] of Object.entries(message.items)) {
            const invItem = player.inventory.get(itemName);
            if (invItem && invItem.quantity > 0) {
                const safeQty = Math.min(Math.max(1, Math.floor(qty)), invItem.quantity);
                offer.items[itemName] = safeQty;
            }
        }

        // Modifying an offer un-readies both players to prevent bait-and-switch
        session.p1Offer.isReady = false; session.p1Offer.hasConfirmed = false;
        session.p2Offer.isReady = false; session.p2Offer.hasConfirmed = false;

        broadcastTradeSync(room, session);
    });

    // 5. Toggle Ready State
    room.onMessage("trade_toggle_ready", (client: Client, message: { tradeId: string }) => {
        const session = activeTrades.get(message.tradeId);
        if (!session) return;

        const offer = getPlayerOffer(session, client.sessionId);
        if (offer) {
            offer.isReady = !offer.isReady;
            offer.hasConfirmed = false; // Reset confirm if toggling ready
            broadcastTradeSync(room, session);
        }
    });

    // 6. Confirm Trade (Finalizing)
    room.onMessage("trade_confirm", (client: Client, message: { tradeId: string }) => {
        const session = activeTrades.get(message.tradeId);
        if (!session || !session.p1Offer.isReady || !session.p2Offer.isReady) return;

        const offer = getPlayerOffer(session, client.sessionId);
        if (offer) offer.hasConfirmed = true;

        broadcastTradeSync(room, session);

        // If both confirmed, execute the trade
        if (session.p1Offer.hasConfirmed && session.p2Offer.hasConfirmed) {
            executeTrade(room, session);
        }
    });

    // 7. Cancel Trade
    room.onMessage("trade_cancel", (client: Client, message: { tradeId: string }) => {
        cancelTrade(room, message.tradeId, "Trade cancelled.");
    });
}

// --- EXPORTED CLEANUP HELPER ---
export function cancelPlayerTrades(room: BaseRoom<any>, sessionId: string) {
    activeTrades.forEach((session, tradeId) => {
        if (session.p1Id === sessionId || session.p2Id === sessionId) {
            cancelTrade(room, tradeId, "Trade cancelled because a player left.");
        }
    });
}

function broadcastTradeSync(room: BaseRoom<any>, session: TradeSession) {
    const p1Client = room.clients.find(c => c.sessionId === session.p1Id);
    const p2Client = room.clients.find(c => c.sessionId === session.p2Id);

    const payload = {
        tradeId: session.id,
        p1: { id: session.p1Id, offer: session.p1Offer },
        p2: { id: session.p2Id, offer: session.p2Offer }
    };

    if (p1Client) p1Client.send("trade_sync", payload);
    if (p2Client) p2Client.send("trade_sync", payload);
}

function cancelTrade(room: BaseRoom<any>, tradeId: string, reason: string) {
    const session = activeTrades.get(tradeId);
    if (!session) return;

    const p1Client = room.clients.find(c => c.sessionId === session.p1Id);
    const p2Client = room.clients.find(c => c.sessionId === session.p2Id);

    if (p1Client) { p1Client.send("trade_cancelled"); p1Client.send("hud_message", `<span style='color:#ff4444;'>${reason}</span>`); }
    if (p2Client) { p2Client.send("trade_cancelled"); p2Client.send("hud_message", `<span style='color:#ff4444;'>${reason}</span>`); }

    activeTrades.delete(tradeId);
}

function executeTrade(room: BaseRoom<any>, session: TradeSession) {
    const p1 = room.state.players.get(session.p1Id);
    const p2 = room.state.players.get(session.p2Id);

    if (!p1 || !p2) {
        cancelTrade(room, session.id, "Trade failed: A player is missing.");
        return;
    }

    // FINAL SECURITY CHECK: Ensure both players STILL have what they offered
    const p1Valid = validateOfferPossession(p1, session.p1Offer);
    const p2Valid = validateOfferPossession(p2, session.p2Offer);

    if (!p1Valid || !p2Valid) {
        cancelTrade(room, session.id, "Trade failed: Items or coins missing from inventory.");
        return;
    }

    // --- PHASE 1: DEDUCT ---
    p1.coins -= session.p1Offer.coins;
    for (const [itemName, qty] of Object.entries(session.p1Offer.items)) {
        p1.inventory.get(itemName)!.quantity -= qty;
        if (p1.inventory.get(itemName)!.quantity <= 0) {
            if (p1.equippedItem === itemName) p1.equippedItem = "";
            p1.inventory.delete(itemName);
        }
    }

    p2.coins -= session.p2Offer.coins;
    for (const [itemName, qty] of Object.entries(session.p2Offer.items)) {
        p2.inventory.get(itemName)!.quantity -= qty;
        if (p2.inventory.get(itemName)!.quantity <= 0) {
            if (p2.equippedItem === itemName) p2.equippedItem = "";
            p2.inventory.delete(itemName);
        }
    }

    // --- PHASE 2: GIVE ---
    p1.coins += session.p2Offer.coins;
    for (const [itemName, qty] of Object.entries(session.p2Offer.items)) {
        if (p1.inventory.has(itemName)) {
            p1.inventory.get(itemName)!.quantity += qty;
        } else {
            const newItem = new InventoryItemState();
            newItem.name = itemName; newItem.quantity = qty; newItem.desc = ITEM_DB[itemName]?.desc || "";
            p1.inventory.set(itemName, newItem);
        }
    }

    p2.coins += session.p1Offer.coins;
    for (const [itemName, qty] of Object.entries(session.p1Offer.items)) {
        if (p2.inventory.has(itemName)) {
            p2.inventory.get(itemName)!.quantity += qty;
        } else {
            const newItem = new InventoryItemState();
            newItem.name = itemName; newItem.quantity = qty; newItem.desc = ITEM_DB[itemName]?.desc || "";
            p2.inventory.set(itemName, newItem);
        }
    }

    // --- FINALIZE ---
    room.markPlayerDirty(p1.sessionId);
    room.markPlayerDirty(p2.sessionId);
    activeTrades.delete(session.id);

    const p1Client = room.clients.find(c => c.sessionId === session.p1Id);
    const p2Client = room.clients.find(c => c.sessionId === session.p2Id);

    if (p1Client) { p1Client.send("trade_completed"); p1Client.send("hud_message", "<span style='color:#00ffaa;'>Trade completed successfully!</span>"); }
    if (p2Client) { p2Client.send("trade_completed"); p2Client.send("hud_message", "<span style='color:#00ffaa;'>Trade completed successfully!</span>"); }
}

function validateOfferPossession(player: any, offer: TradeOffer): boolean {
    if (player.coins < offer.coins) return false;
    for (const [itemName, qty] of Object.entries(offer.items)) {
        const invItem = player.inventory.get(itemName);
        if (!invItem || invItem.quantity < qty) return false;
    }
    return true;
}