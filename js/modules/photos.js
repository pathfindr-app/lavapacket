/**
 * LAVA Packet Builder - Photos Module
 * Handles photo upload, WebP compression, repositioning, and Supabase Storage
 */

const Photos = {
    photoData: {},
    photoPositions: {},
    photoZoom: {},
    positionStep: 10,
    zoomStep: 0.1,
    minZoom: 1,
    maxZoom: 2.5,
    maxImageSize: 1200,
    imageQuality: 0.8, // WebP quality
    useSupabase: false,

    init() {
        // Check if Supabase is available
        this.useSupabase = typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable();

        // Set up file inputs
        document.querySelectorAll('.photo-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const imgId = e.target.dataset.target || input.id.replace('Input', 'Img');
                this.handleFileSelect(e.target, imgId);
            });
        });

        // Also set up specific known inputs
        const inputMappings = {
            'aerialInput': 'aerialImg',
            'diagramInput': 'diagramImg',
            'ssInput1': 'ssImg1',
            'ssInput2': 'ssImg2',
            'mlInput1': 'mlImg1',
            'mlInput2': 'mlImg2',
            'aboutInput': 'aboutImg',
            'workInput1': 'workImg1',
            'workInput2': 'workImg2',
            'workInput3': 'workImg3',
            'workInput4': 'workImg4',
            'workInput5': 'workImg5',
            'workInput6': 'workImg6',
            'workInput7': 'workImg7'
        };

        Object.entries(inputMappings).forEach(([inputId, imgId]) => {
            const input = document.getElementById(inputId);
            if (input && !input.hasAttribute('data-initialized')) {
                input.setAttribute('data-initialized', 'true');
                input.addEventListener('change', (e) => {
                    this.handleFileSelect(e.target, imgId);
                });
            }
        });

        // Load saved data
        this.loadFromStorage();
    },

    handleFileSelect(input, imgId) {
        if (!input.files || !input.files[0]) return;

        const file = input.files[0];
        this.compressAndSetPhoto(file, imgId);
    },

    /**
     * Compress image to WebP and optionally upload to Supabase
     */
    compressAndSetPhoto(file, imgId) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Compress to WebP blob
                this.compressImageToBlob(img, async (blob) => {
                    if (this.useSupabase && typeof Storage !== 'undefined' && Storage.currentPacketId) {
                        // Upload to Supabase Storage
                        await this.uploadToSupabase(imgId, blob);
                    } else {
                        // Fall back to base64 for localStorage
                        const dataUrl = await this.blobToDataUrl(blob);
                        this.setPhoto(imgId, dataUrl);
                    }
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    /**
     * Compress image to WebP blob
     */
    compressImageToBlob(img, callback) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if larger than max size
        if (width > this.maxImageSize || height > this.maxImageSize) {
            if (width > height) {
                height = Math.round((height * this.maxImageSize) / width);
                width = this.maxImageSize;
            } else {
                width = Math.round((width * this.maxImageSize) / height);
                height = this.maxImageSize;
            }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Return WebP blob (better compression than JPEG)
        canvas.toBlob(callback, 'image/webp', this.imageQuality);
    },

    /**
     * Legacy compress function that returns data URL (for localStorage fallback)
     */
    compressImage(img) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > this.maxImageSize || height > this.maxImageSize) {
            if (width > height) {
                height = Math.round((height * this.maxImageSize) / width);
                width = this.maxImageSize;
            } else {
                width = Math.round((width * this.maxImageSize) / height);
                height = this.maxImageSize;
            }
        }

        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        // Try WebP first, fall back to JPEG if not supported
        const webp = canvas.toDataURL('image/webp', this.imageQuality);
        if (webp.startsWith('data:image/webp')) {
            return webp;
        }
        return canvas.toDataURL('image/jpeg', 0.7);
    },

    /**
     * Convert blob to data URL
     */
    blobToDataUrl(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    },

    /**
     * Upload photo to Supabase Storage
     */
    async uploadToSupabase(imgId, blob) {
        try {
            const packetId = Storage.currentPacketId;
            if (!packetId || packetId === 'default') {
                // Need to save packet first to get an ID
                await Storage.save();
            }

            const publicUrl = await SupabaseClient.uploadPhoto('packets', Storage.currentPacketId, imgId, blob);

            if (publicUrl) {
                // Save photo metadata
                await SupabaseClient.savePacketPhoto(
                    Storage.currentPacketId,
                    imgId,
                    `packets/${Storage.currentPacketId}/${imgId}.webp`,
                    this.getPosition(imgId),
                    this.getZoom(imgId)
                );

                // Update UI
                this.setPhotoFromUrl(imgId, publicUrl);
                Storage.showToast('Photo uploaded', 'success');
            } else {
                throw new Error('Upload failed');
            }
        } catch (e) {
            console.error('Failed to upload to Supabase:', e);
            // Fallback to local storage
            const dataUrl = await this.blobToDataUrl(blob);
            this.setPhoto(imgId, dataUrl);
        }
    },

    /**
     * Set photo from URL (for Supabase-loaded images)
     */
    setPhotoFromUrl(imgId, url) {
        const img = document.getElementById(imgId);
        if (!img) return;

        img.src = url;
        img.style.display = 'block';
        this.photoData[imgId] = url;

        // Hide placeholders
        if (imgId === 'aerialImg') {
            const placeholder = document.getElementById('aerialPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
        }
        if (imgId === 'diagramImg') {
            const placeholder = document.getElementById('diagramPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
        }
    },

    setPhoto(imgId, dataUrl) {
        const img = document.getElementById(imgId);
        if (!img) return;

        img.src = dataUrl;
        img.style.display = 'block';
        this.photoData[imgId] = dataUrl;

        // Hide placeholders
        if (imgId === 'aerialImg') {
            const placeholder = document.getElementById('aerialPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
        }
        if (imgId === 'diagramImg') {
            const placeholder = document.getElementById('diagramPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
        }

        // Trigger auto-save
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    getPhoto(imgId) {
        return this.photoData[imgId] || null;
    },

    getAllPhotos() {
        return { ...this.photoData };
    },

    setAllPhotos(photos) {
        Object.keys(photos).forEach(imgId => {
            const img = document.getElementById(imgId);
            if (img && photos[imgId]) {
                img.src = photos[imgId];
                img.style.display = 'block';
                this.photoData[imgId] = photos[imgId];

                // Hide placeholder if exists (for aerial/diagram)
                if (imgId === 'aerialImg') {
                    const placeholder = document.getElementById('aerialPlaceholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
                if (imgId === 'diagramImg') {
                    const placeholder = document.getElementById('diagramPlaceholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
            }
        });
    },

    // Photo repositioning
    movePhoto(imgId, direction) {
        const img = document.getElementById(imgId);
        if (!img) return;

        // Initialize position if not set
        if (!this.photoPositions[imgId]) {
            this.photoPositions[imgId] = { x: 50, y: 50 };
        }

        const pos = this.photoPositions[imgId];

        switch (direction) {
            case 'up':
                pos.y = Math.max(0, pos.y - this.positionStep);
                break;
            case 'down':
                pos.y = Math.min(100, pos.y + this.positionStep);
                break;
            case 'left':
                pos.x = Math.max(0, pos.x - this.positionStep);
                break;
            case 'right':
                pos.x = Math.min(100, pos.x + this.positionStep);
                break;
            case 'center':
                pos.x = 50;
                pos.y = 50;
                break;
        }

        img.style.objectPosition = `${pos.x}% ${pos.y}%`;

        // Trigger auto-save
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    setPosition(imgId, x, y) {
        const img = document.getElementById(imgId);
        if (!img) return;

        this.photoPositions[imgId] = { x, y };
        img.style.objectPosition = `${x}% ${y}%`;
    },

    getPosition(imgId) {
        return this.photoPositions[imgId] || { x: 50, y: 50 };
    },

    getAllPositions() {
        return { ...this.photoPositions };
    },

    setAllPositions(positions) {
        Object.keys(positions).forEach(imgId => {
            const img = document.getElementById(imgId);
            if (img && positions[imgId]) {
                const pos = positions[imgId];
                this.photoPositions[imgId] = pos;
                img.style.objectPosition = `${pos.x}% ${pos.y}%`;
            }
        });
    },

    // Photo zoom
    zoomPhoto(imgId, direction) {
        const img = document.getElementById(imgId);
        if (!img) return;

        // Initialize zoom if not set
        if (!this.photoZoom[imgId]) {
            this.photoZoom[imgId] = 1;
        }

        let zoom = this.photoZoom[imgId];

        if (direction === 'in') {
            zoom = Math.min(this.maxZoom, zoom + this.zoomStep);
        } else if (direction === 'out') {
            zoom = Math.max(this.minZoom, zoom - this.zoomStep);
        } else if (direction === 'reset') {
            zoom = 1;
        }

        this.photoZoom[imgId] = zoom;
        img.style.transform = zoom === 1 ? '' : `scale(${zoom})`;

        // Trigger auto-save
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    getZoom(imgId) {
        return this.photoZoom[imgId] || 1;
    },

    setZoom(imgId, level) {
        const img = document.getElementById(imgId);
        if (!img) return;

        this.photoZoom[imgId] = level;
        img.style.transform = level === 1 ? '' : `scale(${level})`;
    },

    getAllZoom() {
        return { ...this.photoZoom };
    },

    setAllZoom(zooms) {
        Object.keys(zooms).forEach(imgId => {
            const img = document.getElementById(imgId);
            if (img && zooms[imgId]) {
                const zoom = zooms[imgId];
                this.photoZoom[imgId] = zoom;
                img.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
            }
        });
    },

    loadFromStorage() {
        // This will be called by Storage.load()
    },

    // Trigger file input click
    triggerUpload(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.click();
        }
    },

    // Create upload button for an image
    createUploadButton(imgId, inputId) {
        const btn = document.createElement('button');
        btn.className = 'photo-upload-btn';
        btn.textContent = 'Change Photo';
        btn.onclick = () => this.triggerUpload(inputId);
        return btn;
    },

    // Create position controls for an image
    createPositionControls(imgId) {
        const controls = document.createElement('div');
        controls.className = 'photo-controls';
        controls.innerHTML = `
            <div class="pos-row"><button onclick="Photos.movePhoto('${imgId}','up')">↑</button></div>
            <div class="pos-row">
                <button onclick="Photos.movePhoto('${imgId}','left')">←</button>
                <button onclick="Photos.movePhoto('${imgId}','center')">•</button>
                <button onclick="Photos.movePhoto('${imgId}','right')">→</button>
            </div>
            <div class="pos-row"><button onclick="Photos.movePhoto('${imgId}','down')">↓</button></div>
        `;
        return controls;
    }
};

// Global function for inline event handlers
function changePhoto(input, imgId) {
    Photos.handleFileSelect(input, imgId);
}

function movePhoto(imgId, direction) {
    Photos.movePhoto(imgId, direction);
}

function zoomPhoto(imgId, direction) {
    Photos.zoomPhoto(imgId, direction);
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Photos;
}
