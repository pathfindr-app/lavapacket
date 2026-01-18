/**
 * LAVA Packet Builder - Estimate Module
 * Handles estimate image/PDF upload with WebP compression
 */

const Estimate = {
    estimateData: null,
    dropZone: null,
    previewContainer: null,
    maxImageSize: 1400, // Slightly larger for estimate readability
    imageQuality: 0.8,  // WebP quality

    init() {
        this.dropZone = document.getElementById('estimateDropzone');
        this.previewContainer = document.getElementById('estimatePreview');

        if (this.dropZone) {
            this.setupDropZone();
        }

        // Set up file input
        const input = document.getElementById('estimateInput');
        if (input) {
            input.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    },

    setupDropZone() {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight on drag over
        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.add('dragover');
            });
        });

        // Remove highlight on drag leave/drop
        ['dragleave', 'drop'].forEach(eventName => {
            this.dropZone.addEventListener(eventName, () => {
                this.dropZone.classList.remove('dragover');
            });
        });

        // Handle drop
        this.dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // Click to upload
        this.dropZone.addEventListener('click', () => {
            const input = document.getElementById('estimateInput');
            if (input) input.click();
        });
    },

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    },

    handleFile(file) {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];

        if (!validTypes.includes(file.type)) {
            this.showError('Please upload a PNG, JPG, WebP, or PDF file.');
            return;
        }

        if (file.type === 'application/pdf') {
            this.handlePDF(file);
        } else {
            this.handleImage(file);
        }
    },

    handleImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Compress image to WebP
            const img = new Image();
            img.onload = () => {
                const compressed = this.compressImage(img);
                this.setEstimate(compressed);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    /**
     * Compress image to WebP format
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

        // Try WebP first, fall back to JPEG
        const webp = canvas.toDataURL('image/webp', this.imageQuality);
        if (webp.startsWith('data:image/webp')) {
            return webp;
        }
        return canvas.toDataURL('image/jpeg', 0.75);
    },

    /**
     * Compress image to WebP blob (for Supabase upload)
     */
    compressImageToBlob(img, callback) {
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

        canvas.toBlob(callback, 'image/webp', this.imageQuality);
    },

    async handlePDF(file) {
        // Check if PDF.js is available
        if (typeof pdfjsLib === 'undefined') {
            // Load PDF.js dynamically
            await this.loadPDFJS();
        }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);

            const scale = 2; // Higher resolution
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Convert to WebP
            const webp = canvas.toDataURL('image/webp', this.imageQuality);
            if (webp.startsWith('data:image/webp')) {
                this.setEstimate(webp);
            } else {
                this.setEstimate(canvas.toDataURL('image/png'));
            }
        } catch (error) {
            console.error('Error processing PDF:', error);
            this.showError('Failed to process PDF. Please try an image instead.');
        }
    },

    async loadPDFJS() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    setEstimate(dataUrl) {
        this.estimateData = dataUrl;

        // Update preview in sidebar
        this.updatePreview();

        // Update proposal page
        this.updateProposalPage();

        // Save
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    updatePreview() {
        if (!this.previewContainer) return;

        if (this.estimateData) {
            this.previewContainer.innerHTML = `
                <img src="${this.estimateData}" alt="Estimate Preview">
                <button class="estimate-remove" onclick="Estimate.remove()">×</button>
            `;
            this.previewContainer.style.display = 'block';
        } else {
            this.previewContainer.innerHTML = '';
            this.previewContainer.style.display = 'none';
        }
    },

    updateProposalPage() {
        const proposalImg = document.getElementById('estimatePageImg');
        const placeholder = document.getElementById('estimatePlaceholder');

        if (this.estimateData) {
            if (proposalImg) {
                proposalImg.src = this.estimateData;
                proposalImg.style.display = 'block';
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        } else {
            if (proposalImg) {
                proposalImg.style.display = 'none';
            }
            if (placeholder) {
                placeholder.style.display = 'flex';
            }
        }
    },

    remove() {
        this.estimateData = null;
        this.updatePreview();
        this.updateProposalPage();

        // Save
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    getEstimateData() {
        return this.estimateData;
    },

    setEstimateData(data) {
        if (data) {
            this.estimateData = data;
            this.updatePreview();
            this.updateProposalPage();
        }
    },

    showError(message) {
        if (typeof Storage !== 'undefined' && Storage.showToast) {
            Storage.showToast(message, 'error');
        } else {
            alert(message);
        }
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Estimate;
}
