/**
 * LAVA Portal - Media Upload Module
 * Reusable component for uploading images, videos, and documents
 * Images are auto-compressed to WebP
 */

const Media = {
    maxImageSize: 1200,
    imageQuality: 0.8,
    maxFileSize: 50 * 1024 * 1024, // 50MB for Supabase free tier
    LAST_ADDRESS_KEY: 'lava_media_last_address',

    /**
     * Get the last used address from localStorage
     */
    getLastAddress() {
        return localStorage.getItem(this.LAST_ADDRESS_KEY) || '';
    },

    /**
     * Save the last used address to localStorage
     */
    setLastAddress(address) {
        if (address && address.trim()) {
            localStorage.setItem(this.LAST_ADDRESS_KEY, address.trim());
        }
    },

    /**
     * Upload a file to Supabase Storage and record in media table
     * @param {File} file - The file to upload
     * @param {Object} options - Upload options
     * @param {string} options.address - REQUIRED: Job site address for organization
     * @param {string} options.linkedType - 'packet', 'inspection', 'repair', 'general'
     * @param {string} options.linkedId - UUID of linked record (optional for 'general')
     * @param {string} options.slot - Slot identifier like 'aerial', 'ssImg1', etc.
     * @param {string} options.caption - Optional caption
     * @param {string[]} options.tags - Optional tags for AI search
     * @returns {Promise<Object>} - The created media record
     */
    async upload(file, options = {}) {
        const { address, linkedType = 'general', linkedId = null, slot = null, caption = '', tags = [] } = options;

        // Address is required for organization
        if (!address || !address.trim()) {
            throw new Error('Address is required for media uploads');
        }

        // Save address for "use last" feature
        this.setLastAddress(address);

        // Validate file size
        if (file.size > this.maxFileSize) {
            throw new Error(`File too large. Max size is ${this.maxFileSize / 1024 / 1024}MB`);
        }

        // Determine file type
        const fileType = this.getFileType(file);
        let uploadBlob = file;
        let mimeType = file.type;
        let filename = file.name;

        // Compress images to WebP
        if (fileType === 'image') {
            uploadBlob = await this.compressToWebP(file);
            mimeType = 'image/webp';
            filename = filename.replace(/\.[^.]+$/, '.webp');
        }

        // Generate storage path
        const ext = filename.split('.').pop();
        const storagePath = this.generatePath(linkedType, linkedId, slot, ext);

        // Upload to Supabase Storage
        const { data: storageData, error: storageError } = await SupabaseClient.client
            .storage
            .from('media')
            .upload(storagePath, uploadBlob, {
                contentType: mimeType,
                upsert: true
            });

        if (storageError) {
            throw new Error(`Upload failed: ${storageError.message}`);
        }

        // Get public URL
        const { data: { publicUrl } } = SupabaseClient.client
            .storage
            .from('media')
            .getPublicUrl(storagePath);

        // Record in media table
        const mediaRecord = {
            storage_path: storagePath,
            public_url: publicUrl,
            filename: filename,
            file_type: fileType,
            mime_type: mimeType,
            size_bytes: uploadBlob.size || file.size,
            linked_type: linkedType,
            linked_id: linkedId,
            slot: slot,
            caption: caption,
            tags: tags,
            address: address.trim()
        };

        const { data, error } = await SupabaseClient.client
            .from('media')
            .insert(mediaRecord)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to save media record: ${error.message}`);
        }

        return data;
    },

    /**
     * Upload multiple files
     */
    async uploadMultiple(files, options = {}) {
        const results = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const slotOptions = {
                ...options,
                slot: options.slot ? `${options.slot}${i + 1}` : `file${i + 1}`
            };
            const result = await this.upload(file, slotOptions);
            results.push(result);
        }
        return results;
    },

    /**
     * Get media for a linked record
     */
    async getForRecord(linkedType, linkedId) {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .select('*')
            .eq('linked_type', linkedType)
            .eq('linked_id', linkedId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
    },

    /**
     * Get media by slot
     */
    async getBySlot(linkedType, linkedId, slot) {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .select('*')
            .eq('linked_type', linkedType)
            .eq('linked_id', linkedId)
            .eq('slot', slot)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    /**
     * Search media by tags (for AI assistant)
     */
    async searchByTags(tags) {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .select('*')
            .overlaps('tags', tags)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return data || [];
    },

    /**
     * Search media by filename, caption, or address
     */
    async search(query) {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .select('*')
            .or(`filename.ilike.%${query}%,caption.ilike.%${query}%,address.ilike.%${query}%`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return data || [];
    },

    /**
     * Get all media for a specific address
     */
    async getByAddress(address) {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .select('*')
            .ilike('address', `%${address}%`)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Get unique addresses (for filtering/grouping)
     */
    async getUniqueAddresses() {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .select('address')
            .not('address', 'is', null)
            .order('address');

        if (error) throw error;

        // Extract unique addresses
        const addresses = [...new Set(data.map(d => d.address).filter(Boolean))];
        return addresses;
    },

    /**
     * Delete media
     */
    async delete(mediaId) {
        // Get record first to get storage path
        const { data: record, error: fetchError } = await SupabaseClient.client
            .from('media')
            .select('storage_path')
            .eq('id', mediaId)
            .single();

        if (fetchError) throw fetchError;

        // Delete from storage
        const { error: storageError } = await SupabaseClient.client
            .storage
            .from('media')
            .remove([record.storage_path]);

        if (storageError) {
            console.warn('Storage delete failed:', storageError);
        }

        // Delete from table
        const { error } = await SupabaseClient.client
            .from('media')
            .delete()
            .eq('id', mediaId);

        if (error) throw error;
    },

    /**
     * Update media metadata (caption, tags, position)
     */
    async update(mediaId, updates) {
        const { data, error } = await SupabaseClient.client
            .from('media')
            .update(updates)
            .eq('id', mediaId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Compress image to WebP
     */
    compressToWebP(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Resize if too large
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

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                // Fallback to JPEG if WebP not supported
                                canvas.toBlob(resolve, 'image/jpeg', 0.8);
                            }
                        },
                        'image/webp',
                        this.imageQuality
                    );
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * Get file type category
     */
    getFileType(file) {
        const mime = file.type.toLowerCase();
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('video/')) return 'video';
        return 'document';
    },

    /**
     * Generate storage path
     */
    generatePath(linkedType, linkedId, slot, ext) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);

        if (linkedId) {
            return `${linkedType}/${linkedId}/${slot || timestamp}-${random}.${ext}`;
        }
        return `${linkedType}/${timestamp}-${random}.${ext}`;
    },

    /**
     * Create a drop zone for uploading
     * @param {HTMLElement} element - The drop zone element
     * @param {Object} options - Upload options (same as upload())
     * @param {Function} onUpload - Callback when upload completes
     */
    createDropZone(element, options = {}, onUpload = () => {}) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
            element.addEventListener(event, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // Highlight on drag
        ['dragenter', 'dragover'].forEach(event => {
            element.addEventListener(event, () => element.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(event => {
            element.addEventListener(event, () => element.classList.remove('dragover'));
        });

        // Handle drop
        element.addEventListener('drop', async (e) => {
            const files = e.dataTransfer.files;
            if (files.length === 0) return;

            element.classList.add('uploading');
            try {
                if (files.length === 1) {
                    const result = await this.upload(files[0], options);
                    onUpload(result, null);
                } else {
                    const results = await this.uploadMultiple(files, options);
                    onUpload(results, null);
                }
            } catch (error) {
                onUpload(null, error);
            } finally {
                element.classList.remove('uploading');
            }
        });

        // Also handle click to upload
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = options.multiple !== false;
        input.accept = options.accept || '*/*';
        input.style.display = 'none';
        element.appendChild(input);

        element.addEventListener('click', () => input.click());

        input.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (files.length === 0) return;

            element.classList.add('uploading');
            try {
                if (files.length === 1) {
                    const result = await this.upload(files[0], options);
                    onUpload(result, null);
                } else {
                    const results = await this.uploadMultiple(files, options);
                    onUpload(results, null);
                }
            } catch (error) {
                onUpload(null, error);
            } finally {
                element.classList.remove('uploading');
                input.value = '';
            }
        });

        return input;
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Media;
}
