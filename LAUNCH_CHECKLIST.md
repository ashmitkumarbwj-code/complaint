# Launch Readiness Checklist – Smart Campus SCRS

Use this before going live.

---

## Must do before launch

### 1. Environment & secrets
- [ ] Copy `.env.example` to `.env` and fill in **real** values (never commit `.env`).
- [ ] Set a **strong random** `JWT_SECRET` (e.g. 32+ characters).
- [ ] Set `NODE_ENV=production`.
- [ ] Set `BASE_URL` to your live site URL (e.g. `https://scrs.yourcollege.edu`).
- [ ] If the app is on a different domain than the API, add it to `FRONTEND_URLS` (comma-separated).

### 2. Database
- [ ] MySQL is running and reachable from the server.
- [ ] Database created and schema applied (`database.sql` or your migrations).
- [ ] OTP table has `otp_code VARCHAR(255)` and `attempts` column (run `node migrate_otp.js` if needed).
- [ ] At least one Admin account exists (e.g. add via verified_staff + activate, or seed script).

### 3. Redis
- [ ] Redis is installed and running (required for OTP/notification queues).
- [ ] `REDIS_HOST` and `REDIS_PORT` (and `REDIS_PASSWORD` if used) are set in `.env`.

### 4. External services (as used)
- [ ] **SMTP** (Gmail/other): `SMTP_*` set so activation/reset emails work.
- [ ] **Twilio** (SMS): `TWILIO_*` set if you use SMS OTP.
- [ ] **Cloudinary**: `CLOUDINARY_*` set if users upload complaint images.

### 5. HTTPS & CORS
- [ ] App is served over **HTTPS** in production (use nginx/Apache as reverse proxy; don’t expose Node directly on 80/443 without SSL).
- [ ] `BASE_URL` and `FRONTEND_URLS` use `https://` so CORS allows your real domain.

### 6. Process & monitoring
- [ ] Run with PM2: `npm run pm2:start` (or `pm2 start ecosystem.config.cjs`).
- [ ] Optional: `pm2 startup` + `pm2 save` so the app restarts after server reboot.

---

## Already in good shape

- Auth (JWT, role checks) on protected routes.
- Rate limiting (login, OTP, reset).
- DB connection validation at startup.
- API 404 and error handling.
- Logout clears both token and user.
- Add Student API and departments dropdown (auth) fixed.
- OTP schema fixed for activation flow.

---

## Optional but recommended

- Restrict GET `/api/complaints/all` to Admin/Principal only (currently any authenticated user can call it).
- Add a custom 404 HTML page for unknown static routes.
- Set up log rotation for `logs/` and PM2 logs.
- Regular DB backups (you have a backup job; ensure the path is writable and retained).

---

## Quick test before launch

1. Open site in browser (HTTPS URL).
2. Student: activate (roll + mobile) → OTP → set password → login.
3. Student: submit a complaint (with/without image).
4. Staff: login → department dashboard → see complaint → update status.
5. Admin: login → add student, add staff, view complaints, gallery.
6. Principal: login → dashboard loads.

If all pass and env is production-ready, you’re good to launch.
