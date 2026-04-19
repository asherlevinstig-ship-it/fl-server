import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config();

try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
  }

  // Parse the JSON string from env
  const serviceAccount = JSON.parse(raw);

  // Fix for escaped newlines in private key (VERY IMPORTANT)
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  // Prevent re-initialisation (important for dev + hot reload)
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  console.log("🔥 Firebase Admin initialized successfully.");
} catch (error) {
  console.error("❌ CRITICAL: Firebase Admin initialization error:", error);
  process.exit(1);
}

export const db = admin.firestore();