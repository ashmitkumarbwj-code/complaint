# Azure Deployment Guide: Smart Campus Response System

This guide outlines the steps to deploy the Smart Campus Node.js backend and MySQL database to Microsoft Azure.

## 1. Database Setup (Azure Database for MySQL)

1.  **Create a MySQL Flexible Server** in the Azure Portal.
2.  **Firewall Rules**: Add your local IP and "Allow access to Azure services".
3.  **Database Creation**: Use a MySQL client (like Workbench) to run `database.sql`.
4.  **Connection String**: Update your settings with:
    - `DB_HOST`: `<your-server-name>.mysql.database.azure.com`
    - `DB_USER`: `<your-admin-user>`
    - `DB_PASSWORD`: `<your-password>`
    - `DB_NAME`: `smart_campus_db`

## 2. Backend Setup (VPS / Azure App Service)

1.  **Create a Web App / VPS**: Node 18+ LTS, Linux recommended.
2.  **Deployment**: Use GitHub Actions, Local Git, or `scp`.
3.  **Environment Variables**: Copy `.env.example` → `.env` and fill all values. Set `NODE_ENV=production`.
4.  **Socket.io**: Enable WebSockets in General settings (Azure) or ensure Nginx `proxy_set_header Upgrade` is set (VPS).
5.  **Nginx**: Copy `nginx.conf.template` → `/etc/nginx/sites-available/smartcampus`, replace domain, then `nginx -t && systemctl reload nginx`.
6.  **SSL**: Run `certbot --nginx -d yourdomain.com`.

## 3. Run Database Migrations

```bash
# 1. Import schema (fresh deploy)
mysql -u root -p smart_campus_db < database.sql

# 2. Upgrade FK constraints on existing databases only (skip for fresh deploys)
node scripts/migrate_fk_cascade.js
```

## 4. Start with PM2

```bash
npm install -g pm2

# Start API + background workers
pm2 start ecosystem.config.cjs --env production

# Save and auto-start on reboot
pm2 save
pm2 startup

# Monitor
pm2 status
pm2 logs smart-campus-api
```

## 5. Deployment Checklist
- [ ] Copy and fill `.env` (DB, JWT secrets, Cloudinary, Redis URL).
- [ ] Import `database.sql` or run `migrate_fk_cascade.js` for existing DB.
- [ ] Configure Nginx with `nginx.conf.template`.
- [ ] Obtain SSL certificate via `certbot`.
- [ ] Start with PM2 (`pm2 start ecosystem.config.cjs --env production`).
- [ ] Enable WebSockets.
- [ ] Verify health: `curl https://yourdomain.com/api/health`.
- [ ] Check BullBoard at `https://yourdomain.com/admin/queues` (Admin login required).
