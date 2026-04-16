import express from 'express';
import { db } from './db/firebase'; 

const router = express.Router();

// --- REGISTER ---
router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password required." });
    }

    try {
        const userRef = db.collection("users").doc(username);
        const doc = await userRef.get();

        if (doc.exists) {
            return res.status(400).json({ error: "Username already exists." });
        }

        await userRef.set({
            username: username,
            password: password, 
            hasCharacter: false,
            createdAt: new Date().toISOString()
        });

        res.json({ success: true, message: "Account created successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userRef = db.collection("users").doc(username);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(400).json({ error: "Invalid username or password." });
        }

        const userData = doc.data();
        
        if (!userData || userData.password !== password) {
            return res.status(400).json({ error: "Invalid username or password." });
        }

        // FETCH CHARACTER DATA TO OVERRIDE HARDCODED CLIENT VALUES
        if (userData.hasCharacter && userData.characterName) {
            const charRef = db.collection("players").doc(userData.characterName);
            const charDoc = await charRef.get();
            
            if (charDoc.exists) {
                const charData = charDoc.data()!;
                return res.json({ 
                    success: true, 
                    username: userData.username, 
                    hasCharacter: true,
                    characterName: userData.characterName,
                    classId: charData.classId || "duelist",
                    pathwayId: charData.pathwayId || "shadow",
                    auraStyle: charData.auraStyle || "tyrant"
                });
            }
        }

        res.json({ 
            success: true, 
            username: userData.username, 
            hasCharacter: false 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

// --- CHARACTER CREATION ---
router.post('/create_character', async (req, res) => {
    const { username, charName, classId, pathwayId, auraStyle } = req.body;

    try {
        const userRef = db.collection("users").doc(username);
        const userDoc = await userRef.get();

        if (!userDoc.exists) return res.status(400).json({ error: "User not found." });

        const charRef = db.collection("players").doc(charName);
        const charDoc = await charRef.get();

        if (charDoc.exists) {
            return res.status(400).json({ error: "Character name is already taken." });
        }

        await charRef.set({
            name: charName,
            accountId: username,
            classId,
            pathwayId,
            auraStyle,
            rank: "Iron",
            level: 1,
            experience: 0,
            experienceToNextLevel: 500,
            x: 0,
            y: 0,
            hp: 100, maxHp: 100, mp: 100, maxMp: 100,
            stamina: 100, maxStamina: 100, hunger: 100, maxHunger: 100,
            coins: 500, 
            inventory: [],
            equippedItem: "",
            skillTree: { unspentEssencePoints: 2, unspentAwakeningPoints: 5, unlockedPassives: {}, activeAbilities: {} }
        });

        await userRef.update({ hasCharacter: true, characterName: charName });

        res.json({ success: true, characterName: charName });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error." });
    }
});

export default router;