#!/bin/bash
# ======================================================
# Production Deploy Script — Smart Complaint & Response System
# Run this on your AWS EC2 server via SSH.
# DO NOT overwrite .env — it is managed separately on the server.
# ======================================================

set -e  # Exit on any error

echo "=== STEP 3: Git Pull ==="
cd /home/ubuntu/Smart-complaint-and-Response-System
git pull origin main
echo "✅ Git pull complete."

echo ""
echo "=== Install Dependencies (production only) ==="
npm install --production
echo "✅ Dependencies installed."

echo ""
echo "=== STEP 4: DB Environment Safety Check ==="
node -e "require('dotenv').config(); console.log(process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? 'WRONG_DB_LOCALHOST' : 'DB_ENV_REMOTE_OK')"

# The script will exit here if something fails (set -e)
# If WRONG_DB_LOCALHOST is printed, the migration MUST NOT run.

echo ""
echo "=== STEP 4: Safe Schema Migration ==="
node safe_schema_migration.js

echo ""
echo "=== STEP 5: Restart App via PM2 ==="
node_modules/.bin/pm2 restart all
node_modules/.bin/pm2 status

echo ""
echo "=== DEPLOY COMPLETE ==="
echo "Run smoke tests next:"
echo "  node scripts/admin_smoke_test.js"
echo "  node scripts/role_flow_smoke_test.js"
