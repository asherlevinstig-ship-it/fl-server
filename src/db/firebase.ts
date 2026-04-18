import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

try {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS environment variable.");
  }

  const absolutePath = path.resolve(credentialsPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Service account file not found at: ${absolutePath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log("🔥 Firebase Admin initialized successfully.");
} catch (error) {
  console.error("❌ CRITICAL: Firebase Admin initialization error:", error);
  process.exit(1);
}

export const db = admin.firestore();