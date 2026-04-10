# Smart Campus Response System (SCRS) - Production Launch Guide
## AWS EC2 + RDS + Nginx + PM2 Deployment

This guide provides the sequence for launching the SCRS in a professional production environment.

---

### Phase 1: Infrastructure Setup (AWS)

1. **RDS (MySQL)**:
   - Create a MySQL 8.0 instance.
   - **Crucial**: Enable "Multi-AZ" for production high availability.
   - Standardize `DB_CHARSET` to `utf8mb4`.

2. **Elasticache (Redis)**:
   - Required for BullMQ and Socket.io scaling.
   - Use a small `t3.micro` or `t3.small` instance.

3. **EC2 (Application Server)**:
   - OS: Ubuntu 22.04 LTS.
   - Security Groups: Open ports 80 (HTTP), 443 (HTTPS), 3000 (Node).

---

### Phase 2: Server Environment Preparation

1. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install PM2**:
   ```bash
   sudo npm install pm2 -g
   ```

3. **Install Nginx**:
   ```bash
   sudo apt-get install -y nginx
   ```

---

### Phase 3: Application Deployment

1. **Clone & Install**:
   ```bash
   git clone <your-repo-url>
   cd smart_complaint_&_resonse_system
   npm install --production
   ```

2. **Configure Environment (`.env`)**:
   - Copy `.env.example` to `.env`.
   - Update `DB_HOST`, `REDIS_HOST`, `JWT_SECRET`.
   - **Cloudinary**: Ensure `CLOUDINARY_URL` is set for background processing.
   - **Firebase**: Set proper `FIREBASE_PROJECT_ID`.

3. **Initialize Database**:
   - Run `database_final.sql` against your RDS instance.
   - **Warning**: Do not use `FORCE: true` in production once data is live.

---

### Phase 4: Reverse Proxy & SSL (Nginx)

1. **Nginx Configuration**:
   - Copy `nginx.conf.template` to `/etc/nginx/sites-available/scrs`.
   - Update `server_name` to your domain.
   - Link to `sites-enabled`:
     ```bash
     sudo ln -s /etc/nginx/sites-available/scrs /etc/nginx/sites-enabled/
     sudo nginx -t
     sudo systemctl restart nginx
     ```

2. **SSL Certification**:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

### Phase 5: Go-Live (PM2)

Start the main application and the background workers:

```bash
# Start API & Workers via ecosystem file
pm2 start ecosystem.config.cjs

# Save for reboot persistence
pm2 save
pm2 startup
```

---

### Post-Launch Verification

- [ ] Check logs: `pm2 logs`.
- [ ] Test one complaint submission with image upload.
- [ ] Verify that real-time notifications are working (WebSocket over WSS).
- [ ] Ensure `uploadWorker` has processed the test image successfully.
