const db = require('../config/db');

async function enrollPrincipal() {
    try {
        console.log('--- ENROLLING PRINCIPAL ---');
        
        const principal = {
            name: 'Prof. Rakesh Pathania',
            email: 'gdcdharamshala@gmail.com',
            mobile: '7018168314',
            role: 'Principal',
            tenant_id: 1
        };

        // 1. Get Department ID (General Administration or fallback to 1)
        const [depts] = await db.execute("SELECT id FROM departments WHERE name ILIKE '%Admin%' LIMIT 1");
        const deptId = depts.length > 0 ? depts[0].id : 1;

        // 2. Insert into verified_staff
        const query = `
            INSERT INTO verified_staff (tenant_id, name, email, mobile, role, department_id, is_account_created)
            VALUES ($1, $2, $3, $4, $5, $6, FALSE)
            ON CONFLICT (tenant_id, email) 
            DO UPDATE SET 
                name = EXCLUDED.name,
                mobile = EXCLUDED.mobile,
                role = EXCLUDED.role
            RETURNING id
        `;

        const [result] = await db.execute(query, [
            principal.tenant_id,
            principal.name,
            principal.email,
            principal.mobile,
            principal.role,
            deptId
        ]);

        console.log(`✅ Principal enrolled successfully. Registry ID: ${result[0]?.id || 'N/A'}`);
        console.log(`The Principal can now activate their account at: /activate-principal.html`);
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Enrollment failed:', err.message);
        process.exit(1);
    }
}

enrollPrincipal();
