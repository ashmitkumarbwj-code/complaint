/**
 * routes/departments.js
 * Department Management API
 * Smart Campus Complaint & Response System
 */

const express    = require('express');
const router     = express.Router();
const deptCtrl   = require('../controllers/departmentController');
const auth       = require('../middleware/authMiddleware');
const checkRole  = require('../middleware/roleMiddleware');
const v          = require('../middleware/validators');

// ── Read-only routes (Admin + Principal + HOD) ────────────────────────────────
router.get('/',
    auth, checkRole(['Admin','Principal','HOD']),
    deptCtrl.getAllDepartments
);

// This MUST come before /:id so Express matches it first
router.get('/stats/all',
    auth, checkRole(['Admin','Principal']),
    deptCtrl.getAllDeptStats
);

router.get('/available-staff',
    auth, checkRole(['Admin']),
    deptCtrl.getAvailableStaff
);

router.get('/:id',
    auth, checkRole(['Admin','Principal','HOD']),
    deptCtrl.getDepartmentById
);

// ── Admin-only write routes ───────────────────────────────────────────────────
router.post('/',
    auth, checkRole(['Admin']),
    v.validateDepartment,
    deptCtrl.createDepartment
);

router.put('/:id',
    auth, checkRole(['Admin']),
    v.validateDepartment,
    deptCtrl.updateDepartment
);

router.post('/:id/members',
    auth, checkRole(['Admin']),
    v.validateAddMember,
    deptCtrl.addMember
);

router.delete('/:id/members/:user_id',
    auth, checkRole(['Admin']),
    deptCtrl.removeMember
);

module.exports = router;
