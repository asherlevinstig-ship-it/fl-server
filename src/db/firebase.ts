import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config();
console.log("🔥 NEW FIREBASE BUILD ACTIVE");
function loadFirebaseServiceAccount(): admin.ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
  }

  let parsed: {
    project_id?: string;
    client_email?: string;
    private_key?: string;
    [key: string]: any;
  };

  try {
    parsed = JSON.parse(raw);
  } catch (parseError) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${
        parseError instanceof Error ? parseError.message : String(parseError)
      }`
    );
  }

  if (!parsed.project_id) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing project_id.");
  }

  if (!parsed.client_email) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing client_email.");
  }

  if (!parsed.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is missing private_key.");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n")
  };
}

try {
  const serviceAccount = loadFirebaseServiceAccount();

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