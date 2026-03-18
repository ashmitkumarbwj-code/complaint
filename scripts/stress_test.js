const http = require('http');

console.log("🚀 INITIALIZING 500 CONCURRENT CONNECTIONS STRESS TEST...");
console.log("Targeting: http://localhost:3000/");

const TOTAL_REQUESTS = 500;
let completed = 0;
let errors = 0;
let success = 0;

const startTime = Date.now();

// We are going to fire off 500 HTTP requests simultaneously.
for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const req = http.get('http://localhost:3000/', (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 401) {
                // The server successfully replied (even if 401 Unauthorized, meaning the firewall works under load)
                success++;
            } else {
                errors++;
            }
            checkDone();
        });
    }).on('error', (e) => {
        // If the server crashed or dropped the connection
        errors++;
        checkDone();
    });

    req.end();
}

function checkDone() {
    completed++;
    if (completed === TOTAL_REQUESTS) {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        console.log(`\n────────────────────────────────────────`);
        console.log(`STRESS TEST RESULTS`);
        console.log(`────────────────────────────────────────`);
        console.log(`Total Connections Fired: ${TOTAL_REQUESTS}`);
        console.log(`Successful API Replies : ${success}`);
        console.log(`Failed / Dropped Conns : ${errors}`);
        console.log(`Total Time Taken       : ${duration} seconds`);
        console.log(`Requests Per Second    : ${(TOTAL_REQUESTS / duration).toFixed(2)} req/sec`);
        
        if (errors > 0) {
            console.log(`\n⚠️ WARNING: Your Node server dropped some connections. You may need clustering or you haven't started the server yet.`);
        } else {
            console.log(`\n✅ PASS: The server swallowed all 500 concurrent requests instantly without choking.`);
        }
    }
}
