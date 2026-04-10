
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000/api';
const STUDENT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoxLCJ1c2VybmFtZSI6InRlc3Rfc3R1ZGVudCIsInJvbGUiOiJTdHVkZW50In0sImlhdCI6MTc3NDAxOTE0NywiZXhwIjoxNzc0MDIyNzQ3fQ.ZkO2l2LTOQj7jeyodowrPXPav2KeaIe8ZEMLZRcXi8w';

async function testImageUpload() {
    console.log('\n--- Testing Image Upload with FAKE Credentials ---');
    const formData = new FormData();
    formData.append('student_id', '1');
    formData.append('title', 'Cloudinary Failure Test');
    formData.append('category', 'Infrastructure');
    formData.append('location', 'Hostel');
    formData.append('description', 'Testing Cloudinary failure handling');
    
    // Use a small valid jpg
    const buffer = Buffer.alloc(1024); // 1KB dummy
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('media', blob, 'test.jpg');

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

testImageUpload();
