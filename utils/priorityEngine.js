const logger = require('./logger');

/**
 * Smart Priority & Routing Engine
 * Scans complaint text for critical keywords to auto-escalate priority
 * and suggest optimal department routing.
 */
class PriorityEngine {
    constructor() {
        this.kwEmergency = ['fire', 'blood', 'fight', 'weapon', 'assault', 'dying', 'medical', 'electric shock', 'shock'];
        this.kwHigh = ['broken', 'leaking', 'short circuit', 'stolen', 'harassment', 'abuse', 'water leak', 'spill'];
        
        // Simple heuristic map: keyword -> target department ID
        // Note: Real IDs would need to map dynamically, fallback to keyword matching names
        this.deptClues = {
            'wifi': 'IT Department',
            'internet': 'IT Department',
            'network': 'IT Department',
            'hostel': 'Hostel Management',
            'room': 'Hostel Management',
            'food': 'Mess & Cafeteria',
            'mess': 'Mess & Cafeteria',
        };
    }

    /**
     * Analyzes complaint text to determine real priority and auto-detection flag.
     * @param {string} text - The combined title/description of the complaint.
     * @param {string} userPriority - The priority requested by the user.
     * @returns {Object} { priority, isAutoAssigned, suggestedDepartment }
     */
    analyze(title, description, userPriority) {
        const textToAnalyze = `${title || ''} ${description || ''}`.toLowerCase();
        
        let predictedPriority = null;
        let isAutoAssigned = false;

        // 1. Check for Emergency keywords
        for (const word of this.kwEmergency) {
            if (textToAnalyze.includes(word)) {
                predictedPriority = 'Emergency';
                isAutoAssigned = true;
                logger.warn(`[AI Engine] Emergency keyword detected: "${word}". Escalating priority.`);
                break;
            }
        }

        // 2. Check for High priority keywords if not already Emergency
        if (!predictedPriority) {
            for (const word of this.kwHigh) {
                if (textToAnalyze.includes(word)) {
                    predictedPriority = 'High';
                    isAutoAssigned = true;
                    logger.info(`[AI Engine] High priority keyword detected: "${word}". Escalating priority.`);
                    break;
                }
            }
        }

        // 3. Department Suggestion (Heuristic)
        let suggestedDepartmentName = null;
        for (const [kw, deptName] of Object.entries(this.deptClues)) {
            if (textToAnalyze.includes(kw)) {
                suggestedDepartmentName = deptName;
                break;
            }
        }

        return {
            priority: predictedPriority || userPriority || 'Medium',
            isAutoAssigned,
            suggestedDepartmentName
        };
    }
}

module.exports = new PriorityEngine();
