/**
 * LAVA Roofing Portal - Voice Memos Module
 * Record, transcribe, and manage voice notes
 */

const Voice = {
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false,
    recordingStartTime: null,
    timerInterval: null,

    /**
     * Check if browser supports audio recording
     */
    isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    },

    /**
     * Start recording
     */
    async startRecording() {
        if (!this.isSupported()) {
            throw new Error('Audio recording is not supported in this browser');
        }

        if (this.isRecording) {
            throw new Error('Already recording');
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: this.getSupportedMimeType()
            });

            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.start(1000); // Collect data every second
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            console.log('[Voice] Recording started');
            this.dispatchEvent('voice:recording-started');

            return true;
        } catch (e) {
            console.error('[Voice] Failed to start recording:', e);
            throw e;
        }
    },

    /**
     * Stop recording and get audio blob
     */
    async stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            throw new Error('Not currently recording');
        }

        return new Promise((resolve, reject) => {
            this.mediaRecorder.onstop = () => {
                const duration = Math.round((Date.now() - this.recordingStartTime) / 1000);
                const blob = new Blob(this.audioChunks, { type: this.getSupportedMimeType() });

                // Stop all tracks
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

                this.isRecording = false;
                this.mediaRecorder = null;
                this.audioChunks = [];

                console.log('[Voice] Recording stopped, duration:', duration, 's');
                this.dispatchEvent('voice:recording-stopped', { blob, duration });

                resolve({ blob, duration });
            };

            this.mediaRecorder.onerror = (e) => {
                reject(e);
            };

            this.mediaRecorder.stop();
        });
    },

    /**
     * Cancel recording without saving
     */
    cancelRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.mediaRecorder = null;
            this.audioChunks = [];
            this.isRecording = false;
            console.log('[Voice] Recording cancelled');
            this.dispatchEvent('voice:recording-cancelled');
        }
    },

    /**
     * Get supported mime type
     */
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return 'audio/webm';
    },

    /**
     * Save voice memo
     */
    async save(blob, options = {}) {
        const { clientId, jobId, transcript = '' } = options;

        if (!SupabaseClient.isAvailable()) {
            return this.saveLocal(blob, options);
        }

        try {
            // Upload audio file
            const memoId = crypto.randomUUID();
            const path = `voice/${memoId}.webm`;

            const { error: uploadError } = await SupabaseClient.getClient().storage
                .from('photos')
                .upload(path, blob, {
                    contentType: this.getSupportedMimeType(),
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: urlData } = SupabaseClient.getClient().storage
                .from('photos')
                .getPublicUrl(path);

            // Calculate duration from blob
            const duration = await this.getAudioDuration(blob);

            // Save to database
            const { data, error } = await SupabaseClient.getClient()
                .from('voice_memos')
                .insert({
                    client_id: clientId,
                    job_id: jobId,
                    audio_url: urlData.publicUrl,
                    transcript: transcript,
                    duration_seconds: duration,
                    recorded_by: 'User'
                })
                .select()
                .single();

            if (error) throw error;

            console.log('[Voice] Saved memo:', data.id);
            this.dispatchEvent('voice:saved', data);

            return data;
        } catch (e) {
            console.error('[Voice] Failed to save:', e);
            return null;
        }
    },

    /**
     * Get audio duration from blob
     */
    async getAudioDuration(blob) {
        return new Promise((resolve) => {
            const audio = new Audio();
            audio.onloadedmetadata = () => {
                resolve(Math.round(audio.duration));
            };
            audio.onerror = () => {
                resolve(0);
            };
            audio.src = URL.createObjectURL(blob);
        });
    },

    /**
     * Transcribe audio (via Supabase Edge Function with OpenAI Whisper)
     */
    async transcribe(blob) {
        if (!SupabaseClient.isAvailable()) {
            console.warn('[Voice] Transcription requires Supabase');
            return null;
        }

        try {
            // Convert blob to base64
            const base64 = await this.blobToBase64(blob);

            // Call Edge Function
            const { data, error } = await SupabaseClient.getClient()
                .functions.invoke('transcribe-audio', {
                    body: { audio: base64 }
                });

            if (error) throw error;

            console.log('[Voice] Transcription result:', data?.text?.substring(0, 50));
            return data?.text || null;
        } catch (e) {
            console.error('[Voice] Transcription failed:', e);
            return null;
        }
    },

    /**
     * Convert blob to base64
     */
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },

    /**
     * List memos for a client or job
     */
    async list(options = {}) {
        if (!SupabaseClient.isAvailable()) return this.listLocal(options);

        try {
            let query = SupabaseClient.getClient()
                .from('voice_memos')
                .select('*')
                .order('created_at', { ascending: false });

            if (options.clientId) {
                query = query.eq('client_id', options.clientId);
            }
            if (options.jobId) {
                query = query.eq('job_id', options.jobId);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data || [];
        } catch (e) {
            console.error('[Voice] Failed to list:', e);
            return [];
        }
    },

    /**
     * Delete a memo
     */
    async delete(id) {
        if (!SupabaseClient.isAvailable()) return this.deleteLocal(id);

        try {
            const { error } = await SupabaseClient.getClient()
                .from('voice_memos')
                .delete()
                .eq('id', id);

            if (error) throw error;

            console.log('[Voice] Deleted memo:', id);
            this.dispatchEvent('voice:deleted', { id });
            return true;
        } catch (e) {
            console.error('[Voice] Failed to delete:', e);
            return false;
        }
    },

    /**
     * Update memo transcript
     */
    async updateTranscript(id, transcript) {
        if (!SupabaseClient.isAvailable()) return null;

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('voice_memos')
                .update({ transcript })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[Voice] Failed to update transcript:', e);
            return null;
        }
    },

    // ==================== LOCAL STORAGE FALLBACK ====================

    saveLocal(blob, options) {
        try {
            const memos = JSON.parse(localStorage.getItem('lava_voice_memos') || '[]');
            const memo = {
                id: crypto.randomUUID(),
                client_id: options.clientId,
                job_id: options.jobId,
                transcript: options.transcript || '',
                duration_seconds: options.duration || 0,
                created_at: new Date().toISOString()
            };
            memos.push(memo);
            localStorage.setItem('lava_voice_memos', JSON.stringify(memos));
            return memo;
        } catch (e) {
            return null;
        }
    },

    listLocal(options = {}) {
        try {
            let memos = JSON.parse(localStorage.getItem('lava_voice_memos') || '[]');
            if (options.clientId) {
                memos = memos.filter(m => m.client_id === options.clientId);
            }
            if (options.jobId) {
                memos = memos.filter(m => m.job_id === options.jobId);
            }
            return memos;
        } catch (e) {
            return [];
        }
    },

    deleteLocal(id) {
        try {
            let memos = JSON.parse(localStorage.getItem('lava_voice_memos') || '[]');
            memos = memos.filter(m => m.id !== id);
            localStorage.setItem('lava_voice_memos', JSON.stringify(memos));
            return true;
        } catch (e) {
            return false;
        }
    },

    // ==================== UI HELPERS ====================

    /**
     * Format duration as MM:SS
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },

    /**
     * Create recording button UI
     */
    createRecordButton(options = {}) {
        const { onSave, clientId, jobId } = options;

        const container = document.createElement('div');
        container.className = 'voice-recorder';
        container.innerHTML = `
            <button class="voice-record-btn" title="Record voice memo">
                <span class="record-icon">🎤</span>
                <span class="record-label">Record</span>
            </button>
            <div class="voice-recording-ui hidden">
                <div class="recording-indicator">
                    <span class="pulse"></span>
                    <span class="recording-time">0:00</span>
                </div>
                <button class="voice-stop-btn" title="Stop recording">Stop</button>
                <button class="voice-cancel-btn" title="Cancel">✕</button>
            </div>
        `;

        const recordBtn = container.querySelector('.voice-record-btn');
        const recordingUI = container.querySelector('.voice-recording-ui');
        const stopBtn = container.querySelector('.voice-stop-btn');
        const cancelBtn = container.querySelector('.voice-cancel-btn');
        const timeDisplay = container.querySelector('.recording-time');

        let timerInterval = null;

        recordBtn.addEventListener('click', async () => {
            try {
                await this.startRecording();
                recordBtn.classList.add('hidden');
                recordingUI.classList.remove('hidden');

                // Start timer
                let seconds = 0;
                timerInterval = setInterval(() => {
                    seconds++;
                    timeDisplay.textContent = this.formatDuration(seconds);
                }, 1000);
            } catch (e) {
                alert('Could not start recording: ' + e.message);
            }
        });

        stopBtn.addEventListener('click', async () => {
            clearInterval(timerInterval);

            try {
                const { blob, duration } = await this.stopRecording();

                // Show saving indicator
                timeDisplay.textContent = 'Saving...';

                // Try to transcribe
                const transcript = await this.transcribe(blob);

                // Save the memo
                const memo = await this.save(blob, {
                    clientId,
                    jobId,
                    transcript: transcript || '',
                    duration
                });

                if (memo && onSave) {
                    onSave(memo);
                }

                // Reset UI
                recordBtn.classList.remove('hidden');
                recordingUI.classList.add('hidden');
                timeDisplay.textContent = '0:00';
            } catch (e) {
                console.error('[Voice] Save failed:', e);
                alert('Failed to save recording');
            }
        });

        cancelBtn.addEventListener('click', () => {
            clearInterval(timerInterval);
            this.cancelRecording();
            recordBtn.classList.remove('hidden');
            recordingUI.classList.add('hidden');
            timeDisplay.textContent = '0:00';
        });

        return container;
    },

    /**
     * Render memo list
     */
    renderMemoList(memos) {
        if (!memos || memos.length === 0) {
            return '<div class="empty-memos">No voice memos</div>';
        }

        return `
            <div class="memo-list">
                ${memos.map(memo => this.renderMemo(memo)).join('')}
            </div>
        `;
    },

    /**
     * Render single memo
     */
    renderMemo(memo) {
        return `
            <div class="memo-item" data-memo-id="${memo.id}">
                <div class="memo-header">
                    <button class="memo-play-btn" data-url="${memo.audio_url}" title="Play">▶</button>
                    <span class="memo-duration">${this.formatDuration(memo.duration_seconds || 0)}</span>
                    <span class="memo-date">${new Date(memo.created_at).toLocaleDateString()}</span>
                    <button class="memo-delete-btn" data-id="${memo.id}" title="Delete">🗑️</button>
                </div>
                <div class="memo-transcript">
                    ${memo.transcript ? this.escapeHtml(memo.transcript) : '<em>No transcript available</em>'}
                </div>
            </div>
        `;
    },

    /**
     * Dispatch custom event
     */
    dispatchEvent(name, detail = {}) {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    },

    /**
     * Escape HTML
     */
    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Voice;
}
