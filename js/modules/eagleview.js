/**
 * LAVA Packet Builder - EagleView Module
 * Handles EagleView report upload and AI extraction with WebP compression
 */

const EagleView = {
    apiKey: null,
    reportData: null,
    aerialImage: null,
    diagramImage: null,
    maxImageSize: 1200,
    imageQuality: 0.8, // WebP quality

    init() {
        // Load API key from localStorage
        this.apiKey = localStorage.getItem('openai_api_key') || null;

        // Set up drop zones
        this.setupDropZone('eagleviewDropzone', 'eagleviewInput');
        this.setupAerialDropZone();
        this.setupDiagramDropZone();

        // Set up API key input
        const keyInput = document.getElementById('openaiKeyInput');
        if (keyInput) {
            keyInput.value = this.apiKey || '';
            keyInput.addEventListener('change', (e) => {
                this.apiKey = e.target.value;
                localStorage.setItem('openai_api_key', this.apiKey);
                Storage.showToast('API key saved', 'success');
            });
        }
    },

    setupDropZone(dropzoneId, inputId) {
        const dropZone = document.getElementById(dropzoneId);
        const input = document.getElementById(inputId);

        if (!dropZone || !input) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight on drag over
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            });
        });

        // Remove highlight
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            });
        });

        // Handle drop
        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleReportUpload(files[0]);
            }
        });

        // Click to upload
        dropZone.addEventListener('click', () => input.click());

        // File input change
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleReportUpload(e.target.files[0]);
            }
        });
    },

    setupAerialDropZone() {
        const input = document.getElementById('aerialInput');
        const card = input ? input.closest('.ev-card') : null;
        if (!card) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            card.addEventListener(eventName, () => card.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, () => card.classList.remove('dragover'));
        });

        card.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleAerialUpload(files[0]);
            }
        });
    },

    setupDiagramDropZone() {
        const input = document.getElementById('diagramInput');
        const card = input ? input.closest('.ev-card') : null;
        if (!card) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            card.addEventListener(eventName, () => card.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            card.addEventListener(eventName, () => card.classList.remove('dragover'));
        });

        card.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleDiagramUpload(files[0]);
            }
        });
    },

    async handleReportUpload(file) {
        if (!this.apiKey) {
            Storage.showToast('Please enter your OpenAI API key first', 'error');
            return;
        }

        Storage.showToast('Analyzing EagleView report...', 'info');

        try {
            const base64 = await this.fileToBase64(file);
            const extractedData = await this.extractWithAI(base64, file.type);

            if (extractedData) {
                this.populateFields(extractedData);
                Storage.showToast('Data extracted successfully!', 'success');
            }
        } catch (error) {
            console.error('Error processing EagleView:', error);
            Storage.showToast('Failed to extract data: ' + error.message, 'error');
        }
    },

    async handleAerialUpload(file) {
        // Compress image to WebP
        const compressed = await this.compressFile(file);
        this.aerialImage = compressed;

        const img = document.getElementById('aerialImg');
        const placeholder = document.getElementById('aerialPlaceholder');

        if (img) {
            img.src = compressed;
            img.style.display = 'block';
            if (typeof Photos !== 'undefined') {
                Photos.photoData['aerialImg'] = compressed;
            }
        }
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        Storage.showToast('Aerial image uploaded', 'success');
        Storage.save();
    },

    async handleDiagramUpload(file) {
        // Compress image to WebP
        const compressed = await this.compressFile(file);
        this.diagramImage = compressed;

        const img = document.getElementById('diagramImg');
        const placeholder = document.getElementById('diagramPlaceholder');

        if (img) {
            img.src = compressed;
            img.style.display = 'block';
            if (typeof Photos !== 'undefined') {
                Photos.photoData['diagramImg'] = compressed;
            }
        }
        if (placeholder) {
            placeholder.style.display = 'none';
        }

        Storage.showToast('Diagram image uploaded', 'success');
        Storage.save();
    },

    /**
     * Compress file to WebP format
     */
    compressFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
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
                        resolve(webp);
                    } else {
                        resolve(canvas.toDataURL('image/jpeg', 0.7));
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    /**
     * Compress file to WebP blob (for Supabase upload)
     */
    compressFileToBlob(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
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

                    canvas.toBlob(resolve, 'image/webp', this.imageQuality);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    async extractWithAI(base64Image, mimeType) {
        const prompt = `Analyze this EagleView roof report image and extract the following information. Return ONLY a JSON object with these exact keys (use null if not found):

{
    "totalRoofArea": "total roof area in sq ft (e.g., '2,847 sq ft')",
    "roofFacets": "number of roof facets (e.g., '12 facets')",
    "predominantPitch": "main roof pitch (e.g., '4/12')",
    "ridgesHips": "total ridges and hips length (e.g., '245 ft')",
    "valleys": "total valleys length if shown",
    "eaves": "total eaves length if shown",
    "rakes": "total rakes length if shown",
    "flashings": "flashing details if shown",
    "propertyAddress": "property address if visible",
    "reportDate": "report date if visible"
}

Only return the JSON object, no other text.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: base64Image,
                                    detail: 'high'
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Parse JSON from response
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse AI response:', content);
            throw new Error('Could not parse extracted data');
        }
    },

    populateFields(data) {
        this.reportData = data;

        // Map extracted data to form fields
        const fieldMap = {
            'roofArea': data.totalRoofArea,
            'roofFacets': data.roofFacets,
            'pitch': data.predominantPitch,
            'ridgesHips': data.ridgesHips,
            'customerAddress': data.propertyAddress
        };

        // Update editable fields
        Object.entries(fieldMap).forEach(([field, value]) => {
            if (value) {
                const elements = document.querySelectorAll(`[data-field="${field}"]`);
                elements.forEach(el => {
                    el.textContent = value;
                });

                // Also update sidebar inputs if they exist
                const input = document.querySelector(`.customer-input[data-field="${field}"]`);
                if (input) {
                    input.value = value;
                }
            }
        });

        // Update the address input specifically
        if (data.propertyAddress) {
            const addressInput = document.getElementById('customerAddressInput');
            if (addressInput) {
                addressInput.value = data.propertyAddress;
                // Trigger input event to sync with editable fields
                addressInput.dispatchEvent(new Event('input'));
            }
        }

        // Store for later
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    getReportData() {
        return {
            reportData: this.reportData,
            aerialImage: this.aerialImage,
            diagramImage: this.diagramImage
        };
    },

    setReportData(data) {
        if (!data) return;

        this.reportData = data.reportData || null;

        // Restore aerial image
        if (data.aerialImage) {
            this.aerialImage = data.aerialImage;
            const img = document.getElementById('aerialImg');
            const placeholder = document.getElementById('aerialPlaceholder');
            if (img) {
                img.src = data.aerialImage;
                img.style.display = 'block';
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }

        // Restore diagram image
        if (data.diagramImage) {
            this.diagramImage = data.diagramImage;
            const img = document.getElementById('diagramImg');
            const placeholder = document.getElementById('diagramPlaceholder');
            if (img) {
                img.src = data.diagramImage;
                img.style.display = 'block';
            }
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EagleView;
}
