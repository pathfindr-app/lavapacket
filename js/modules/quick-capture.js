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

    // Batch capture support
    batchItems: [], // Array of {blob, type, thumbnail, transcript}

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

                    <!-- Batch preview (shows when items are queued) -->
                    <div class="batch-preview" id="batchPreview" style="display: none;">
                        <div class="batch-items" id="batchItems"></div>
                        <button class="batch-continue-btn" onclick="QuickCapture.goToTagging()">
                            Continue with <span id="batchCount">0</span> items →
                        </button>
                    </div>

                    <div class="capture-options capture-options-2col">
                        <button class="capture-option capture-option-large" onclick="QuickCapture.showMediaOptions()">
                            <span class="capture-option-icon">📷</span>
                            <span class="capture-option-label">Photo / Video</span>
                        </button>
                        <button class="capture-option capture-option-large" onclick="QuickCapture.captureVoice()">
                            <span class="capture-option-icon">🎤</span>
                            <span class="capture-option-label">Voice Memo</span>
                        </button>
                    </div>

                    <!-- Media source selection (hidden by default) -->
                    <div class="media-source-options" id="mediaSourceOptions" style="display: none;">
                        <div class="media-source-title">Choose source</div>
                        <div class="media-source-buttons">
                            <button class="media-source-btn" onclick="QuickCapture.captureFromCamera()">
                                <span>📸</span> Camera
                            </button>
                            <button class="media-source-btn" onclick="QuickCapture.selectFromGallery()">
                                <span>🖼️</span> Gallery
                            </button>
                        </div>
                        <button class="media-source-cancel" onclick="QuickCapture.hideMediaOptions()">Cancel</button>
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
                        <button class="capture-btn-secondary" onclick="QuickCapture.addToBatch()">+ Add More</button>
                        <button class="capture-btn-primary" onclick="QuickCapture.addAndContinue()">Done →</button>
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

            <!-- Hidden file inputs -->
            <input type="file" id="galleryInput" accept="image/*,video/*" multiple style="display: none;" onchange="QuickCapture.handleGallerySelect(event)">
            <input type="file" id="cameraInput" accept="image/*,video/*" capture="environment" style="display: none;" onchange="QuickCapture.handleCameraCapture(event)">
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
        this.batchItems = [];

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

        // Reset batch preview
        const batchPreview = document.getElementById('batchPreview');
        if (batchPreview) batchPreview.style.display = 'none';
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
     * Show media source options (camera or gallery)
     */
    showMediaOptions() {
        const mediaSourceOptions = document.getElementById('mediaSourceOptions');
        const captureOptions = document.querySelector('.capture-options');
        if (mediaSourceOptions) mediaSourceOptions.style.display = 'block';
        if (captureOptions) captureOptions.style.display = 'none';
    },

    /**
     * Hide media source options
     */
    hideMediaOptions() {
        const mediaSourceOptions = document.getElementById('mediaSourceOptions');
        const captureOptions = document.querySelector('.capture-options');
        if (mediaSourceOptions) mediaSourceOptions.style.display = 'none';
        if (captureOptions) captureOptions.style.display = 'grid';
    },

    /**
     * Capture from camera (photo or video - device will prompt)
     */
    captureFromCamera() {
        this.hideMediaOptions();
        document.getElementById('cameraInput').click();
    },

    /**
     * Handle camera capture result (photo or video)
     */
    handleCameraCapture(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.currentBlob = file;
        this.currentType = this.detectFileType(file);

        if (this.currentType === 'photo') {
            const img = document.getElementById('photoPreview');
            img.src = URL.createObjectURL(file);
            img.style.display = 'block';
            img.onload = () => URL.revokeObjectURL(img.src);
            document.getElementById('videoPreview').style.display = 'none';
            document.getElementById('captureStep2Title').textContent = 'Photo Preview';
        } else if (this.currentType === 'video') {
            const video = document.getElementById('videoPreview');
            video.src = URL.createObjectURL(file);
            video.style.display = 'block';
            document.getElementById('photoPreview').style.display = 'none';
            document.getElementById('captureStep2Title').textContent = 'Video Preview';
        }

        document.getElementById('capturePreviewContainer').style.display = 'block';
        document.getElementById('previewControls').style.display = 'flex';
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
        this.hideMediaOptions();
        document.getElementById('galleryInput').click();
    },

    /**
     * Handle gallery selection (supports multiple files)
     */
    async handleGallerySelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // If multiple files selected, add them all to batch and go to tagging
        if (files.length > 1) {
            for (const file of files) {
                const type = this.detectFileType(file);
                const thumbnail = type === 'photo' ? await this.createThumbnail(file) : (type === 'video' ? '🎥' : '📄');

                this.batchItems.push({
                    id: 'batch_' + Date.now() + '_' + this.batchItems.length,
                    blob: file,
                    type: type,
                    thumbnail: thumbnail,
                    transcript: null
                });
            }

            console.log('[QuickCapture] Added', files.length, 'files to batch, total:', this.batchItems.length);
            this.updateBatchPreview();

            // Reset input and go to tagging
            event.target.value = '';
            this.goToTagging();
            return;
        }

        // Single file - show preview as before
        const file = files[0];
        this.currentBlob = file;
        this.currentType = this.detectFileType(file);

        if (this.currentType === 'photo') {
            const img = document.getElementById('photoPreview');
            img.src = URL.createObjectURL(file);
            img.style.display = 'block';
            document.getElementById('videoPreview').style.display = 'none';
            document.getElementById('captureStep2Title').textContent = 'Photo Preview';
        } else if (this.currentType === 'video') {
            const video = document.getElementById('videoPreview');
            video.src = URL.createObjectURL(file);
            video.style.display = 'block';
            document.getElementById('photoPreview').style.display = 'none';
            document.getElementById('captureStep2Title').textContent = 'Video Preview';
        }

        document.getElementById('capturePreviewContainer').style.display = 'block';
        document.getElementById('previewControls').style.display = 'flex';
        this.showStep(2);

        // Reset input
        event.target.value = '';
    },

    /**
     * Detect file type from MIME type or extension
     */
    detectFileType(file) {
        const isImage = file.type.startsWith('image/') ||
            /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(file.name);
        const isVideo = file.type.startsWith('video/') ||
            /\.(mp4|mov|avi|webm|m4v)$/i.test(file.name);

        if (isImage) return 'photo';
        if (isVideo) return 'video';

        console.log('[QuickCapture] Unknown file type, defaulting to photo:', file.type, file.name);
        return 'photo';
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
        this.currentType = null;
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('videoPreview').style.display = 'none';
        document.getElementById('audioPreview').style.display = 'none';
        // Reset media source options display
        const mediaSourceOptions = document.getElementById('mediaSourceOptions');
        if (mediaSourceOptions) mediaSourceOptions.style.display = 'none';
        const captureOptions = document.querySelector('.capture-options');
        if (captureOptions) captureOptions.style.display = 'grid';
        this.showStep(1);
    },

    /**
     * Go to tagging step
     */
    goToTagging() {
        // If we have a current item that hasn't been added to batch, add it
        if (this.currentBlob && !this.batchItems.find(item => item.blob === this.currentBlob)) {
            this.addCurrentToBatch();
        }

        // Need at least one item
        if (this.batchItems.length === 0) {
            alert('Please capture at least one item');
            return;
        }

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

            // Pre-fill note with any voice transcript
            const voiceItem = this.batchItems.find(item => item.type === 'voice' && item.transcript);
            if (voiceItem) {
                document.getElementById('captureNote').value = voiceItem.transcript;
            }
        } else {
            setTimeout(() => {
                document.getElementById('clientSearchInput').focus();
            }, 100);
        }

        // Update save button text for batch
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.textContent = this.batchItems.length > 1
                ? `Save ${this.batchItems.length} Items`
                : 'Save';
        }
    },

    /**
     * Add current item to batch and go back to capture more
     */
    addToBatch() {
        this.addCurrentToBatch();
        this.updateBatchPreview();

        // Reset current item and go back to step 1
        this.currentBlob = null;
        this.currentType = null;
        this.liveTranscript = '';

        // Hide previews
        document.getElementById('photoPreview').style.display = 'none';
        document.getElementById('videoPreview').style.display = 'none';
        document.getElementById('audioPreview').style.display = 'none';

        this.showStep(1);
    },

    /**
     * Add current item to batch and continue to tagging
     */
    addAndContinue() {
        this.addCurrentToBatch();
        this.goToTagging();
    },

    /**
     * Add the current captured item to the batch
     */
    async addCurrentToBatch() {
        if (!this.currentBlob) return;

        // Create thumbnail for preview
        let thumbnail = '';
        if (this.currentType === 'photo') {
            thumbnail = await this.createThumbnail(this.currentBlob);
        } else if (this.currentType === 'video') {
            thumbnail = '🎥';
        } else if (this.currentType === 'voice') {
            thumbnail = '🎤';
        }

        this.batchItems.push({
            id: 'batch_' + Date.now() + '_' + this.batchItems.length,
            blob: this.currentBlob,
            type: this.currentType,
            thumbnail: thumbnail,
            transcript: this.liveTranscript || null
        });

        console.log('[QuickCapture] Added to batch, total items:', this.batchItems.length);
    },

    /**
     * Create a thumbnail from an image blob
     */
    async createThumbnail(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve('📷');
            reader.readAsDataURL(blob);
        });
    },

    /**
     * Update the batch preview display
     */
    updateBatchPreview() {
        const batchPreview = document.getElementById('batchPreview');
        const batchItems = document.getElementById('batchItems');
        const batchCount = document.getElementById('batchCount');

        if (this.batchItems.length === 0) {
            batchPreview.style.display = 'none';
            return;
        }

        batchPreview.style.display = 'block';
        batchCount.textContent = this.batchItems.length;

        batchItems.innerHTML = this.batchItems.map((item, index) => `
            <div class="batch-item" data-index="${index}">
                ${item.type === 'photo' && item.thumbnail.startsWith('data:')
                    ? `<img src="${item.thumbnail}" alt="Photo">`
                    : `<span class="batch-item-icon">${item.thumbnail}</span>`
                }
                <button class="batch-item-remove" onclick="QuickCapture.removeBatchItem(${index})">&times;</button>
            </div>
        `).join('');
    },

    /**
     * Remove an item from the batch
     */
    removeBatchItem(index) {
        this.batchItems.splice(index, 1);
        this.updateBatchPreview();
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
     * Save the captured media (supports batch)
     */
    async save() {
        if (this.batchItems.length === 0) {
            alert('No media to save');
            return;
        }

        if (!this.selectedClientData) {
            alert('Please tag to a client');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        const totalItems = this.batchItems.length;
        let savedCount = 0;

        try {
            const note = document.getElementById('captureNote').value.trim();
            const savedEntries = [];

            for (const item of this.batchItems) {
                savedCount++;
                saveBtn.textContent = `Saving ${savedCount}/${totalItems}...`;

                let transcript = item.transcript;

                // Transcribe voice memos if not already done
                if (item.type === 'voice' && !transcript && typeof Transcribe !== 'undefined' && Transcribe.isAvailable()) {
                    saveBtn.textContent = `Transcribing ${savedCount}/${totalItems}...`;
                    try {
                        transcript = await Transcribe.transcribe(item.blob);
                        console.log('[QuickCapture] Transcription:', transcript);
                    } catch (transcribeErr) {
                        console.warn('[QuickCapture] Transcription failed:', transcribeErr);
                    }
                }

                // Create media entry
                const mediaEntry = {
                    id: 'media_' + Date.now() + '_' + savedCount,
                    type: item.type,
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
                        // Determine extension from blob MIME type or item type
                        let ext = 'jpg'; // default for photos
                        if (item.type === 'video') {
                            ext = 'mp4';
                        } else if (item.type === 'voice') {
                            ext = 'webm';
                        } else if (item.blob && item.blob.type) {
                            // Use actual MIME type if available
                            if (item.blob.type.includes('png')) ext = 'png';
                            else if (item.blob.type.includes('gif')) ext = 'gif';
                            else if (item.blob.type.includes('webp')) ext = 'webp';
                            else if (item.blob.type.includes('heic')) ext = 'heic';
                        }

                        const path = `media/${this.selectedClientId || 'local'}/${mediaEntry.id}.${ext}`;
                        console.log('[QuickCapture] Uploading to storage:', path, 'type:', item.type, 'blob type:', item.blob?.type);

                        const { data, error } = await supabaseClient.storage
                            .from('photos')
                            .upload(path, item.blob, {
                                contentType: item.blob.type || (item.type === 'photo' ? 'image/jpeg' : item.type === 'video' ? 'video/mp4' : 'audio/webm'),
                                upsert: true
                            });

                        if (!error) {
                            const { data: urlData } = supabaseClient.storage
                                .from('photos')
                                .getPublicUrl(path);
                            mediaEntry.url = urlData.publicUrl;
                            mediaEntry.storage_path = path;
                            console.log('[QuickCapture] Storage upload success:', mediaEntry.url);

                            // Save to media table (only if we have a valid client_id)
                            if (this.selectedClientId) {
                                const { error: dbError } = await supabaseClient
                                    .from('media')
                                    .insert({
                                        client_id: this.selectedClientId,
                                        filename: `${mediaEntry.id}.${ext}`,
                                        file_type: item.type,
                                        storage_path: path,
                                        public_url: mediaEntry.url,
                                        caption: transcript || note,
                                        tags: [this.selectedClientData.name, this.selectedClientData.address].filter(Boolean)
                                    });

                                if (dbError) {
                                    console.error('[QuickCapture] Database insert failed:', dbError);
                                } else {
                                    console.log('[QuickCapture] Database insert success');
                                }
                            } else {
                                console.log('[QuickCapture] No client_id, skipping database insert (local-only client)');
                            }
                        } else {
                            console.error('[QuickCapture] Storage upload failed:', error);
                        }
                    } catch (uploadErr) {
                        console.error('[QuickCapture] Storage upload error:', uploadErr);
                    }
                }

                // Also save locally as backup
                if (!mediaEntry.url && item.blob instanceof Blob) {
                    try {
                        mediaEntry.blob = await this.blobToBase64(item.blob);
                    } catch (blobErr) {
                        console.warn('[QuickCapture] Could not convert blob to base64:', blobErr);
                        // Skip blob storage if conversion fails
                    }
                }

                savedEntries.push(mediaEntry);

                // Small delay between uploads
                if (savedCount < totalItems) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            // Save all to localStorage
            const localMedia = JSON.parse(localStorage.getItem('lavaQuickMedia') || '[]');
            localMedia.unshift(...savedEntries);
            // Keep only last 100 entries locally
            localStorage.setItem('lavaQuickMedia', JSON.stringify(localMedia.slice(0, 100)));

            // Show success
            this.showStep(4);

            // Auto close after 1.5s
            setTimeout(() => {
                this.close();
                // Dispatch event for other modules
                document.dispatchEvent(new CustomEvent('quickcapture:saved', {
                    detail: { items: savedEntries, count: savedEntries.length }
                }));
            }, 1500);

        } catch (err) {
            console.error('Save failed:', err);
            alert('Failed to save: ' + err.message);
            saveBtn.disabled = false;
            saveBtn.textContent = `Save ${totalItems} Items`;
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
