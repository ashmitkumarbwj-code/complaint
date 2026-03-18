// Firebase Admin SDK Configuration for Backend Verification
const admin = require("firebase-admin");

// Note: In real production, this serviceAccount should be securely loaded
// from securely managed environment variables or a secure key vault.
try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : null;

    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin Initialized successfully.");
    } else {
        console.warn("Firebase Admin not fully initialized (Mocking for dev).");
    }
} catch (err) {
    console.error("Firebase Admin Error: ", err.message);
}

module.exports = admin;
