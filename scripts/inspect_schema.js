require('dotenv').config();
const db = require('../config/db');
async function go() {
    const [s] = await db.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'students' ORDER BY ordinal_position");
    console.log('students:', s.map(c => c.column_name).join(', '));
    const [u] = await db.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position");
    console.log('users:', u.map(c => c.column_name).join(', '));
    const [st] = await db.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'staff' ORDER BY ordinal_position");
    console.log('staff:', st.map(c => c.column_name).join(', '));
    const [dm] = await db.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'department_members' ORDER BY ordinal_position");
    console.log('department_members:', dm.map(c => c.column_name).join(', '));
    process.exit(0);
}
go().catch(e => { console.error(e.message); process.exit(1); });
