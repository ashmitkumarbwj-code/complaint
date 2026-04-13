'use strict';

const db = require('../config/db');
const complaintService = require('../services/complaintService');

async function runHardeningTests() {
    console.log('--- STARTING RUTHLESS HARDENING SMOKE TESTS (POSTGRES) ---');
    
    try {
        // 1. Setup Test Identifiers
        const ts = Date.now();
        
        // Find existing student for base context
        const [students] = await db.execute('SELECT s.id, s.user_id, u.tenant_id FROM students s JOIN users u ON s.user_id = u.id LIMIT 1');
        if (students.length === 0) throw new Error('NO_SEED_DATA_FOUND');
        
        const { id: studentId, tenant_id: tenantId, user_id: userId } = students[0];
        const mockReq = { 
            user: { id: userId, role: 'Student', tenant_id: tenantId }, 
            body: {},
            ip: '127.0.0.1',
            headers: {},
            socket: { remoteAddress: '127.0.0.1' },
            get: (h) => ''
        };

        // --- TEST A: Illegal Transition Blocked ---
        console.log('\n[TEST A] Illegal Transition: Pending -> Resolved (Student)');
        try {
            // Create fresh complaint
            const [rows] = await db.execute(
                'INSERT INTO complaints (student_id, tenant_id, title, department_id, category, description, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                [studentId, tenantId, 'Test Noise ' + ts, 1, 'Noise', 'Too loud in dorms.', 'Pending']
            );
            const complaintId = rows[0].id;

            await complaintService.updateStatus(mockReq, { 
                complaintId, 
                newStatus: 'Resolved',
                adminNotes: 'Trying to Resolve as student' 
            });
            console.error('❌ FAIL: Student was able to Resolve a complaint!');
        } catch (err) {
            console.log('✅ PASS: Blocked with error:', err.message);
        }

        // --- TEST B: Concurrency (WWE Conflict) ---
        console.log('\n[TEST B] WWE Concurrency: Parallel Updates');
        const [c2Rows] = await db.execute(
            'INSERT INTO complaints (student_id, tenant_id, title, department_id, category, description, status, lock_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [studentId, tenantId, 'Race Condition Test ' + ts, 1, 'Noise', 'Parallel update test.', 'Pending', 10]
        );
        const c2Id = c2Rows[0].id;

        // Simulate two parallel updates with the same version
        // and including lock_version in the body as expected by the service
        const req1 = { ...mockReq, body: { lock_version: 10 }, user: { ...mockReq.user, role: 'Admin' } };
        const req2 = { ...mockReq, body: { lock_version: 10 }, user: { ...mockReq.user, role: 'Admin' } };

        const promise1 = complaintService.updateStatus(req1, { complaintId: c2Id, newStatus: 'In Progress', adminNotes: 'Update 1' });
        const promise2 = complaintService.updateStatus(req2, { complaintId: c2Id, newStatus: 'In Progress', adminNotes: 'Update 2' });

        const results = await Promise.allSettled([promise1, promise2]);
        const succeeded = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');

        if (succeeded.length === 1 && failed.length === 1 && failed[0].reason.message === 'VERSION_CONFLICT') {
            console.log('✅ PASS: Concurrency handled. 1 Success, 1 Conflict (409).');
        } else {
            console.error('❌ FAIL: Concurrency check failed.', {
                successCount: succeeded.length,
                failReasons: failed.map(f => f.reason.message)
            });
        }

        // --- TEST C: Transaction Rollback (Soul Test) ---
        console.log('\n[TEST C] Transaction Rollback: Sabotaging Audit');
        
        // We will temporarily sabotage the auditService to throw an error
        const audit = require('../utils/auditService');
        const originalLog = audit.logAction;
        audit.logAction = async () => { throw new Error('SABOTAGE_AUDIT_FAILURE'); };

        try {
            const adminReq = { ...mockReq, body: { lock_version: 11 }, user: { ...mockReq.user, role: 'Admin' } };
            await complaintService.updateStatus(adminReq, { complaintId: c2Id, newStatus: 'Resolved', adminNotes: 'Should rollback' });
            console.error('❌ FAIL: Transaction did not fail despite audit sabotage!');
        } catch (err) {
            // Verify if status in DB is still 'In Progress' (from previous test success)
            const [check] = await db.execute('SELECT status FROM complaints WHERE id = $1', [c2Id]);
            if (check[0].status === 'In Progress') {
                console.log('✅ PASS: Status rolled back (still In Progress). Error:', err.message);
            } else {
                console.error('❌ FAIL: DB status changed despite error! Current:', check[0].status);
            }
        }
        audit.logAction = originalLog; // Restore

        console.log('\n--- ALL RUTHLESS TESTS COMPLETE ---');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ TEST SUITE CRASHED:', err);
        process.exit(1);
    }
}

runHardeningTests();
