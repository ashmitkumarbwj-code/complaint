/**
 * Local E2E Test: Submit complaint with image
 * Run: node scratch_local_e2e.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://localhost:5000';

async function request(method, url, data, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const opts = {
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.pathname + parsed.search,
            method,
            headers
        };
        const req = http.request(opts, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(body), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, body, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function submitComplaintWithFile(token, filePath, complaintData) {
    return new Promise((resolve, reject) => {
        const boundary = '----FormBoundary' + Math.random().toString(36).substr(2);
        const fileContent = fs.readFileSync(filePath);
        const filename = path.basename(filePath);
        
        let body = Buffer.alloc(0);
        for (const [key, val] of Object.entries(complaintData)) {
            const part = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`;
            body = Buffer.concat([body, Buffer.from(part)]);
        }
        const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`;
        body = Buffer.concat([body, Buffer.from(fileHeader), fileContent, Buffer.from('\r\n')]);
        body = Buffer.concat([body, Buffer.from(`--${boundary}--\r\n`)]);

        const opts = {
            hostname: 'localhost',
            port: 5000,
            path: '/api/complaints',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        };

        const req = http.request(opts, (res) => {
            let responseBody = '';
            res.on('data', d => responseBody += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(responseBody) }); }
                catch { resolve({ status: res.statusCode, body: responseBody }); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function run() {
    console.log('Starting Local E2E Audit...');
    
    // 1. Login
    const loginRes = await request('POST', `${BASE_URL}/api/auth/login`,
        JSON.stringify({ identifier: '23PHY068', password: 'password123', role: 'student', tenant_id: 1 }),
        { 'Content-Type': 'application/json' }
    );

    let setCookieHeader;
    if (loginRes.status !== 200) {
        console.log('Login failed with password123, trying Test@1234...');
        const loginRes2 = await request('POST', `${BASE_URL}/api/auth/login`,
            JSON.stringify({ identifier: '23PHY068', password: 'Test@1234', role: 'student', tenant_id: 1 }),
            { 'Content-Type': 'application/json' }
        );
        if (loginRes2.status !== 200) {
            console.error('Login failed:', loginRes2.status, loginRes2.body);
            process.exit(1);
        }
        setCookieHeader = loginRes2.headers['set-cookie'];
    } else {
        setCookieHeader = loginRes.headers['set-cookie'];
    }
    
    // Extract accessToken from cookies
    let token = '';
    if (setCookieHeader) {
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='));
        if (accessTokenCookie) {
            token = accessTokenCookie.split(';')[0].split('=')[1];
        }
    }

    if (!token) {
        console.error('Failed to extract token from cookies.');
        process.exit(1);
    }
    console.log('Login successful. Token extracted.');

    // 2. Prepare real image file
    const testFile = 'test_upload.png';
    const PNG_1x1 = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489' +
        '0000000a49444154789c6260000000020001e221bc330000000049454e44ae426082', 'hex'
    );
    fs.writeFileSync(testFile, PNG_1x1);

    // 3. Submit Complaint
    console.log('Submitting complaint...');
    const submitRes = await submitComplaintWithFile(token, testFile, {
        title: 'Local Audit Test',
        category: 'Infrastructure',
        description: 'Verifying media upload path resilience',
        location: 'Lab A',
        priority: 'High'
    });

    console.log('Response Status:', submitRes.status);
    console.log('Response Body:', JSON.stringify(submitRes.body, null, 2));

    if (submitRes.status === 200 && submitRes.body.success) {
        const complaintId = submitRes.body.complaint_id;
        console.log(`Complaint ${complaintId} submitted. Waiting 10s for processing...`);
        await new Promise(r => setTimeout(r, 10000));

        const db = require('./config/db');
        const [rows] = await db.execute('SELECT * FROM complaints WHERE id = $1', [complaintId]);
        console.log('Database Result:', JSON.stringify(rows[0], null, 2));
        
        if (rows[0].media_url) {
            console.log('✅ SUCCESS: Media URL updated in DB:', rows[0].media_url);
        } else {
            console.log('❌ FAIL: Media URL not updated yet (check logs for Cloudinary/Worker errors)');
        }
    } else {
        console.error('Submission failed.');
    }
    
    fs.unlinkSync(testFile);
    process.exit(0);
}

run().catch(console.error);
