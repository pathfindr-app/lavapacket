/**
 * LAVA Roofing - Transcription Module
 * Uses OpenAI Whisper API for voice-to-text
 */

const Transcribe = {
    // API key for local testing (don't commit this!)
    // In production, use Supabase Edge Function
    apiKey: null,

    // Supabase Edge Function URL (for production)
    edgeFunctionUrl: null,

    /**
     * Initialize with API key or Edge Function URL
     * @param {object} config - { apiKey: string } or { edgeFunctionUrl: string }
     */
    init(config = {}) {
        if (config.apiKey) {
            this.apiKey = config.apiKey;
            console.log('[Transcribe] Initialized with direct API key');
        }
        if (config.edgeFunctionUrl) {
            this.edgeFunctionUrl = config.edgeFunctionUrl;
            console.log('[Transcribe] Initialized with Edge Function URL');
        }

        // Try to get from meta tag or window config
        if (!this.apiKey && !this.edgeFunctionUrl) {
            const keyMeta = document.querySelector('meta[name="openai-api-key"]');
            if (keyMeta) this.apiKey = keyMeta.content;

            const urlMeta = document.querySelector('meta[name="transcribe-function-url"]');
            if (urlMeta) this.edgeFunctionUrl = urlMeta.content;

            // Check window config
            if (window.OPENAI_API_KEY) this.apiKey = window.OPENAI_API_KEY;
            if (window.TRANSCRIBE_FUNCTION_URL) this.edgeFunctionUrl = window.TRANSCRIBE_FUNCTION_URL;
        }
    },

    /**
     * Check if transcription is available
     */
    isAvailable() {
        return !!(this.apiKey || this.edgeFunctionUrl);
    },

    /**
     * Transcribe audio blob using OpenAI Whisper
     * @param {Blob} audioBlob - Audio file (webm, mp3, wav, etc.)
     * @param {object} options - { language: 'en', prompt: '' }
     * @returns {Promise<string>} - Transcribed text
     */
    async transcribe(audioBlob, options = {}) {
        console.log('[Transcribe] Starting transcription, blob size:', audioBlob.size);

        if (!this.isAvailable()) {
            console.warn('[Transcribe] No API key or Edge Function configured');
            return this.fallbackTranscribe();
        }

        try {
            // Use Edge Function if available (more secure)
            if (this.edgeFunctionUrl) {
                return await this.transcribeViaEdgeFunction(audioBlob, options);
            }

            // Direct API call (for local testing)
            return await this.transcribeDirectAPI(audioBlob, options);

        } catch (error) {
            console.error('[Transcribe] Error:', error);
            throw error;
        }
    },

    /**
     * Transcribe via Supabase Edge Function (production)
     */
    async transcribeViaEdgeFunction(audioBlob, options) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        if (options.language) formData.append('language', options.language);
        if (options.prompt) formData.append('prompt', options.prompt);

        const response = await fetch(this.edgeFunctionUrl, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Transcription failed: ${error}`);
        }

        const result = await response.json();
        return result.text || result.transcript || '';
    },

    /**
     * Transcribe directly via OpenAI API (local testing)
     */
    async transcribeDirectAPI(audioBlob, options) {
        const formData = new FormData();

        // OpenAI expects specific file formats
        // Convert webm to a compatible format name
        const filename = audioBlob.type.includes('webm') ? 'audio.webm' :
                        audioBlob.type.includes('mp4') ? 'audio.mp4' :
                        audioBlob.type.includes('mpeg') ? 'audio.mp3' :
                        'audio.wav';

        formData.append('file', audioBlob, filename);
        formData.append('model', 'whisper-1');

        if (options.language) {
            formData.append('language', options.language);
        }
        if (options.prompt) {
            formData.append('prompt', options.prompt);
        }

        // Optional: response format
        formData.append('response_format', 'json');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Transcription failed');
        }

        const result = await response.json();
        console.log('[Transcribe] Success:', result.text?.substring(0, 50) + '...');
        return result.text || '';
    },

    /**
     * Fallback when no API available
     */
    fallbackTranscribe() {
        console.log('[Transcribe] Using fallback (no transcription)');
        return Promise.resolve('[Transcription unavailable - configure OpenAI API key]');
    },

    /**
     * Estimate cost for audio duration
     * Whisper: $0.006 per minute
     */
    estimateCost(durationSeconds) {
        const minutes = Math.ceil(durationSeconds / 60);
        return (minutes * 0.006).toFixed(4);
    }
};

// Auto-init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Transcribe.init());
} else {
    Transcribe.init();
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Transcribe;
}
