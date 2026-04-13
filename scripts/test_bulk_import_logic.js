'use strict';

/**
 * scripts/test_bulk_import_logic.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the studentImportService logic:
 *   1. Alias resolution (CSE -> Computer Science)
 *   2. Strict validation (Fail unknown depts)
 *   3. Duplicate detection (Skip roll_number and email)
 *   4. JSON reporting (Summary structure)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const studentImportService = require('../services/studentImportService');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

async function runTest() {
    console.log('--- STARTING BULK IMPORT LOGIC TEST ---');

    // 1. Prepare Mock Request for Tenant 1
    const mockReq = {
        user: { tenant_id: 1 },
        get: (h) => (h === 'host' ? 'localhost:3000' : null)
    };

    // 2. Clear Registry for Clean Test
    console.log('[1/4] Clearing verified_students registry...');
    await db.pool.query('DELETE FROM verified_students WHERE tenant_id = 1');

    // 3. Create Sample CSV Buffer
    // Fields: roll_number, name, email, department, year, mobile_number
    const csvContent = 
`roll_number,name,email,department,year,mobile_number
21DCS001,Success One,one@student.edu,Computer Science,3rd,9999999901
21DCS002,Success Two (Alias),two@student.edu,CSE,3rd,9999999902
21DCS001,Dup Roll,dup@student.edu,CS,3rd,9999999903
21DCS003,Dup Email,one@student.edu,CS,3rd,9999999904
21DCS004,Invalid Dept,four@student.edu,Unknown Dept,3rd,9999999905
21DCS005,Success Three,three@student.edu,ME,3rd,9999999906
`;
    const buffer = Buffer.from(csvContent);

    // 4. Run Import
    console.log('[2/4] Running Import Service...');
    try {
        const result = await studentImportService.bulkImportStudents(buffer, mockReq);

        console.log('\n--- IMPORT SUMMARY ---');
        console.log(`Total:      ${result.total}`);
        console.log(`Inserted:   ${result.inserted}`);
        console.log(`Duplicates: ${result.duplicates.length}`);
        console.log(`Invalid:    ${result.invalid.length}`);
        
        console.log('\n[3/4] Verifying Results...');
        
        // Expected Logic Hits:
        // 1. Success One: Inserted
        // 2. Success Two: Inserted (CSE -> Computer Science alias)
        // 3. Dup Roll (21DCS001): Skipped
        // 4. Dup Email (one@student.edu): Skipped
        // 5. Invalid Dept: Failed
        // 6. Success Three: Inserted (ME -> Mechanical Engineering alias)
        
        if (result.inserted !== 3) {
            console.error(`❌ FAILED: Expected 3 insertions, got ${result.inserted}`);
        } else {
            console.log('✅ Insertion count correct (3).');
        }

        const rollDup = result.duplicates.find(d => d.roll_number === '21DCS001');
        const emailDup = result.duplicates.find(d => d.email === 'one@student.edu');
        
        if (rollDup && emailDup) {
            console.log('✅ Duplicate detection verified (Roll and Email).');
        } else {
            console.error('❌ Failed to detect specific duplicates:', { rollDup, emailDup });
        }

        const invalidRow = result.invalid.find(i => i.roll_number === '21DCS004');
        if (invalidRow && invalidRow.reason.includes('Unknown department')) {
            console.log('✅ Validation failure verified (Unknown Dept).');
        } else {
            console.error('❌ Failed to detect invalid department row.');
        }

        // 5. Final Registry Check
        const [rows] = await db.execute('SELECT roll_number, department FROM verified_students WHERE tenant_id = 1');
        console.log('\nFinal Registry in DB:');
        rows.forEach(r => console.log(` - ${r.roll_number}: ${r.department}`));

        console.log('\n--- TEST COMPLETE ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ TEST CRASHED:', err);
        process.exit(1);
    }
}

runTest();
