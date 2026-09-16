// controllers/studentController.js
'use strict';

const db = require('../config/db');
const logger = require('../utils/logger');
const { bulkImportStudents } = require('../services/studentImportService');

/**
 * Bulk import students – accepts CSV file (multipart) or JSON array (application/json).
 * Uses the existing bulkImportStudents service which handles validation, de-duplication,
 * department alias resolution and optional Firebase enrollment.
 */
exports.bulkImport = async (req, res) => {
   // Delegate to existing admin bulk import to ensure audit logging and unified behavior
   const adminController = require('../controllers/adminController');
   return adminController.bulkImportStudents(req, res);
};

/**
 * Soft‑delete (deactivate) multiple students by IDs.
 * Expected payload: { ids: [1,2,3] }
 */
exports.bulkDeactivate = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array required' });
    }
    const tenantId = db.getTenantId(req) || 1;
    // Use parameterized IN list
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    const query = `UPDATE verified_students SET is_active = FALSE WHERE id IN (${placeholders}) AND tenant_id = $1`;
    await db.execute(query, [tenantId, ...ids]);
    res.json({ success: true, message: 'Students deactivated', count: ids.length });
  } catch (err) {
    logger.error('[StudentController] bulkDeactivate error:', err);
    res.status(500).json({ success: false, message: err.message || 'Deactivation failed' });
  }
};

/**
 * List students who have left (is_active = FALSE).
 * Accessible to Admin, Principal, HOD roles.
 */
exports.listLeftStudents = async (req, res) => {
  try {
    const tenantId = db.getTenantId(req) || 1;
    const [rows] = await db.execute(
      'SELECT id, roll_number, full_name, email, department, year FROM verified_students WHERE tenant_id = $1 AND is_active = FALSE',
      [tenantId]
    );
    res.json({ success: true, count: rows.length, students: rows });
  } catch (err) {
    logger.error('[StudentController] listLeftStudents error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch left students' });
  }
};
