const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * AI Complaint Verifier Service
 * Supports Gemini (Primary) and OpenRouter (Fallback)
 */

class AIComplaintVerifier {
    constructor() {
        this.provider = process.env.AI_PROVIDER || 'gemini';
        this.geminiKey = process.env.GEMINI_API_KEY;
        this.openRouterKey = process.env.OPENROUTER_API_KEY;
        
        if (this.geminiKey) {
            this.genAI = new GoogleGenerativeAI(this.geminiKey);
        }
    }

    async analyze(complaintData) {
        const { title, description, category, imageUrl, localPath } = complaintData;

        try {
            if (this.provider === 'gemini' && this.geminiKey) {
                return await this.analyzeWithGemini(title, description, category, imageUrl, localPath);
            } else if (this.openRouterKey) {
                return await this.analyzeWithOpenRouter(title, description, category, imageUrl);
            } else {
                throw new Error('No AI provider configured');
            }
        } catch (error) {
            logger.error('[AI Service] Analysis failed:', error.message);
            return this.getFallbackResponse('Analysis failed: ' + error.message);
        }
    }

    async analyzeWithGemini(title, description, category, imageUrl, localPath) {
        const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = this.buildPrompt(title, description, category);
        const parts = [prompt];

        // Handle Image
        if (localPath && fs.existsSync(localPath)) {
            const imageData = fs.readFileSync(localPath);
            parts.push({
                inlineData: {
                    data: imageData.toString("base64"),
                    mimeType: "image/jpeg" // Assuming jpeg for simplicity, should ideally detect
                }
            });
        } else if (imageUrl) {
            try {
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                parts.push({
                    inlineData: {
                        data: Buffer.from(response.data).toString("base64"),
                        mimeType: response.headers['content-type'] || "image/jpeg"
                    }
                });
            } catch (err) {
                logger.warn('[AI Service] Could not fetch image from URL:', imageUrl);
            }
        }

        const result = await model.generateContent(parts);
        const text = result.response.text();
        return this.parseJSONResponse(text);
    }

    async analyzeWithOpenRouter(title, description, category, imageUrl) {
        const prompt = this.buildPrompt(title, description, category);
        
        const content = [{ type: "text", text: prompt }];
        if (imageUrl) {
            content.push({ type: "image_url", image_url: { url: imageUrl } });
        }

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: "google/gemini-flash-1.5-8b", // Or any free multimodal model
            messages: [{ role: "user", content }]
        }, {
            headers: {
                'Authorization': `Bearer ${this.openRouterKey}`,
                'Content-Type': 'application/json'
            }
        });

        const text = response.data.choices[0].message.content;
        return this.parseJSONResponse(text);
    }

    buildPrompt(title, description, category) {
        return `Analyze this university complaint and the attached image evidence.
Title: ${title}
Description: ${description}
Category: ${category}

Return a STRICT JSON object with these exact keys:
- is_relevant_evidence: boolean
- evidence_match_score: number (0.0 to 1.0)
- suggested_category: string
- suggested_priority: "low" | "medium" | "high" | "emergency"
- is_emergency: boolean
- spam_risk: "low" | "medium" | "high"
- requires_manual_review: boolean
- reasoning_summary: string (short explanation)

Rules:
- Emergency: immediate threat to life/safety/infrastructure.
- High: critical services (water/power) or harassment.
- Manual review if evidence is mismatching or low confidence.
Output JSON ONLY.`;
    }

    parseJSONResponse(text) {
        try {
            // Extract JSON if AI wrapped it in markdown
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : text;
            return JSON.parse(cleanJson);
        } catch (error) {
            logger.error('[AI Service] JSON Parse Error:', text);
            return this.getFallbackResponse('Invalid JSON response from AI');
        }
    }

    getFallbackResponse(reason) {
        return {
            is_relevant_evidence: false,
            evidence_match_score: 0,
            suggested_category: 'Unclassified',
            suggested_priority: 'medium',
            is_emergency: false,
            spam_risk: 'low',
            requires_manual_review: true,
            reasoning_summary: reason,
            is_fallback: true
        };
    }
}

module.exports = new AIComplaintVerifier();
