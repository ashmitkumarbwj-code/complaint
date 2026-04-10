const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const secret = process.env.JWT_SECRET || 'akshu_secure_2026_!@#_random_string_987';

const studentPayload = {
    user: {
        id: 2,           // userId in 'users' table
        student_id: 1,   // studentId in 'students' table
        username: 'test_student',
        role: 'Student',
        tenant_id: 1
    }
};

const adminPayload = {
    user: {
        id: 1,
        username: 'admin',
        role: 'Admin',
        tenant_id: 1
    }
};

const fs = require('fs');

const studentToken = jwt.sign(studentPayload, secret, { expiresIn: '1h' });
const adminToken = jwt.sign(adminPayload, secret, { expiresIn: '1h' });

const content = `TEST_STUDENT_TOKEN=${studentToken}\nTEST_ADMIN_TOKEN=${adminToken}\n`;
fs.writeFileSync('test_tokens.env', content);
console.log('Tokens written to test_tokens.env');
