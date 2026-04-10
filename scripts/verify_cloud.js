require('dotenv').config();
const cloudinary = require('../config/cloudinary');

async function testCloud() {
    console.log("--- Cloud Connection Audit ---");
    try {
        const res = await cloudinary.api.ping();
        console.log("✅ Cloudinary: CONNECTED (Storage Active)");
    } catch (err) {
        console.log("❌ Cloudinary: FAILED (Check credentials)");
    }

    if (process.env.SMTP_USER && !process.env.SMTP_USER.includes('your_email')) {
        console.log("✅ Email (SMTP): CONFIGURED (Cloud Outbound Active)");
    } else {
        console.log("⚠️ Email (SMTP): MOCKED (Needs valid Gmail/SMTP credits)");
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT !== '{}') {
        console.log("✅ Firebase: CONFIGURED (Identity Services Active)");
    } else {
        console.log("⚠️ Firebase: MOCKED (Needs serviceAccount JSON)");
    }
}

testCloud();
