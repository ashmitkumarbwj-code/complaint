const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/test-db',
  method: 'GET'
};

const TOTAL_REQUESTS = 2000;
const CONCURRENCY = 50;

let completed = 0;
let failed = 0;
const start = Date.now();

function makeRequest() {
  if (completed + failed >= TOTAL_REQUESTS) {
    if (completed + failed === TOTAL_REQUESTS) report();
    return;
  }

  const req = http.get(options, (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      completed++;
      makeRequest();
    });
  });

  req.on('error', (e) => {
    failed++;
    makeRequest();
  });
}

function report() {
    const end = Date.now();
    const duration = (end - start) / 1000;
    const rps = completed / duration;
    console.log(`--- Load Test Results ---`);
    console.log(`Target: http://localhost:5000/`);
    console.log(`Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`Concurrency: ${CONCURRENCY}`);
    console.log(`Success: ${completed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log(`Requests per second: ${rps.toFixed(2)}`);
    console.log(`--- ---`);
}

// Start concurrent workers
for (let i = 0; i < CONCURRENCY; i++) {
  makeRequest();
}
