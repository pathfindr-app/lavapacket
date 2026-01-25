/**
 * LAVA Roofing Portal - Digital Signature Module
 * Canvas-based signature capture and storage
 */

const Signature = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    lastPoint: null,
    hasSignature: false,

    /**
     * Initialize signature pad on canvas element
     */
    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('[Signature] Canvas not found:', canvasId);
            return false;
        }

        this.ctx = this.canvas.getContext('2d');
        this.setupCanvas();
        this.setupListeners();

        return true;
    },

    /**
     * Setup canvas dimensions and styling
     */
    setupCanvas() {
        // Set canvas size based on container
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width || 400;
        this.canvas.height = 200;

        // Set drawing styles
        this.ctx.strokeStyle = '#1a1a1a';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Draw signature line
        this.drawSignatureLine();
    },

    /**
     * Draw the signature baseline
     */
    drawSignatureLine() {
        this.ctx.save();
        this.ctx.strokeStyle = '#e5e5e5';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(20, this.canvas.height - 40);
        this.ctx.lineTo(this.canvas.width - 20, this.canvas.height - 40);
        this.ctx.stroke();
        this.ctx.restore();

        // Draw X marker
        this.ctx.save();
        this.ctx.fillStyle = '#888';
        this.ctx.font = '14px sans-serif';
        this.ctx.fillText('X', 10, this.canvas.height - 35);
        this.ctx.restore();
    },

    /**
     * Setup event listeners
     */
    setupListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());

        // Resize handler
        window.addEventListener('resize', () => {
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.setupCanvas();
            this.ctx.putImageData(imageData, 0, 0);
        });
    },

    /**
     * Start drawing
     */
    startDrawing(e) {
        this.isDrawing = true;
        this.lastPoint = this.getPoint(e);
        this.hasSignature = true;
    },

    /**
     * Draw on canvas
     */
    draw(e) {
        if (!this.isDrawing) return;

        const point = this.getPoint(e);

        this.ctx.beginPath();
        this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
        this.ctx.lineTo(point.x, point.y);
        this.ctx.stroke();

        this.lastPoint = point;
    },

    /**
     * Stop drawing
     */
    stopDrawing() {
        this.isDrawing = false;
        this.lastPoint = null;
    },

    /**
     * Get point from event
     */
    getPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },

    /**
     * Clear the signature
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawSignatureLine();
        this.hasSignature = false;
    },

    /**
     * Check if signature exists
     */
    isEmpty() {
        return !this.hasSignature;
    },

    /**
     * Get signature as base64 PNG
     */
    getDataURL() {
        if (this.isEmpty()) return null;
        return this.canvas.toDataURL('image/png');
    },

    /**
     * Get signature as blob
     */
    async getBlob() {
        if (this.isEmpty()) return null;

        return new Promise((resolve) => {
            this.canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    },

    /**
     * Save signature to database
     */
    async save(options = {}) {
        const { packetId, clientId, signerName, signerEmail } = options;

        if (this.isEmpty()) {
            throw new Error('No signature to save');
        }

        const signatureData = this.getDataURL();

        // Get user info
        const userAgent = navigator.userAgent;
        const ipAddress = 'Unknown'; // Would need server to get real IP

        const signature = {
            packet_id: packetId,
            client_id: clientId,
            signer_name: signerName,
            signer_email: signerEmail,
            signature_data: signatureData,
            ip_address: ipAddress,
            user_agent: userAgent,
            signed_at: new Date().toISOString()
        };

        if (!SupabaseClient.isAvailable()) {
            return this.saveLocal(signature);
        }

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('signatures')
                .insert(signature)
                .select()
                .single();

            if (error) throw error;

            console.log('[Signature] Saved:', data.id);
            this.dispatchEvent('signature:saved', data);

            return data;
        } catch (e) {
            console.error('[Signature] Save failed:', e);
            throw e;
        }
    },

    /**
     * Get signature for packet
     */
    async getForPacket(packetId) {
        if (!SupabaseClient.isAvailable()) return null;

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('signatures')
                .select('*')
                .eq('packet_id', packetId)
                .order('signed_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            return data?.[0] || null;
        } catch (e) {
            console.error('[Signature] Get failed:', e);
            return null;
        }
    },

    /**
     * Check if packet is signed
     */
    async isPacketSigned(packetId) {
        const signature = await this.getForPacket(packetId);
        return !!signature;
    },

    /**
     * Verify signature exists and is valid
     */
    async verify(signatureId) {
        if (!SupabaseClient.isAvailable()) return { valid: false };

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('signatures')
                .select('*')
                .eq('id', signatureId)
                .single();

            if (error || !data) return { valid: false };

            return {
                valid: true,
                signature: data,
                signedAt: data.signed_at,
                signerName: data.signer_name,
                signerEmail: data.signer_email
            };
        } catch (e) {
            return { valid: false };
        }
    },

    // ==================== LOCAL STORAGE FALLBACK ====================

    saveLocal(signature) {
        const signatures = JSON.parse(localStorage.getItem('lava_signatures') || '[]');
        const saved = {
            ...signature,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString()
        };
        signatures.push(saved);
        localStorage.setItem('lava_signatures', JSON.stringify(signatures));
        return saved;
    },

    // ==================== UI COMPONENTS ====================

    /**
     * Create signature pad element
     */
    createSignaturePad(options = {}) {
        const { id = 'signatureCanvas', onSign } = options;

        const container = document.createElement('div');
        container.className = 'signature-pad';
        container.innerHTML = `
            <div class="signature-header">
                <span class="signature-label">Sign Below</span>
                <button type="button" class="signature-clear" title="Clear">Clear</button>
            </div>
            <div class="signature-canvas-container">
                <canvas id="${id}"></canvas>
            </div>
            <div class="signature-footer">
                <span class="signature-hint">Draw your signature using mouse or touch</span>
            </div>
        `;

        // Wait for DOM to attach, then init
        setTimeout(() => {
            this.init(id);

            container.querySelector('.signature-clear').addEventListener('click', () => {
                this.clear();
            });

            if (onSign) {
                this.canvas.addEventListener('mouseup', () => {
                    if (!this.isEmpty()) onSign(this.getDataURL());
                });
                this.canvas.addEventListener('touchend', () => {
                    if (!this.isEmpty()) onSign(this.getDataURL());
                });
            }
        }, 0);

        return container;
    },

    /**
     * Create signature verification display
     */
    renderSignatureVerification(signature) {
        if (!signature) {
            return '<div class="signature-verification unsigned">Not yet signed</div>';
        }

        return `
            <div class="signature-verification signed">
                <div class="signature-image">
                    <img src="${signature.signature_data}" alt="Signature">
                </div>
                <div class="signature-details">
                    <div class="signed-by">
                        <strong>Signed by:</strong> ${this.escapeHtml(signature.signer_name || 'Unknown')}
                    </div>
                    <div class="signed-date">
                        <strong>Date:</strong> ${new Date(signature.signed_at).toLocaleString()}
                    </div>
                    ${signature.signer_email ? `
                        <div class="signed-email">
                            <strong>Email:</strong> ${this.escapeHtml(signature.signer_email)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Show signature dialog
     */
    showSignDialog(options = {}) {
        const { packetId, clientId, customerName, customerEmail, onSigned } = options;

        document.querySelector('.signature-dialog')?.remove();

        const dialog = document.createElement('div');
        dialog.className = 'signature-dialog';

        dialog.innerHTML = `
            <div class="dialog-backdrop"></div>
            <div class="dialog-content">
                <div class="dialog-header">
                    <h3>Sign Proposal</h3>
                    <button class="dialog-close">&times;</button>
                </div>
                <form class="signature-form" id="signatureForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Full Name</label>
                            <input type="text" name="signerName" class="form-input"
                                value="${customerName || ''}" required placeholder="Your full name">
                        </div>
                        <div class="form-group">
                            <label>Email</label>
                            <input type="email" name="signerEmail" class="form-input"
                                value="${customerEmail || ''}" placeholder="Your email (optional)">
                        </div>
                    </div>

                    <div id="signaturePadContainer"></div>

                    <div class="signature-agreement">
                        <label class="checkbox-label">
                            <input type="checkbox" name="agree" required>
                            I agree to the terms and conditions of this roofing proposal
                        </label>
                    </div>

                    <div class="dialog-actions">
                        <button type="button" class="btn btn-secondary dialog-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Sign & Submit</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(dialog);

        // Create signature pad
        const padContainer = dialog.querySelector('#signaturePadContainer');
        const signaturePad = this.createSignaturePad({ id: 'dialogSignatureCanvas' });
        padContainer.appendChild(signaturePad);

        // Close handlers
        dialog.querySelector('.dialog-backdrop').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.dialog-cancel').addEventListener('click', () => dialog.remove());

        // Submit
        dialog.querySelector('#signatureForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (this.isEmpty()) {
                alert('Please provide your signature');
                return;
            }

            const form = e.target;
            const submitBtn = form.querySelector('[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';

            try {
                const signature = await this.save({
                    packetId,
                    clientId,
                    signerName: form.signerName.value,
                    signerEmail: form.signerEmail.value
                });

                if (onSigned) onSigned(signature);
                dialog.remove();
            } catch (error) {
                alert('Failed to save signature: ' + error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign & Submit';
            }
        });
    },

    /**
     * Dispatch custom event
     */
    dispatchEvent(name, detail) {
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
    module.exports = Signature;
}
