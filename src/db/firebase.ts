import * as admin from "firebase-admin";

// Firebase needs your service account credentials to access the database from a Node server.
// The easiest way is to download your serviceAccountKey.json from the Firebase Console,
// place it in your server folder, and reference it here. 
// Alternatively, if you set the GOOGLE_APPLICATION_CREDENTIALS env variable, you can just call admin.initializeApp()

try {
  // If you downloaded a key file, uncomment the line below and point it to your file:
  // const serviceAccount = require("../../serviceAccountKey.json");
  
  admin.initializeApp({
    // credential: admin.credential.cert(serviceAccount)
    credential: admin.credential.applicationDefault() // Uses GOOGLE_APPLICATION_CREDENTIALS from your .env
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.error("Firebase Admin initialization error", error);
}

export const db = admin.firestore();