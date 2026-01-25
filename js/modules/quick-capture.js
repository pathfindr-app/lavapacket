/**
 * LAVA Roofing - Quick Capture Module
 * Dead simple media capture: tap, shoot, tag to client, done
 */

const QuickCapture = {
    modal: null,
    currentBlob: null,
    currentType: null, // 'photo', 'video', 'voice'
    mediaRecorder: null,
    audioChunks: [],
    videoChunks: [],
    recordingStartTime: null,
    speechRecognition: null,
    liveTranscript: '',
    detectedNames: [],

    /**
     * Initialize quick capture - adds floating button to page
     */
    init() {
        console.log('[QuickCapture] Initializing...');
        this.createFloatingButton();
        this.createModal();
    },

    /**
     * Create the floating capture button
     */
    createFloatingButton() {
        // Remove if exists
        const existing = document.getElementById('quickCaptureBtn');
        if (existing) existing.remove();

        const btn = document.createElement('button');
        btn.id = 'quickCaptureBtn';
        btn.className = 'quick-capture-fab';
        btn.innerHTML = '+';
        btn.title = 'Add Photo/Video/Voice';
        btn.onclick = () => this.open();

        document.body.appendChild(btn);
    },

    /**
     * Create the capture modal
     */
    createModal() {
        // Remove if exists
        const existing = document.getElementById('quickCaptureModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'quickCaptureModal';
        modal.className = 'quick-capture-modal';
        modal.innerHTML = `
            <div class="quick-capture-content">
                <button class="quick-capture-close" onclick="QuickCapture.close()">&times;</button>

                <!-- Step 1: Choose capture type -->
                <div class="capture-step" id="captureStep1">
                    <div class="capture-title">Add Media</div>
                    <div class="capture-options">
                        <button class="capture-option" onclick="QuickCapture.capturePhoto()">
                            <span class="capture-option-icon">📷</span>
                            <span class="capture-option-label">Photo</span>
                        </button>
                        <button class="capture-option" onclick="QuickCapture.captureVideo()">
                            <span class="capture-option-icon">🎥</span>
                            <span class="capture-option-label">Video</span>
                        </button>
                        <button class="capture-option" onclick="QuickCapture.captureVoice()">
                            <span class="capture-option-icon">🎤</span>
                            <span class="capture-option-label">Voice</span>
                        </button>
                        <button class="capture-option" onclick="QuickCapture.selectFromGallery()">
                            <span class="capture-option-icon">🖼️</span>
                            <span class="capture-option-label">Gallery</span>
                        </button>
                    </div>
                </div>

                <!-- Step 2: Recording/Preview -->
                <div class="capture-step" id="captureStep2" style="display: none;">
                    <div class="capture-title" id="captureStep2Title">Recording...</div>

                    <!-- Video/Photo preview -->
                    <div id="capturePreviewContainer" style="display: none;">
                        <video id="cameraPreview" autoplay playsinline muted></video>
                        <video id="videoPreview" controls style="display: none;"></video>
                        <img id="photoPreview" style="display: none;">
                        <audio id="audioPreview" controls style="display: none;"></audio>
                    </div>

                    <!-- Recording controls -->
                    <div id="recordingControls" style="display: none;">
                        <div class="recording-timer" id="recordingTimer">00:00</div>
                        <div class="live-transcript" id="liveTranscript" style="display: none;">
                            <div class="live-transcript-text" id="liveTranscriptText"></div>
                            <div class="detected-clients" id="detectedClients"></div>
                        </div>
                        <button class="recording-stop-btn" id="stopRecordingBtn" onclick="QuickCapture.stopRecording()">
                            ⏹️ Stop
                        </button>
                    </div>

                    <!-- Preview controls -->
                    <div id="previewControls" style="display: none;">
                        <button class="capture-btn-secondary" onclick="QuickCapture.retake()">Retake</button>
                        <button class="capture-btn-primary" onclick="QuickCapture.goToTagging()">Use This →</button>
                    </div>
                </div>

                <!-- Step 3: Tag to client -->
                <div class="capture-step" id="captureStep3" style="display: none;">
                    <div class="capture-title">Tag to Client</div>
                    <div class="capture-search-wrapper">
                        <input type="text"
                            id="clientSearchInput"
                            class="capture-search-input"
                            placeholder="Type last name or address..."
                            autocomplete="off"
                            oninput="QuickCapture.searchClients(this.value)">
                        <div class="capture-search-results" id="clientSearchResults"></div>
                    </div>

                    <div id="selectedClient" class="selected-client" style="display: none;">
                        <span id="selectedClientName"></span>
                        <button onclick="QuickCapture.clearClient()">&times;</button>
                    </div>

                    <!-- Optional note -->
                    <input type="text"
                        id="captureNote"
                        class="capture-note-input"
                        placeholder="Add a note (optional)">

                    <button class="capture-btn-primary capture-save-btn" onclick="QuickCapture.save()" id="saveBtn">
                        Save
                    </button>
                </div>

                <!-- Step 4: Success -->
                <div class="capture-step" id="captureStep4" style="display: none;">
                    <div class="capture-success">
                        <div class="capture-success-icon">✓</div>
                        <div class="capture-success-text">Saved!</div>
                    </div>
                </div>
            </div>

            <!-- Hidden file input -->
            <input type="file" id="galleryInput" accept="image/*,video/*" style="display: none;" onchange="QuickCapture.handleGallerySelect(event)">
            <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display: none;" onchange="QuickCapture.handleCameraCapture(event)">
            <input type="file" id="videoInput" accept="video/*" capture="environment" style="display: none;" onchange="QuickCapture.handleVideoCapture(event)">
        `;

        document.body.appendChild(modal);
        this.modal = modal;
    },

    /**
     * Open the capture modal
     */
    open() {
        this.reset();
        this.modal.classList.add('open');
        this.showStep(1);
    },

    /**
     * Close the capture modal
     */
    close() {
        this.stopAllStreams();
        this.modal.classList.remove('open');
        this.reset();
    },

    /**
     * Reset state
     */
    reset() {
        this.currentBlob = null;
        this.currentType = null;
        this.audioChunks = [];
        this.videoChunks = [];
        this.selectedClientId = null;
        this.selectedClientData = null;
        this.liveTranscript = '';
        this.detectedNames = [];

        // Stop speech recognition if active
        if (this.speechRecognition) {
            try { this.speechRecognition.stop(); } catch (e) {}
            this.speechRecognition = null;
        }

        // Reset UI
        document.getElementById('clientSearchInput').value = '';
        document.getElementById('clientSearchResults').innerHTML = '';
        document.getElementById('selectedClient').style.display = 'none';
        document.getElementById('captureNote').value = '';

        // Hide previews
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('videoPreview').style.display = 'none';
        document.getElementById('audioPreview').style.display = 'none';
        document.getElementById('cameraPreview').style.display = 'none';

        // Reset live transcript
        const liveTranscriptEl = document.getElementById('liveTranscript');
        if (liveTranscriptEl) liveTranscriptEl.style.display = 'none';
    },

    /**
     * Show a specific step
     */
    showStep(step) {
        document.querySelectorAll('.capture-step').forEach(el => el.style.display = 'none');
        document.getElementById(`captureStep${step}`).style.display = 'block';
    },

    /**
     * Stop all media streams
     */
    stopAllStreams() {
        const video = document.getElementById('cameraPreview');
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    },

    // ==================== CAPTURE METHODS ====================

    /**
     * Capture photo using device camera
     */
    capturePhoto() {
        this.currentType = 'photo';
        // Use file input with capture for mobile
        document.getElementById('cameraInput').click();
    },

    /**
     * Handle camera capture result
     */
    handleCameraCapture(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentBlob = file;
        this.currentType = 'photo';

        // Show preview
        const img = document.getElementById('photoPreview');
        img.src = URL.createObjectURL(file);
        img.style.display = 'block';
        img.onload = () => URL.revokeObjectURL(img.src);

        document.getElementById('capturePreviewContainer').style.display = 'block';
        document.getElementById('previewControls').style.display = 'flex';
        document.getElementById('captureStep2Title').textContent = 'Photo Preview';
        this.showStep(2);

        // Reset input
        event.target.value = '';
    },

    /**
     * Capture video using device camera
     */
    captureVideo() {
        this.currentType = 'video';
        document.getElementById('videoInput').click();
    },

    /**
     * Handle video capture result
     */
    handleVideoCapture(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentBlob = file;
        this.currentType = 'video';

        // Show preview
        const video = document.getElementById('videoPreview');
        video.src = URL.createObjectURL(file);
        video.style.display = 'block';

        document.getElementById('capturePreviewContainer').style.display = 'block';
        document.getElementById('previewControls').style.display = 'flex';
        document.getElementById('captureStep2Title').textContent = 'Video Preview';
        this.showStep(2);

        // Reset input
        event.target.value = '';
    },

    /**
     * Capture voice memo with real-time transcription
     */
    async captureVoice() {
        this.currentType = 'voice';
        this.liveTranscript = '';
        this.detectedNames = [];

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];

            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                this.currentBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

                // Stop speech recognition
                if (this.speechRecognition) {
                    try { this.speechRecognition.stop(); } catch (e) {}
                }

                // Show audio preview
                const audio = document.getElementById('audioPreview');
                audio.src = URL.createObjectURL(this.currentBlob);
                audio.style.display = 'block';

                document.getElementById('recordingControls').style.display = 'none';
                document.getElementById('capturePreviewContainer').style.display = 'block';
                document.getElementById('previewControls').style.display = 'flex';
                document.getElementById('captureStep2Title').textContent = 'Voice Preview';
            };

            this.mediaRecorder.start();
            this.recordingStartTime = Date.now();
            this.updateRecordingTimer();

            // Start real-time transcription for client name detection
            this.startLiveTranscription();

            document.getElementById('captureStep2Title').textContent = 'Recording Voice...';
            document.getElementById('recordingControls').style.display = 'flex';
            document.getElementById('capturePreviewContainer').style.display = 'none';
            document.getElementById('previewControls').style.display = 'none';
            this.showStep(2);

        } catch (err) {
            alert('Could not access microphone: ' + err.message);
        }
    },

    /**
     * Start live transcription using Web Speech API
     * This runs alongside MediaRecorder to detect client names in real-time
     */
    startLiveTranscription() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.log('[QuickCapture] Speech recognition not supported');
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';

        const liveTranscriptEl = document.getElementById('liveTranscript');
        const liveTranscriptText = document.getElementById('liveTranscriptText');
        const detectedClientsEl = document.getElementById('detectedClients');

        if (liveTranscriptEl) liveTranscriptEl.style.display = 'block';

        this.speechRecognition.onresult = async (event) => {
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

            // Update live transcript display
            this.liveTranscript = finalTranscript || interimTranscript;
            if (liveTranscriptText) {
                liveTranscriptText.textContent = this.liveTranscript || '...listening';
            }

            // Search for potential client names in the transcript
            if (this.liveTranscript.length > 2) {
                await this.detectClientNames(this.liveTranscript);
            }
        };

        this.speechRecognition.onerror = (event) => {
            console.log('[QuickCapture] Speech recognition error:', event.error);
            // Don't alert - it's okay if speech recognition fails
        };

        this.speechRecognition.onend = () => {
            // Restart if still recording
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                try {
                    this.speechRecognition.start();
                } catch (e) {}
            }
        };

        try {
            this.speechRecognition.start();
        } catch (e) {
            console.log('[QuickCapture] Could not start speech recognition:', e);
        }
    },

    /**
     * Detect client names in transcript and show suggestions
     */
    async detectClientNames(transcript) {
        const detectedClientsEl = document.getElementById('detectedClients');
        if (!detectedClientsEl) return;

        // Extract potential names (words that could be last names)
        const words = transcript.split(/\s+/).filter(w => w.length > 2);

        // Search each word as a potential name
        let matchedClients = [];

        for (const word of words) {
            // Skip common words
            const skipWords = ['the', 'and', 'for', 'this', 'that', 'with', 'have', 'been', 'roof', 'roofing', 'house', 'home', 'need', 'needs', 'want', 'wants', 'going', 'looking', 'about', 'just', 'their', 'they', 'them', 'from'];
            if (skipWords.includes(word.toLowerCase())) continue;

            // Search for clients matching this word
            let clients = [];

            if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
                try {
                    clients = await SupabaseClient.searchClients(word);
                } catch (e) {}
            }

            // Also check localStorage
            const localClients = this.searchLocalClients(word);
            localClients.forEach(lc => {
                if (!clients.find(c => c.name === lc.name)) {
                    clients.push(lc);
                }
            });

            // Add matched clients
            clients.forEach(c => {
                if (!matchedClients.find(mc => mc.name === c.name)) {
                    matchedClients.push(c);
                }
            });
        }

        // Display matched clients as quick-select buttons
        if (matchedClients.length > 0) {
            this.detectedNames = matchedClients.slice(0, 3);
            detectedClientsEl.innerHTML = `
                <div class="detected-label">Detected:</div>
                ${this.detectedNames.map(c => `
                    <button class="detected-client-btn" onclick="QuickCapture.selectDetectedClient('${c.id || ''}', '${this.escapeHtml(c.name)}', '${this.escapeHtml(c.address || '')}')">
                        ${this.escapeHtml(c.name)}
                    </button>
                `).join('')}
            `;
        } else {
            detectedClientsEl.innerHTML = '';
        }
    },

    /**
     * Select a client detected from voice
     */
    selectDetectedClient(id, name, address) {
        this.selectedClientId = id;
        this.selectedClientData = { id, name, address };

        // Visual feedback
        const detectedClientsEl = document.getElementById('detectedClients');
        if (detectedClientsEl) {
            detectedClientsEl.innerHTML = `<div class="detected-selected">✓ ${name}</div>`;
        }
    },

    /**
     * Select from gallery
     */
    selectFromGallery() {
        document.getElementById('galleryInput').click();
    },

    /**
     * Handle gallery selection
     */
    handleGallerySelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentBlob = file;

        if (file.type.startsWith('image/')) {
            this.currentType = 'photo';
            const img = document.getElementById('photoPreview');
            img.src = URL.createObjectURL(file);
            img.style.display = 'block';
            document.getElementById('captureStep2Title').textContent = 'Photo Preview';
        } else if (file.type.startsWith('video/')) {
            this.currentType = 'video';
            const video = document.getElementById('videoPreview');
            video.src = URL.createObjectURL(file);
            video.style.display = 'block';
            document.getElementById('captureStep2Title').textContent = 'Video Preview';
        }

        document.getElementById('capturePreviewContainer').style.display = 'block';
        document.getElementById('previewControls').style.display = 'flex';
        this.showStep(2);

        // Reset input
        event.target.value = '';
    },

    /**
     * Update recording timer
     */
    updateRecordingTimer() {
        if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;

        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('recordingTimer').textContent = `${mins}:${secs}`;

        setTimeout(() => this.updateRecordingTimer(), 1000);
    },

    /**
     * Stop recording
     */
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    },

    /**
     * Retake/re-record
     */
    retake() {
        this.currentBlob = null;
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('videoPreview').style.display = 'none';
        document.getElementById('audioPreview').style.display = 'none';
        this.showStep(1);
    },

    /**
     * Go to tagging step
     */
    goToTagging() {
        this.showStep(3);

        // Auto-select detected client if we found one during voice recording
        if (!this.selectedClientData && this.detectedNames.length > 0) {
            const bestMatch = this.detectedNames[0];
            this.selectedClientId = bestMatch.id;
            this.selectedClientData = bestMatch;
        }

        // If a client was detected from voice, pre-select them
        if (this.selectedClientData) {
            document.getElementById('clientSearchInput').style.display = 'none';
            document.getElementById('clientSearchResults').innerHTML = '';

            const selectedEl = document.getElementById('selectedClient');
            document.getElementById('selectedClientName').innerHTML = `
                <strong>${this.selectedClientData.name}</strong>${this.selectedClientData.address ? `<br><small>${this.selectedClientData.address}</small>` : ''}
            `;
            selectedEl.style.display = 'flex';

            // Pre-fill note with live transcript if it was a voice memo
            if (this.currentType === 'voice' && this.liveTranscript) {
                document.getElementById('captureNote').value = this.liveTranscript;
            }
        } else {
            setTimeout(() => {
                document.getElementById('clientSearchInput').focus();
            }, 100);
        }
    },

    // ==================== CLIENT SEARCH ====================

    selectedClientId: null,
    selectedClientData: null,
    searchTimeout: null,

    /**
     * Search clients by name or address
     */
    async searchClients(query) {
        clearTimeout(this.searchTimeout);

        const resultsContainer = document.getElementById('clientSearchResults');

        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            let clients = [];

            // Try Supabase first
            if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
                clients = await SupabaseClient.searchClients(query);
            }

            // Also search localStorage clients
            const localClients = this.searchLocalClients(query);

            // Merge and dedupe
            const allClients = [...clients];
            localClients.forEach(lc => {
                if (!allClients.find(c => c.name === lc.name && c.address === lc.address)) {
                    allClients.push(lc);
                }
            });

            if (allClients.length === 0) {
                // Show option to create new
                resultsContainer.innerHTML = `
                    <div class="search-result-item create-new" onclick="QuickCapture.createNewClient('${this.escapeHtml(query)}')">
                        <span class="search-result-icon">➕</span>
                        <span class="search-result-text">Create "${query}"</span>
                    </div>
                `;
            } else {
                resultsContainer.innerHTML = allClients.slice(0, 5).map(client => `
                    <div class="search-result-item" onclick="QuickCapture.selectClient('${client.id || ''}', '${this.escapeHtml(client.name)}', '${this.escapeHtml(client.address || '')}')">
                        <span class="search-result-icon">👤</span>
                        <span class="search-result-text">
                            <strong>${this.escapeHtml(client.name)}</strong>
                            ${client.address ? `<br><small>${this.escapeHtml(client.address)}</small>` : ''}
                        </span>
                    </div>
                `).join('') + `
                    <div class="search-result-item create-new" onclick="QuickCapture.createNewClient('${this.escapeHtml(query)}')">
                        <span class="search-result-icon">➕</span>
                        <span class="search-result-text">Create new: "${query}"</span>
                    </div>
                `;
            }
        }, 200);
    },

    /**
     * Search local storage for clients
     */
    searchLocalClients(query) {
        const clients = [];
        const q = query.toLowerCase();

        // Check packets for customer names/addresses
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('lavaPacketBuilder_') || key.startsWith('lavaInspection_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const name = data.customer_name || data.fields?.customerName || '';
                    const address = data.customer_address || data.fields?.customerAddress || '';

                    if (name.toLowerCase().includes(q) || address.toLowerCase().includes(q)) {
                        if (!clients.find(c => c.name === name)) {
                            clients.push({ id: null, name, address });
                        }
                    }
                } catch (e) {}
            }
        }

        // Check local clients storage
        try {
            const localClients = JSON.parse(localStorage.getItem('lavaClients') || '[]');
            localClients.forEach(c => {
                if (c.name.toLowerCase().includes(q) || (c.address || '').toLowerCase().includes(q)) {
                    if (!clients.find(existing => existing.name === c.name)) {
                        clients.push(c);
                    }
                }
            });
        } catch (e) {}

        return clients;
    },

    /**
     * Select a client
     */
    selectClient(id, name, address) {
        this.selectedClientId = id;
        this.selectedClientData = { id, name, address };

        document.getElementById('clientSearchInput').style.display = 'none';
        document.getElementById('clientSearchResults').innerHTML = '';

        const selectedEl = document.getElementById('selectedClient');
        document.getElementById('selectedClientName').innerHTML = `
            <strong>${name}</strong>${address ? `<br><small>${address}</small>` : ''}
        `;
        selectedEl.style.display = 'flex';
    },

    /**
     * Create new client from search
     */
    async createNewClient(name) {
        // Simple: just use the name as-is, create client entry
        const clientData = { name, address: '' };

        if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
            const created = await SupabaseClient.saveClient(clientData);
            if (created) {
                this.selectClient(created.id, created.name, created.address);
                return;
            }
        }

        // Local fallback
        const localClients = JSON.parse(localStorage.getItem('lavaClients') || '[]');
        const newClient = { id: 'local_' + Date.now(), ...clientData };
        localClients.push(newClient);
        localStorage.setItem('lavaClients', JSON.stringify(localClients));

        this.selectClient(newClient.id, newClient.name, '');
    },

    /**
     * Clear selected client
     */
    clearClient() {
        this.selectedClientId = null;
        this.selectedClientData = null;
        document.getElementById('selectedClient').style.display = 'none';
        document.getElementById('clientSearchInput').style.display = 'block';
        document.getElementById('clientSearchInput').value = '';
        document.getElementById('clientSearchInput').focus();
    },

    // ==================== SAVE ====================

    /**
     * Save the captured media
     */
    async save() {
        if (!this.currentBlob) {
            alert('No media to save');
            return;
        }

        if (!this.selectedClientData) {
            alert('Please tag to a client');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            let note = document.getElementById('captureNote').value.trim();
            let transcript = null;

            // Transcribe voice memos
            if (this.currentType === 'voice' && typeof Transcribe !== 'undefined' && Transcribe.isAvailable()) {
                saveBtn.textContent = 'Transcribing...';
                try {
                    transcript = await Transcribe.transcribe(this.currentBlob);
                    console.log('[QuickCapture] Transcription:', transcript);
                    // Use transcript as note if no note provided
                    if (!note && transcript) {
                        note = transcript;
                    }
                } catch (transcribeErr) {
                    console.warn('[QuickCapture] Transcription failed:', transcribeErr);
                    // Continue without transcript
                }
                saveBtn.textContent = 'Saving...';
            }

            // Create media entry
            const mediaEntry = {
                id: 'media_' + Date.now(),
                type: this.currentType,
                client_id: this.selectedClientId,
                client_name: this.selectedClientData.name,
                client_address: this.selectedClientData.address,
                note: note,
                transcript: transcript,
                created_at: new Date().toISOString(),
                blob: null,
                url: null
            };

            // Try to upload to Supabase Storage
            const supabaseClient = typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()
                ? SupabaseClient.getClient()
                : null;

            if (supabaseClient && supabaseClient.storage) {
                try {
                    const ext = this.currentType === 'photo' ? 'jpg' : this.currentType === 'video' ? 'mp4' : 'webm';
                    const path = `media/${this.selectedClientId || 'local'}/${mediaEntry.id}.${ext}`;

                    const { data, error } = await supabaseClient.storage
                        .from('photos')
                        .upload(path, this.currentBlob, {
                            contentType: this.currentBlob.type,
                            upsert: true
                        });

                    if (!error) {
                        const { data: urlData } = supabaseClient.storage
                            .from('photos')
                            .getPublicUrl(path);
                        mediaEntry.url = urlData.publicUrl;
                        mediaEntry.storage_path = path;

                        // Save to media table
                        await supabaseClient
                            .from('media')
                            .insert({
                                client_id: this.selectedClientId,
                                filename: `${mediaEntry.id}.${ext}`,
                                file_type: this.currentType,
                                storage_path: path,
                                public_url: mediaEntry.url,
                                caption: note,
                                tags: [this.selectedClientData.name, this.selectedClientData.address].filter(Boolean)
                            });
                    } else {
                        console.warn('[QuickCapture] Storage upload failed:', error);
                    }
                } catch (uploadErr) {
                    console.warn('[QuickCapture] Storage upload error:', uploadErr);
                    // Continue - will save locally
                }
            }

            // Also save locally as backup
            if (!mediaEntry.url) {
                // Convert to base64 for local storage (limited, but works for small files)
                mediaEntry.blob = await this.blobToBase64(this.currentBlob);
            }

            const localMedia = JSON.parse(localStorage.getItem('lavaQuickMedia') || '[]');
            localMedia.unshift(mediaEntry);
            // Keep only last 50 entries locally
            localStorage.setItem('lavaQuickMedia', JSON.stringify(localMedia.slice(0, 50)));

            // Show success
            this.showStep(4);

            // Auto close after 1.5s
            setTimeout(() => {
                this.close();
                // Dispatch event for other modules
                document.dispatchEvent(new CustomEvent('quickcapture:saved', { detail: mediaEntry }));
            }, 1500);

        } catch (err) {
            console.error('Save failed:', err);
            alert('Failed to save: ' + err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    },

    /**
     * Convert blob to base64
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    },

    // ==================== GET MEDIA ====================

    /**
     * Get all media for a client
     */
    async getClientMedia(clientId) {
        let media = [];

        // From Supabase
        if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
            const { data, error } = await SupabaseClient.getClient()
                .from('media')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (!error && data) {
                media = data;
            }
        }

        // From localStorage
        const localMedia = JSON.parse(localStorage.getItem('lavaQuickMedia') || '[]');
        const clientLocalMedia = localMedia.filter(m => m.client_id === clientId);

        // Merge
        return [...media, ...clientLocalMedia];
    },

    /**
     * Get recent media
     */
    getRecentMedia(limit = 20) {
        const localMedia = JSON.parse(localStorage.getItem('lavaQuickMedia') || '[]');
        return localMedia.slice(0, limit);
    }
};

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => QuickCapture.init());
} else {
    QuickCapture.init();
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuickCapture;
}
