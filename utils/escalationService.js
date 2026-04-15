const db = require('../config/db');
const notifier = require('./notificationService');

/**
 * SLA Escalation Logic:
 * Checks all pending/in-progress complaints and escalates them based on time elapsed.
 * - > 24h: Escalates to HOD
 * - > 48h: Escalates to Admin
 * - > 72h: Escalates to Principal
 */
async function processEscalations() {
    try {
        console.log('--- Starting SLA Escalation Check ---');

        const [complaints] = await db.execute(`
            SELECT c.*, d.name as department_name, s.email as student_email
            FROM complaints c
            JOIN departments d ON c.department_id = d.id
            JOIN students st ON c.student_id = st.id
            JOIN users s ON st.user_id = s.id
            WHERE c.status NOT IN ('Resolved', 'Rejected')
        `);

        for (const complaint of complaints) {
            const timeElapsedHours = (new Date() - new Date(complaint.created_at)) / (1000 * 60 * 60);
            let targetLevel = null;
            let levelValue = 0;

            if (timeElapsedHours >= 72 && complaint.escalation_level < 3) {
                targetLevel = 'Principal';
                levelValue = 3;
            } else if (timeElapsedHours >= 48 && complaint.escalation_level < 2) {
                targetLevel = 'Admin';
                levelValue = 2;
            } else if (timeElapsedHours >= 24 && complaint.escalation_level < 1) {
                targetLevel = 'HOD';
                levelValue = 1;
            }

            if (targetLevel) {
                console.log(`Escalating Complaint #${complaint.id} to ${targetLevel} (Level ${levelValue}, Elapsed: ${Math.round(timeElapsedHours)}h)`);

                // Update database
                await db.execute(
                    "UPDATE complaints SET status = 'Escalated', escalation_level = $1, admin_notes = COALESCE(admin_notes, '') || '\n[System] Escalated to ' || $2 || ' due to SLA breach.' WHERE id = $3",
                    [levelValue, targetLevel, complaint.id]
                );

                // Notify specific logic
                if (levelValue === 3) {
                    await notifier.sendEmail('principal@gdc.edu', `URGENT: Complaint #${complaint.id} Escalated to Principal`, `High priority escalation.`);
                } else {
                    await notifier.sendEmail('admin@gdc.edu', `Complaint #${complaint.id} Escalated to ${targetLevel}`, `SLA breach.`);
                }
            }
        }

        console.log('--- SLA Escalation Check Completed ---');
    } catch (error) {
        console.error('Escalation process failed:', error);
    }
}

// In a real environment, this would be a CRON job. For now, we export it or can run it manually.
module.exports = { processEscalations };

if (require.main === module) {
    processEscalations().then(() => process.exit(0));
}
