#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# SMART CAMPUS - ONE-SHOT DEPLOYMENT SCRIPT
# Run this from your local machine once EC2 is accessible again.
# Usage: ssh + scp based deployment
# ═══════════════════════════════════════════════════════════════════════════════

EC2_USER="ubuntu"
EC2_IP="3.107.107.92"
PEM_KEY="C:\Users\Rajesh Kumar\Downloads\smart_campus.pem"
REMOTE_DIR="/home/ubuntu/Smart-complaint-and-Response-System"

echo "═══ SMART CAMPUS DEPLOYMENT ═══"
echo "Target: ${EC2_USER}@${EC2_IP}"

# Files to sync (all the fixed files)
FILES=(
    "public/css/style.css"
    "public/js/admin.js"
    "public/js/principal.js"
    "public/js/activate.js"
    "public/js/forgot-password.js"
    "public/js/uiUtils.js"
    "public/js/config.js"
    "controllers/authController.js"
    "utils/otpService.js"
    "workers/notificationWorker.js"
)

echo ""
echo "Uploading ${#FILES[@]} files..."

for f in "${FILES[@]}"; do
    echo "  → $f"
    scp -i "$PEM_KEY" "$f" "${EC2_USER}@${EC2_IP}:${REMOTE_DIR}/${f}"
done

echo ""
echo "Restarting PM2..."
ssh -i "$PEM_KEY" "${EC2_USER}@${EC2_IP}" "cd ${REMOTE_DIR} && pm2 restart all && pm2 status"

echo ""
echo "═══ DEPLOYMENT COMPLETE ═══"
