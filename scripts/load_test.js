const autocannon = require('autocannon');
require('dotenv').config();

const url = process.env.BASE_URL || 'http://localhost:5000';

async function runLoadTest() {
  console.log(`--- 📈 Smart Campus Load Test Simulation ---`);
  console.log(`Target: ${url}`);
  console.log(`Config: 50 concurrent users for 20 seconds`);

  const instance = autocannon({
    url,
    connections: 50, // 50 concurrent users
    duration: 20,    // 20 seconds
    pipelining: 1,
    title: 'Smart Campus Production Benchmark'
  }, (err, result) => {
    if (err) {
      console.error('autocannon error:', err);
      return;
    }
    
    console.log('\n--- 📊 Load Test Results ---');
    console.log(`Total Requests: ${result.requests.total}`);
    console.log(`Avg Latency: ${result.latency.average} ms`);
    console.log(`P99 Latency: ${result.latency.p99} ms`);
    console.log(`Success Rate: ${((result.requests.total - result.errors) / result.requests.total * 100).toFixed(2)}%`);
    console.log(`Total Errors: ${result.errors}`);

    const targetMet = result.latency.average < 500 && result.errors === 0;
    
    if (targetMet) {
      console.log('\n✅ PERFORMANCE TARGET MET');
    } else {
      console.log('\n⚠️ PERFORMANCE TARGET NOT MET - Optimize required.');
    }
  });

  // Log progress
  autocannon.track(instance, { renderProgressBar: true });
}

runLoadTest();
