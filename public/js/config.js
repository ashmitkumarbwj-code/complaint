window.API_BASE = window.location.origin;

/**
 * RoleManager - Centralized utility for handling role-based routing and normalization.
 */
window.RoleManager = {
    // Roles are normalized to lowercase canonical values
    STUDENT: 'student',
    STAFF: 'staff',
    PRINCIPAL: 'principal',
    ADMIN: 'admin',

    /**
     * Normalizes any input role string to a canonical lowercase value.
     * Defaults to 'student' if invalid or missing.
     */
    normalize: function(role) {
        if (!role) return this.STUDENT;
        const r = role.toLowerCase().trim();
        
        if (r.includes('student')) return this.STUDENT;
        if (r.includes('staff') || r.includes('faculty') || r.includes('hod')) return this.STAFF;
        if (r.includes('principal')) return this.PRINCIPAL;
        if (r.includes('admin')) return this.ADMIN;
        
        return this.STUDENT; // Safe fallback
    },

    /**
     * Returns the activation page for a given (normalized) role.
     */
    getActivationPage: function(role) {
        const r = this.normalize(role);
        switch(r) {
            case this.STAFF: return 'activate-staff.html';
            case this.PRINCIPAL: return 'activate-principal.html';
            case this.ADMIN: return 'activate-admin.html';
            default: return 'activate-student.html';
        }
    },

    /**
     * Returns the human-friendly display name for a role.
     */
    getDisplayName: function(role) {
        const r = this.normalize(role);
        switch(r) {
            case this.STAFF: return 'Staff/Faculty';
            case this.PRINCIPAL: return 'Principal';
            case this.ADMIN: return 'Administrator';
            default: return 'Student';
        }
    },

    /**
     * Returns the "Forgot Password" page for a given role.
     */
    getForgotPage: function(role) {
        const r = this.normalize(role);
        if (r === this.STUDENT) return 'forgot-password.html';
        return `forgot-password-staff.html?role=${r.charAt(0).toUpperCase() + r.slice(1)}`;
    }
};
