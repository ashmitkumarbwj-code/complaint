# 🚀 Final Step: Preparing for the Stress Test

The backend is fully populated, secured, and features enterprise background queues. To perform an effective Stress Test (simulating 500+ students complaining simultaneously), you need a specific environment setup.

## 1. Required Infrastructure

Since we successfully migrated blocking operations (like image uploads and OTP emails) to **BullMQ Background Workers**, your system now legally requires **Redis** to function under load.

If you run the server right now without Redis, it will throw an `ECONNREFUSED 127.0.0.1:6379` warning, and queues will not process.

**Action Required:**
- **Windows:** Download and run [Memurai](https://www.memurai.com/) (a native Redis port for Windows) or use Docker Desktop `docker run -p 6379:6379 -d redis`.
- **Linux/Production:** `sudo apt install redis-server`

## 2. Starting the Workers
Once Redis is running, your backend requires two separate terminal windows to handle the stress test:

**Terminal 1 (The Main API):**
```bash
npm start
```
*(This will accept the 500 complaints per second, save them to the DB, and instantly reply `200 OK` to the students).*

**Terminal 2 (The Workers):**
```bash
node workers/index.js
```
*(This will silently process the 500 delayed image uploads and send the 500 SMS/Email notifications in the background without slowing the API).*

---

## 3. Recommended Stress Testing Tools
To actually perform the "Stress Test", humans cannot click fast enough. I recommend using one of these industry-standard CLI tools:

### A. Artillery (Easiest for Node.js)
1. Install globally: `npm install -g artillery`
2. Create a test file `complaint_test.yml`:
    ```yaml
    config:
      target: "http://localhost:5000"
      phases:
        - duration: 60
          arrivalRate: 20 # 20 users per second for 1 minute
    scenarios:
      - flow:
        - post:
            url: "/api/complaints"
            json:
              title: "Test Complaint"
              description: "Stress Test Generated"
              departmentId: 1
    ```
3. Run the attack: `artillery run complaint_test.yml`

### B. Apache JMeter (UI Based)
If you prefer a visual graph, download Apache JMeter, create a Thread Group (e.g., 500 users), and point the HTTP Request Sampler to your login or complaint endpoints.

---

### Are you ready?
Do you have Redis installed locally, or would you like me to write a custom Node.js script that automatically fires 500 API requests at your server so we don't have to install external testing tools?
