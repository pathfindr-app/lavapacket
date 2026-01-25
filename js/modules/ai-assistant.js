/**
 * LAVA Roofing - AI Voice Assistant
 * Voice-first interface for the entire app
 * "Hey LAVA, show me the Johnson file" -> navigates + shows data
 */

const AIAssistant = {
    isListening: false,
    isSpeaking: false,
    recognition: null,
    synthesis: window.speechSynthesis,
    modal: null,
    conversationHistory: [],

    // OpenAI config
    apiKey: null,
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',

    /**
     * Initialize the AI Assistant
     */
    init() {
        console.log('[AIAssistant] Initializing...');

        // Get API key from config
        this.apiKey = window.OPENAI_API_KEY || null;

        // Check for speech recognition support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[AIAssistant] Speech recognition not supported');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => this.handleSpeechResult(event);
        this.recognition.onerror = (event) => this.handleSpeechError(event);
        this.recognition.onend = () => this.handleSpeechEnd();

        this.createUI();
        this.preloadData();
    },

    /**
     * Preload client/job data for fast lookups
     */
    async preloadData() {
        this.cachedClients = [];
        this.cachedJobs = [];

        try {
            if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
                this.cachedClients = await SupabaseClient.listClients();
            }
            if (typeof Jobs !== 'undefined') {
                this.cachedJobs = await Jobs.list();
            }
        } catch (e) {
            console.warn('[AIAssistant] Failed to preload data:', e);
        }

        // Also load from localStorage
        try {
            const localClients = JSON.parse(localStorage.getItem('lavaClients') || '[]');
            this.cachedClients = [...this.cachedClients, ...localClients];
        } catch (e) {}

        console.log('[AIAssistant] Preloaded', this.cachedClients.length, 'clients,', this.cachedJobs.length, 'jobs');
    },

    /**
     * Get path prefix for navigation (handles root vs subdirectory)
     */
    getPathPrefix() {
        const path = window.location.pathname;
        const isRoot = path.endsWith('/index.html') &&
                       !path.includes('/calendar/') &&
                       !path.includes('/clients/') &&
                       !path.includes('/jobs/') &&
                       !path.includes('/packets/') &&
                       !path.includes('/media/') &&
                       !path.includes('/inspections/') &&
                       !path.includes('/crew/') &&
                       !path.includes('/reports/') &&
                       !path.includes('/voice/') &&
                       !path.includes('/search/');
        return isRoot ? '' : '../';
    },

    /**
     * Create the assistant UI
     */
    createUI() {
        // Remove existing
        const existing = document.getElementById('aiAssistant');
        if (existing) existing.remove();

        // Create floating button
        const btn = document.createElement('button');
        btn.id = 'aiAssistantBtn';
        btn.className = 'ai-assistant-btn';
        btn.innerHTML = '🎙️';
        btn.title = 'Voice Assistant';
        btn.onclick = () => this.toggle();
        document.body.appendChild(btn);

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'aiAssistantModal';
        modal.className = 'ai-assistant-modal';
        modal.innerHTML = `
            <div class="ai-assistant-content">
                <div class="ai-assistant-header">
                    <span class="ai-assistant-title">LAVA Assistant</span>
                    <button class="ai-assistant-close" onclick="AIAssistant.close()">&times;</button>
                </div>

                <div class="ai-assistant-status" id="aiStatus">
                    <div class="ai-status-icon" id="aiStatusIcon">🎙️</div>
                    <div class="ai-status-text" id="aiStatusText">Tap to speak</div>
                </div>

                <div class="ai-assistant-transcript" id="aiTranscript"></div>

                <div class="ai-assistant-response" id="aiResponse"></div>

                <div class="ai-assistant-suggestions" id="aiSuggestions">
                    <div class="ai-suggestion" onclick="AIAssistant.processCommand('Show me today\\'s schedule')">Today's schedule</div>
                    <div class="ai-suggestion" onclick="AIAssistant.processCommand('Find recent clients')">Recent clients</div>
                    <div class="ai-suggestion" onclick="AIAssistant.processCommand('Take a photo')">Take a photo</div>
                </div>

                <div class="ai-assistant-actions">
                    <button class="ai-mic-btn" id="aiMicBtn" onclick="AIAssistant.toggleListening()">
                        <span class="ai-mic-icon">🎙️</span>
                        <span class="ai-mic-text">Hold to Talk</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this.modal = modal;

        // Add keyboard shortcut (hold spacebar)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                if (!this.isListening && this.modal.classList.contains('open')) {
                    e.preventDefault();
                    this.startListening();
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isListening) {
                this.stopListening();
            }
        });
    },

    /**
     * Toggle assistant modal
     */
    toggle() {
        if (this.modal.classList.contains('open')) {
            this.close();
        } else {
            this.open();
        }
    },

    /**
     * Open assistant
     */
    open() {
        this.modal.classList.add('open');
        this.setStatus('ready', 'Tap mic or hold spacebar to speak');
    },

    /**
     * Close assistant
     */
    close() {
        this.stopListening();
        this.modal.classList.remove('open');
    },

    /**
     * Toggle listening
     */
    toggleListening() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    },

    /**
     * Start listening for voice input
     */
    startListening() {
        if (this.isListening || !this.recognition) return;

        this.isListening = true;
        this.setStatus('listening', 'Listening...');
        document.getElementById('aiTranscript').textContent = '';

        try {
            this.recognition.start();
        } catch (e) {
            console.error('[AIAssistant] Failed to start recognition:', e);
            this.isListening = false;
            this.setStatus('error', 'Could not start listening');
        }
    },

    /**
     * Stop listening
     */
    stopListening() {
        if (!this.isListening) return;

        this.isListening = false;
        try {
            this.recognition.stop();
        } catch (e) {}
    },

    /**
     * Handle speech recognition result
     */
    handleSpeechResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // Show transcript
        const transcriptEl = document.getElementById('aiTranscript');
        transcriptEl.innerHTML = `
            <span class="final">${finalTranscript}</span>
            <span class="interim">${interimTranscript}</span>
        `;

        // Process final transcript
        if (finalTranscript) {
            this.processCommand(finalTranscript);
        }
    },

    /**
     * Handle speech error
     */
    handleSpeechError(event) {
        console.error('[AIAssistant] Speech error:', event.error);
        this.isListening = false;

        if (event.error === 'not-allowed') {
            this.setStatus('error', 'Microphone access denied');
        } else {
            this.setStatus('error', 'Error: ' + event.error);
        }
    },

    /**
     * Handle speech end
     */
    handleSpeechEnd() {
        this.isListening = false;
        if (document.getElementById('aiStatusText').textContent === 'Listening...') {
            this.setStatus('ready', 'Tap mic to speak');
        }
    },

    /**
     * Set status display
     */
    setStatus(state, text) {
        const iconEl = document.getElementById('aiStatusIcon');
        const textEl = document.getElementById('aiStatusText');
        const micBtn = document.getElementById('aiMicBtn');

        textEl.textContent = text;

        switch (state) {
            case 'listening':
                iconEl.textContent = '🔴';
                iconEl.classList.add('listening');
                micBtn.classList.add('listening');
                break;
            case 'thinking':
                iconEl.textContent = '🤔';
                iconEl.classList.remove('listening');
                micBtn.classList.remove('listening');
                break;
            case 'speaking':
                iconEl.textContent = '🔊';
                iconEl.classList.remove('listening');
                break;
            case 'error':
                iconEl.textContent = '⚠️';
                iconEl.classList.remove('listening');
                micBtn.classList.remove('listening');
                break;
            default:
                iconEl.textContent = '🎙️';
                iconEl.classList.remove('listening');
                micBtn.classList.remove('listening');
        }
    },

    /**
     * Process a voice command
     */
    async processCommand(command) {
        console.log('[AIAssistant] Processing:', command);
        this.setStatus('thinking', 'Processing...');

        // Hide suggestions after first command
        document.getElementById('aiSuggestions').style.display = 'none';

        try {
            // Parse intent with AI
            const intent = await this.parseIntent(command);
            console.log('[AIAssistant] Intent:', intent);

            // Execute the action
            const result = await this.executeIntent(intent);

            // Show response
            this.showResponse(result);

            // Speak response
            if (result.speech) {
                this.speak(result.speech);
            }

        } catch (e) {
            console.error('[AIAssistant] Command failed:', e);
            this.showResponse({
                text: 'Sorry, I had trouble with that. Please try again.',
                speech: 'Sorry, I had trouble with that.'
            });
        }
    },

    /**
     * Parse intent using OpenAI
     */
    async parseIntent(command) {
        // Build context about available data
        const clientNames = this.cachedClients.slice(0, 50).map(c => c.name).join(', ');

        const systemPrompt = `You are a voice assistant for LAVA Roofing, a roofing company CRM app.
Parse the user's command into a structured intent.

Available clients: ${clientNames || 'None loaded'}

Return JSON only with this structure:
{
  "action": "navigate|search|capture|create|info|schedule|unknown",
  "target": "client|packet|inspection|job|calendar|dashboard|media",
  "query": "search term or client name if mentioned",
  "params": {},
  "confidence": 0.0-1.0
}

Action types:
- navigate: Go to a page (calendar, packets, jobs, clients, dashboard)
- search: Find clients, jobs, or records
- capture: Take photo, video, or voice note
- create: Create new packet, inspection, job, or client
- info: Get information about a specific client or job
- schedule: Check or create calendar events

Examples:
"Show me the calendar" -> {"action":"navigate","target":"calendar","confidence":0.95}
"Find info on Johnson" -> {"action":"info","target":"client","query":"Johnson","confidence":0.9}
"Take a picture" -> {"action":"capture","target":"media","params":{"type":"photo"},"confidence":0.95}
"What jobs are scheduled this week" -> {"action":"schedule","target":"job","query":"this week","confidence":0.85}`;

        // Try local parsing first for common commands
        const localIntent = this.parseLocalIntent(command);
        if (localIntent && localIntent.confidence > 0.8) {
            return localIntent;
        }

        // Use OpenAI for complex parsing
        if (!this.apiKey) {
            // Fallback to local parsing only
            return localIntent || { action: 'unknown', confidence: 0.5 };
        }

        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: command }
                    ],
                    temperature: 0.3,
                    max_tokens: 200
                })
            });

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            // Parse JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.warn('[AIAssistant] OpenAI parsing failed:', e);
        }

        return localIntent || { action: 'unknown', confidence: 0.5 };
    },

    /**
     * Parse intent locally (fast, no API)
     */
    parseLocalIntent(command) {
        const cmd = command.toLowerCase();

        // Navigation commands
        if (cmd.includes('calendar') || cmd.includes('schedule')) {
            return { action: 'navigate', target: 'calendar', confidence: 0.9 };
        }
        if (cmd.includes('dashboard') || cmd.includes('home')) {
            return { action: 'navigate', target: 'dashboard', confidence: 0.9 };
        }
        if (cmd.includes('packet') && (cmd.includes('show') || cmd.includes('go') || cmd.includes('open'))) {
            return { action: 'navigate', target: 'packets', confidence: 0.9 };
        }
        if (cmd.includes('client') && (cmd.includes('show') || cmd.includes('list') || cmd.includes('all'))) {
            return { action: 'navigate', target: 'clients', confidence: 0.9 };
        }
        if (cmd.includes('job') && (cmd.includes('show') || cmd.includes('list'))) {
            return { action: 'navigate', target: 'jobs', confidence: 0.9 };
        }

        // Capture commands
        if (cmd.includes('photo') || cmd.includes('picture')) {
            return { action: 'capture', target: 'media', params: { type: 'photo' }, confidence: 0.95 };
        }
        if (cmd.includes('video') || cmd.includes('record video')) {
            return { action: 'capture', target: 'media', params: { type: 'video' }, confidence: 0.95 };
        }
        if (cmd.includes('voice') || cmd.includes('voice note') || cmd.includes('memo')) {
            return { action: 'capture', target: 'media', params: { type: 'voice' }, confidence: 0.95 };
        }

        // Client info search
        if (cmd.includes('info') || cmd.includes('find') || cmd.includes('look up') || cmd.includes('show me')) {
            // Extract potential name
            const nameMatch = cmd.match(/(?:info|find|look up|show me|about|on|for)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+)?)/i);
            if (nameMatch) {
                const query = nameMatch[1];
                // Check if it matches a client
                const matchedClient = this.cachedClients.find(c =>
                    c.name.toLowerCase().includes(query.toLowerCase())
                );
                if (matchedClient) {
                    return { action: 'info', target: 'client', query: query, clientId: matchedClient.id, confidence: 0.85 };
                }
                return { action: 'search', target: 'client', query: query, confidence: 0.7 };
            }
        }

        // Today's schedule
        if (cmd.includes('today') && (cmd.includes('schedule') || cmd.includes('jobs'))) {
            return { action: 'schedule', target: 'job', query: 'today', confidence: 0.9 };
        }

        return null;
    },

    /**
     * Execute the parsed intent
     */
    async executeIntent(intent) {
        switch (intent.action) {
            case 'navigate':
                return this.executeNavigate(intent);
            case 'search':
                return this.executeSearch(intent);
            case 'capture':
                return this.executeCapture(intent);
            case 'info':
                return this.executeInfo(intent);
            case 'schedule':
                return this.executeSchedule(intent);
            case 'create':
                return this.executeCreate(intent);
            default:
                return {
                    text: "I'm not sure how to help with that. Try asking me to show clients, take a photo, or check the schedule.",
                    speech: "I'm not sure how to help with that."
                };
        }
    },

    /**
     * Execute navigation
     */
    executeNavigate(intent) {
        const prefix = this.getPathPrefix();
        const isRoot = prefix === '';

        const routes = {
            'calendar': `${prefix}calendar/index.html`,
            'dashboard': isRoot ? 'index.html' : `${prefix}index.html`,
            'packets': `${prefix}packets/index.html`,
            'clients': `${prefix}clients/index.html`,
            'jobs': `${prefix}jobs/index.html`,
            'media': `${prefix}media/index.html`,
            'inspections': `${prefix}inspections/index.html`,
            'crew': `${prefix}crew/index.html`,
            'reports': `${prefix}reports/index.html`
        };

        const route = routes[intent.target];
        if (route) {
            // Delay navigation to allow speech
            setTimeout(() => {
                window.location.href = route;
            }, 1500);

            return {
                text: `Opening ${intent.target}...`,
                speech: `Opening ${intent.target}`,
                html: `<div class="ai-response-action">Navigating to ${intent.target}...</div>`
            };
        }

        return { text: `I couldn't find the ${intent.target} page.` };
    },

    /**
     * Execute search
     */
    async executeSearch(intent) {
        const query = intent.query || '';
        const prefix = this.getPathPrefix();

        if (intent.target === 'client') {
            const matches = this.cachedClients.filter(c =>
                c.name.toLowerCase().includes(query.toLowerCase()) ||
                (c.address || '').toLowerCase().includes(query.toLowerCase())
            );

            if (matches.length === 0) {
                return {
                    text: `No clients found matching "${query}"`,
                    speech: `No clients found matching ${query}`
                };
            }

            const resultHtml = matches.slice(0, 5).map(c => `
                <a href="${prefix}clients/view.html?id=${c.id}" class="ai-result-item">
                    <span class="ai-result-icon">👤</span>
                    <span class="ai-result-name">${this.escapeHtml(c.name)}</span>
                    <span class="ai-result-detail">${this.escapeHtml(c.address || '')}</span>
                </a>
            `).join('');

            return {
                text: `Found ${matches.length} client${matches.length > 1 ? 's' : ''} matching "${query}"`,
                speech: `Found ${matches.length} client${matches.length > 1 ? 's' : ''}`,
                html: `<div class="ai-results">${resultHtml}</div>`
            };
        }

        return { text: `Searching for ${query}...` };
    },

    /**
     * Execute capture
     */
    executeCapture(intent) {
        const type = intent.params?.type || 'photo';

        // Open QuickCapture if available
        if (typeof QuickCapture !== 'undefined') {
            this.close();
            setTimeout(() => {
                QuickCapture.open();
                if (type === 'photo') {
                    QuickCapture.capturePhoto();
                } else if (type === 'video') {
                    QuickCapture.captureVideo();
                } else if (type === 'voice') {
                    QuickCapture.captureVoice();
                }
            }, 300);

            return {
                text: `Opening camera for ${type}...`,
                speech: `Opening camera`
            };
        }

        return { text: 'Media capture not available on this page.' };
    },

    /**
     * Execute info lookup
     */
    async executeInfo(intent) {
        const query = intent.query || '';
        const prefix = this.getPathPrefix();

        // Try to find the client
        let client = null;
        if (intent.clientId) {
            client = this.cachedClients.find(c => c.id === intent.clientId);
        }
        if (!client) {
            client = this.cachedClients.find(c =>
                c.name.toLowerCase().includes(query.toLowerCase())
            );
        }

        if (!client) {
            return {
                text: `I couldn't find a client matching "${query}"`,
                speech: `I couldn't find that client`
            };
        }

        // Get client details
        let html = `
            <div class="ai-client-card">
                <div class="ai-client-header">
                    <span class="ai-client-icon">👤</span>
                    <span class="ai-client-name">${this.escapeHtml(client.name)}</span>
                </div>
                <div class="ai-client-details">
                    ${client.address ? `<div class="ai-client-row"><span>📍</span> ${this.escapeHtml(client.address)}</div>` : ''}
                    ${client.phone ? `<div class="ai-client-row"><span>📞</span> <a href="tel:${client.phone}">${this.escapeHtml(client.phone)}</a></div>` : ''}
                    ${client.email ? `<div class="ai-client-row"><span>✉️</span> <a href="mailto:${client.email}">${this.escapeHtml(client.email)}</a></div>` : ''}
                </div>
                <div class="ai-client-stats">
                    <div class="ai-stat"><strong>${client.total_packets || 0}</strong> Packets</div>
                    <div class="ai-stat"><strong>${client.total_inspections || 0}</strong> Inspections</div>
                    <div class="ai-stat"><strong>${client.total_media || 0}</strong> Files</div>
                </div>
                <a href="${prefix}clients/view.html?id=${client.id}" class="ai-client-link">View Full Profile →</a>
            </div>
        `;

        const speech = `${client.name}. ${client.address || 'No address on file'}. ${client.total_packets || 0} packets.`;

        return { text: `Here's info for ${client.name}`, speech, html };
    },

    /**
     * Execute schedule lookup
     */
    async executeSchedule(intent) {
        const today = new Date().toISOString().split('T')[0];
        const prefix = this.getPathPrefix();
        let jobs = [];

        if (typeof Jobs !== 'undefined') {
            jobs = await Jobs.list({ startDate: today, endDate: today });
        }

        if (jobs.length === 0) {
            return {
                text: 'No jobs scheduled for today.',
                speech: 'No jobs scheduled for today',
                html: `<div class="ai-empty">No jobs scheduled for today. <a href="${prefix}calendar/index.html">Open Calendar</a></div>`
            };
        }

        const jobsHtml = jobs.map(j => `
            <a href="${prefix}jobs/view.html?id=${j.id}" class="ai-result-item">
                <span class="ai-result-icon">📋</span>
                <span class="ai-result-name">${this.escapeHtml(j.title || j.clients?.name || 'Job')}</span>
                <span class="ai-result-detail">${j.scheduled_time || 'All day'} - ${this.escapeHtml(j.address || '')}</span>
            </a>
        `).join('');

        return {
            text: `You have ${jobs.length} job${jobs.length > 1 ? 's' : ''} scheduled today.`,
            speech: `You have ${jobs.length} job${jobs.length > 1 ? 's' : ''} scheduled today`,
            html: `<div class="ai-results">${jobsHtml}</div>`
        };
    },

    /**
     * Execute create
     */
    executeCreate(intent) {
        const prefix = this.getPathPrefix();
        const routes = {
            'packet': `${prefix}packets/builder.html`,
            'inspection': `${prefix}inspections/form.html`,
            'job': `${prefix}jobs/new.html`,
            'client': `${prefix}clients/index.html?new=true`
        };

        const route = routes[intent.target];
        if (route) {
            setTimeout(() => {
                window.location.href = route;
            }, 1500);

            return {
                text: `Creating new ${intent.target}...`,
                speech: `Creating new ${intent.target}`
            };
        }

        return { text: `I'm not sure how to create that.` };
    },

    /**
     * Show response in the modal
     */
    showResponse(result) {
        const responseEl = document.getElementById('aiResponse');
        this.setStatus('ready', 'Tap mic to speak');

        let html = '';
        if (result.html) {
            html = result.html;
        } else if (result.text) {
            html = `<div class="ai-response-text">${this.escapeHtml(result.text)}</div>`;
        }

        responseEl.innerHTML = html;
        responseEl.style.display = html ? 'block' : 'none';
    },

    /**
     * Speak text using speech synthesis
     */
    speak(text) {
        if (!this.synthesis || !text) return;

        // Cancel any ongoing speech
        this.synthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1;

        utterance.onstart = () => {
            this.isSpeaking = true;
            this.setStatus('speaking', 'Speaking...');
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            this.setStatus('ready', 'Tap mic to speak');
        };

        this.synthesis.speak(utterance);
    },

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }
};

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AIAssistant.init());
} else {
    AIAssistant.init();
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAssistant;
}
