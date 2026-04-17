window.API_BASE = window.location.origin;

/**
 * RoleManager - Centralized utility for handling role-based routing and normalization.
 */
window.RoleManager = {
    // Canonical Identifiers (Standardized Lowercase)
    STUDENT:   'student',
    STAFF:     'staff',
    ADMIN:     'admin',
    PRINCIPAL: 'principal',

    /**
     * Normalizes a role string to its canonical lowercase value.
     */
    normalize: function(role) {
        if (!role) return this.STUDENT;
        const r = role.toLowerCase().trim();
        
        if (r === 'student') return this.STUDENT;
        if (r === 'staff' || r === 'faculty' || r === 'hod') return this.STAFF;
        if (r === 'principal') return this.PRINCIPAL;
        if (r === 'admin' || r === 'admin aux') return this.ADMIN;
        
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
        return `forgot-password-staff.html?role=${r}`;
    }
};
