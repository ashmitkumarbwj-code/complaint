const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../test_tokens.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const STUDENT_TOKEN = envContent.match(/TEST_STUDENT_TOKEN=(.*)/)?.[1]?.trim();
const ADMIN_TOKEN = envContent.match(/TEST_ADMIN_TOKEN=(.*)/)?.[1]?.trim();

const BASE_URL = 'http://localhost:5000/api';

async function testInvalidFileType() {
    console.log('\n--- Testing Invalid File Type (.txt) ---');
    const formData = new FormData();
    formData.append('title', 'Test Invalid File');
    formData.append('category', 'Infrastructure');
    formData.append('location', 'Hostel');
    formData.append('description', 'This should fail');
    
    const fileContent = fs.readFileSync(path.join(__dirname, 'test.txt'));
    const blob = new Blob([fileContent], { type: 'text/plain' });
    formData.append('media', blob, 'test.txt');

    try {
        const response = await fetch(`${BASE_URL}/complaints/submit`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${STUDENT_TOKEN}`
            }
        });
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', data);
    } catch (error) {
        console.log('Error:', error.message);
    }
}

async function testHugeFile() {
    console.log('\n--- Testing Huge File (> 20MB) ---');
    const hugeFilePath = path.join(__dirname, 'huge_file.jpg');
    const buffer = Buffer.alloc(21 * 1024 * 1024);
    fs.writeFileSync(hugeFilePath, buffer);

    const formData = new FormData();
    formData.append('title', 'Test Huge File');
    formData.append('category', 'Infrastructure');
    formData.append('location', 'Hostel');
    formData.append('description', 'This should fail');
    
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('media', blob, 'huge_file.jpg');

    try {
        const response = await fetch(`${BASE_URL}/complaints/submit`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${STUDENT_TOKEN}`
            }
        });
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', data);
    } catch (error) {
        console.log('Error:', error.message);
    } finally {
        fs.unlinkSync(hugeFilePath);
    }
}

async function testSpamProtection() {
    console.log('\n--- Testing Spam Protection (5 per hour) ---');
    for (let i = 0; i < 6; i++) {
        process.stdout.write(`Submission ${i+1}... `);
        const formData = new FormData();
        formData.append('title', `Spam Test ${i+1}`);
        formData.append('category', 'Infrastructure');
        formData.append('location', 'Hostel');
        formData.append('description', 'This is a long description to satisfy the 20 character requirement for testing spam protection.');

        try {
            const response = await fetch(`${BASE_URL}/complaints/submit`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${STUDENT_TOKEN}`
                }
            });
            const data = await response.json();
            console.log(`Status: ${response.status}, Success: ${data.success}`);
            if (response.status === 429) {
                console.log('Spam protection triggered successfully!');
                break;
            }
        } catch (error) {
            console.log('Error:', error.message);
        }
    }
}

async function testUnauthorizedAccess() {
    console.log('\n--- Testing Unauthorized Access (403) ---');
    try {
        const response = await fetch(`${BASE_URL}/complaints/all`, {
            headers: {
                'Authorization': `Bearer ${STUDENT_TOKEN}`
            }
        });
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', data);
    } catch (error) {
        console.log('Error:', error.message);
    }
}

fs.writeFileSync(path.join(__dirname, 'test.txt'), 'This is a test file.');

async function runAll() {
    await testInvalidFileType();
    await testHugeFile();
    await testUnauthorizedAccess();
    await testSpamProtection();
    console.log('\n--- All tests completed ---');
}

runAll().catch(err => {
    console.error('Test suite failed:', err);
});
