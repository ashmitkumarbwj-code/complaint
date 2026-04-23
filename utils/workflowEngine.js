/**
 * utils/workflowEngine.js
 * The Central Gate: Decides if a transition is legal and authorized.
 */
const { WORKFLOW_MATRIX } = require('./workflowMatrix');
const { STATUS, ROLE } = require('./constants');

class WorkflowEngine {
    /**
     * Validates if a transition is allowed based on current status and user role.
     * @param {string} currentStatus 
     * @param {string} targetStatus 
     * @param {string} userRole 
     * @returns {boolean}
     */
    isValidTransition(currentStatus, targetStatus, userRole, workflowVersion = 1) {
        // Normalization
        const current = currentStatus;
        const target = targetStatus;

        const { WORKFLOW_V2 } = require('./workflowMatrix');
        const matrix = workflowVersion === 2 ? WORKFLOW_V2 : WORKFLOW_MATRIX;

        if (!matrix[current]) return false;
        
        const allowedRoles = matrix[current][target];
        if (!allowedRoles) return false;

        return allowedRoles.includes(userRole);
    }

    /**
     * Checks if a reason/note is mandatory for a specific action.
     * @param {string} targetStatus 
     * @param {number} workflowVersion
     * @returns {boolean}
     */
    isReasonRequired(targetStatus, workflowVersion = 1) {
        if (workflowVersion === 2) {
            const mandatoryStatus = [
                STATUS.REOPENED, 
                STATUS.HOD_REWORK_REQUIRED, 
                STATUS.REJECTED_BY_ADMIN, 
                STATUS.RETURNED_TO_ADMIN
            ];
            return mandatoryStatus.includes(targetStatus);
        }
        const mandatoryStatus = [STATUS.REJECTED, STATUS.ESCALATED, STATUS.REOPENED];
        return mandatoryStatus.includes(targetStatus);
    }


    /**
     * Enforces the 7-day student reopening window.
     * @param {Date} resolvedAt 
     * @returns {boolean}
     */
    isWithinReopenWindow(resolvedAt) {
        if (!resolvedAt) return true; // If never resolved, technically can be "opened"
        const now = new Date();
        const resolvedDate = new Date(resolvedAt);
        const diffDays = (now - resolvedDate) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
    }
}

module.exports = new WorkflowEngine();
