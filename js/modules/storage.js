/**
 * LAVA Packet Builder - Storage Module
 * Handles saving and loading packet data to Supabase (with localStorage fallback)
 */

const Storage = {
    packetKey: 'lavaPacketBuilder',
    currentPacketId: null,
    useSupabase: false,

    init(packetId = null) {
        // Check if Supabase is available
        this.useSupabase = typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable();

        // Get packet ID from URL, localStorage fallback, or use provided/default
        if (!packetId) {
            const urlParams = new URLSearchParams(window.location.search);
            packetId = urlParams.get('id') || localStorage.getItem('lava_current_packet_id') || 'default';
            console.log('[Storage] init() - URL id:', urlParams.get('id'), 'localStorage id:', localStorage.getItem('lava_current_packet_id'), 'using:', packetId);
        }

        this.currentPacketId = packetId;
        this.load();
    },

    getStorageKey() {
        return `${this.packetKey}_${this.currentPacketId}`;
    },

    async save() {
        const data = this.collectData();
        console.log('[Storage] save() called, useSupabase:', this.useSupabase, 'currentPacketId:', this.currentPacketId);
        console.log('[Storage] collected data:', JSON.stringify(data, null, 2).substring(0, 500));

        if (this.useSupabase) {
            return await this.saveToSupabase(data);
        } else {
            return this.saveToLocalStorage(data);
        }
    },

    collectData() {
        return {
            id: this.currentPacketId !== 'default' ? this.currentPacketId : null,
            customer_name: document.getElementById('customerNameInput')?.value || '',
            customer_address: document.getElementById('customerAddressInput')?.value || '',
            product_type: document.querySelector('input[name="product"]:checked')?.value || 'standing-seam',
            fields: typeof Editor !== 'undefined' ? Editor.getAllFields() : {},
            config: this.getConfig(),
            // Note: photos are handled separately when using Supabase
            photos: typeof Photos !== 'undefined' ? Photos.getAllPhotos() : {},
            photoPositions: typeof Photos !== 'undefined' ? Photos.getAllPositions() : {},
            photoZoom: typeof Photos !== 'undefined' ? Photos.getAllZoom() : {},
            estimate: typeof Estimate !== 'undefined' ? Estimate.getEstimateData() : null,
            eagleview: typeof EagleView !== 'undefined' ? EagleView.getReportData() : null
        };
    },

    async saveToSupabase(data) {
        try {
            // Prepare packet data for Supabase (JSONB fields)
            const packetData = {
                id: data.id,
                customer_name: data.customer_name,
                customer_address: data.customer_address,
                product_type: data.product_type,
                fields: data.fields,
                config: {
                    ...data.config,
                    photos: data.photos,
                    photoPositions: data.photoPositions,
                    photoZoom: data.photoZoom,
                    estimate: data.estimate,
                    eagleview: data.eagleview
                }
            };

            console.log('[Storage] saveToSupabase() packetData:', JSON.stringify(packetData, null, 2).substring(0, 500));
            const result = await SupabaseClient.savePacket(packetData);
            console.log('[Storage] saveToSupabase() result:', result);

            if (result) {
                // Update current packet ID if it was a new packet
                if (!data.id && result.id) {
                    this.currentPacketId = result.id;
                    // Save to localStorage as fallback
                    localStorage.setItem('lava_current_packet_id', result.id);
                    // Update URL without reloading
                    const newUrl = new URL(window.location);
                    newUrl.searchParams.set('id', result.id);
                    window.history.replaceState({}, '', newUrl);
                    console.log('[Storage] New packet created! ID:', result.id, 'URL updated to:', newUrl.toString());
                }

                console.log('[Storage] Packet saved to Supabase:', this.currentPacketId);
                this.showToast('Saved', 'success');
                return true;
            } else {
                throw new Error('Save returned null');
            }
        } catch (e) {
            console.error('Failed to save to Supabase:', e);
            // Fallback to localStorage
            return this.saveToLocalStorage(data);
        }
    },

    saveToLocalStorage(data) {
        const localData = {
            ...data,
            id: this.currentPacketId,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(localData));
            console.log('Packet saved to localStorage:', this.currentPacketId);
            this.showToast('Saved', 'success');
            return true;
        } catch (e) {
            console.error('Failed to save:', e);
            this.showToast('Failed to save: ' + e.message, 'error');
            return false;
        }
    },

    async load() {
        console.log('[Storage] load() called - useSupabase:', this.useSupabase, 'currentPacketId:', this.currentPacketId);
        if (this.useSupabase && this.currentPacketId !== 'default') {
            return await this.loadFromSupabase();
        } else {
            console.log('[Storage] Using localStorage fallback');
            return this.loadFromLocalStorage();
        }
    },

    async loadFromSupabase() {
        try {
            console.log('[Storage] loadFromSupabase() - fetching packet:', this.currentPacketId);
            const data = await SupabaseClient.getPacket(this.currentPacketId);
            console.log('[Storage] loadFromSupabase() - received data:', data ? 'yes' : 'null', data ? `name: ${data.customer_name}` : '');

            if (!data) {
                console.log('[Storage] No saved data in Supabase for:', this.currentPacketId);
                return false;
            }

            console.log('[Storage] Loading packet from Supabase:', this.currentPacketId, 'customer_name:', data.customer_name);

            // Set customer info
            const nameInput = document.getElementById('customerNameInput');
            const addressInput = document.getElementById('customerAddressInput');

            console.log('[Storage] Setting customer name input to:', data.customer_name);
            console.log('[Storage] nameInput element found:', !!nameInput);

            if (nameInput) nameInput.value = data.customer_name || '';
            if (addressInput) addressInput.value = data.customer_address || '';

            console.log('[Storage] After setting - nameInput.value:', nameInput?.value);

            // Trigger input events to sync with preview
            if (nameInput) nameInput.dispatchEvent(new Event('input'));
            if (addressInput) addressInput.dispatchEvent(new Event('input'));

            // Restore fields
            if (data.fields && typeof Editor !== 'undefined') {
                Editor.setAllFields(data.fields);
            }

            // Restore config (includes photo positions, zoom, estimate, eagleview)
            if (data.config) {
                this.setConfig(data.config);

                // Restore photos from config (base64 data)
                if (data.config.photos && typeof Photos !== 'undefined') {
                    console.log('[Storage] Restoring photos from config:', Object.keys(data.config.photos));
                    Photos.setAllPhotos(data.config.photos);
                }

                // Restore photo positions
                if (data.config.photoPositions && typeof Photos !== 'undefined') {
                    Photos.setAllPositions(data.config.photoPositions);
                }

                // Restore photo zoom
                if (data.config.photoZoom && typeof Photos !== 'undefined') {
                    Photos.setAllZoom(data.config.photoZoom);
                }

                // Restore estimate
                if (data.config.estimate && typeof Estimate !== 'undefined') {
                    Estimate.setEstimateData(data.config.estimate);
                }

                // Restore eagleview
                if (data.config.eagleview && typeof EagleView !== 'undefined') {
                    EagleView.setReportData(data.config.eagleview);
                }
            }

            // Also try loading photos from Supabase storage (fallback)
            if (data.photos && data.photos.length > 0) {
                this.loadPhotosFromSupabase(data.photos);
            }

            return true;
        } catch (e) {
            console.error('Failed to load from Supabase:', e);
            // Fallback to localStorage
            return this.loadFromLocalStorage();
        }
    },

    loadPhotosFromSupabase(photos) {
        if (typeof Photos === 'undefined') return;

        photos.forEach(photo => {
            const img = document.getElementById(photo.slot_id);
            if (img && photo.storage_path) {
                // Get public URL
                const publicUrl = SupabaseClient.client.storage
                    .from('photos')
                    .getPublicUrl(photo.storage_path).data.publicUrl;

                img.src = publicUrl;
                img.style.display = 'block';
                Photos.photoData[photo.slot_id] = publicUrl;

                // Apply position and zoom
                if (photo.position) {
                    Photos.setPosition(photo.slot_id, photo.position.x, photo.position.y);
                }
                if (photo.zoom) {
                    Photos.setZoom(photo.slot_id, photo.zoom);
                }

                // Hide placeholder if exists
                if (photo.slot_id === 'aerialImg') {
                    const placeholder = document.getElementById('aerialPlaceholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
                if (photo.slot_id === 'diagramImg') {
                    const placeholder = document.getElementById('diagramPlaceholder');
                    if (placeholder) placeholder.style.display = 'none';
                }
            }
        });
    },

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(this.getStorageKey());
            if (!saved) {
                console.log('No saved data for:', this.currentPacketId);
                return false;
            }

            const data = JSON.parse(saved);
            console.log('Loading packet from localStorage:', this.currentPacketId);

            // Set customer info
            const nameInput = document.getElementById('customerNameInput');
            const addressInput = document.getElementById('customerAddressInput');
            if (nameInput && data.customer_name) nameInput.value = data.customer_name;
            if (addressInput && data.customer_address) addressInput.value = data.customer_address;

            // Trigger input events
            if (nameInput) nameInput.dispatchEvent(new Event('input'));
            if (addressInput) addressInput.dispatchEvent(new Event('input'));

            // Restore fields
            if (data.fields && typeof Editor !== 'undefined') {
                Editor.setAllFields(data.fields);
            }

            // Restore photos
            if (data.photos && typeof Photos !== 'undefined') {
                Photos.setAllPhotos(data.photos);
            }

            // Restore photo positions
            if (data.photoPositions && typeof Photos !== 'undefined') {
                Photos.setAllPositions(data.photoPositions);
            }

            // Restore photo zoom
            if (data.photoZoom && typeof Photos !== 'undefined') {
                Photos.setAllZoom(data.photoZoom);
            }

            // Restore estimate
            if (data.estimate && typeof Estimate !== 'undefined') {
                Estimate.setEstimateData(data.estimate);
            }

            // Restore config
            if (data.config) {
                this.setConfig(data.config);
            }

            return true;
        } catch (e) {
            console.error('Failed to load:', e);
            return false;
        }
    },

    getConfig() {
        return {
            productType: document.querySelector('input[name="product"]:checked')?.value || 'standing-seam',
            enabledPages: this.getEnabledPages()
        };
    },

    setConfig(config) {
        // Set product type
        if (config.productType) {
            const radio = document.querySelector(`input[name="product"][value="${config.productType}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change'));
            }
        }

        // Set enabled pages
        if (config.enabledPages) {
            this.setEnabledPages(config.enabledPages);
        }
    },

    getEnabledPages() {
        const pages = {};
        document.querySelectorAll('.page-toggle input[type="checkbox"]').forEach(cb => {
            pages[cb.dataset.page] = cb.checked;
        });
        return pages;
    },

    setEnabledPages(pages) {
        Object.keys(pages).forEach(pageId => {
            const cb = document.querySelector(`.page-toggle input[data-page="${pageId}"]`);
            if (cb) {
                cb.checked = pages[pageId];
                cb.dispatchEvent(new Event('change'));
            }
        });
    },

    async clear() {
        if (this.useSupabase && this.currentPacketId !== 'default') {
            try {
                await SupabaseClient.deletePacket(this.currentPacketId);
            } catch (e) {
                console.error('Failed to delete from Supabase:', e);
            }
        }
        localStorage.removeItem(this.getStorageKey());
        this.showToast('Data cleared', 'success');
    },

    export() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            packet: this.collectData()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lava-packet-${this.currentPacketId}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    import(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.packet) {
                        // Save to localStorage first
                        localStorage.setItem(this.getStorageKey(), JSON.stringify(data.packet));
                        this.loadFromLocalStorage();
                        this.showToast('Imported successfully', 'success');
                        resolve(data);
                    } else {
                        reject(new Error('Invalid packet file'));
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    async listPackets() {
        // Try Supabase first
        if (this.useSupabase) {
            try {
                const packets = await SupabaseClient.listPackets();
                if (packets.length > 0) {
                    return packets.map(p => ({
                        id: p.id,
                        timestamp: new Date(p.updated_at).getTime(),
                        customerName: p.customer_name || 'Unnamed',
                        customerAddress: p.customer_address || '',
                        productType: p.product_type,
                        source: 'supabase'
                    }));
                }
            } catch (e) {
                console.error('Failed to list packets from Supabase:', e);
            }
        }

        // Fallback to localStorage
        const packets = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.packetKey + '_')) {
                const id = key.replace(this.packetKey + '_', '');
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    packets.push({
                        id,
                        timestamp: data.timestamp,
                        customerName: data.customer_name || data.fields?.customerName || 'Unnamed',
                        customerAddress: data.customer_address || data.fields?.customerAddress || '',
                        productType: data.product_type || data.config?.productType,
                        source: 'local'
                    });
                } catch (e) {
                    // Skip invalid entries
                }
            }
        }
        return packets.sort((a, b) => b.timestamp - a.timestamp);
    },

    showToast(message, type = 'info') {
        // Create toast container if it doesn't exist
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
