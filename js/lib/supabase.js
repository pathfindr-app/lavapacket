/**
 * LAVA Roofing Portal - Supabase Client
 * Handles Supabase initialization and provides database/storage utilities
 */

const SupabaseClient = {
    client: null,
    initialized: false,

    // Configuration - these will be set from environment or config
    config: {
        url: window.SUPABASE_URL || '',
        anonKey: window.SUPABASE_ANON_KEY || ''
    },

    /**
     * Initialize the Supabase client
     */
    init() {
        if (this.initialized) return this.client;

        // Try to get config from meta tags if not in window
        if (!this.config.url) {
            const urlMeta = document.querySelector('meta[name="supabase-url"]');
            if (urlMeta) this.config.url = urlMeta.content;
        }
        if (!this.config.anonKey) {
            const keyMeta = document.querySelector('meta[name="supabase-anon-key"]');
            if (keyMeta) this.config.anonKey = keyMeta.content;
        }

        if (!this.config.url || !this.config.anonKey) {
            console.warn('Supabase not configured. Using localStorage fallback.');
            return null;
        }

        try {
            this.client = supabase.createClient(this.config.url, this.config.anonKey);
            this.initialized = true;
            console.log('Supabase client initialized');
            return this.client;
        } catch (e) {
            console.error('Failed to initialize Supabase:', e);
            return null;
        }
    },

    /**
     * Check if Supabase is available
     */
    isAvailable() {
        return this.initialized && this.client !== null;
    },

    /**
     * Get the Supabase client instance
     */
    getClient() {
        if (!this.initialized) this.init();
        return this.client;
    },

    // ==================== AUTH HELPERS ====================

    /**
     * Check password against settings table
     */
    async checkPassword(password) {
        if (!this.isAvailable()) {
            // Fallback to hardcoded password
            return password === 'lavaroofing';
        }

        try {
            const { data, error } = await this.client
                .from('settings')
                .select('value')
                .eq('key', 'app_password')
                .single();

            if (error) throw error;
            return data && data.value === password;
        } catch (e) {
            console.error('Password check failed:', e);
            // Fallback to hardcoded password
            return password === 'lavaroofing';
        }
    },

    // ==================== PACKETS ====================

    /**
     * List all packets
     */
    async listPackets() {
        if (!this.isAvailable()) return [];

        try {
            const { data, error } = await this.client
                .from('packets')
                .select('id, customer_name, customer_address, product_type, created_at, updated_at')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('Failed to list packets:', e);
            return [];
        }
    },

    /**
     * Get a single packet by ID
     */
    async getPacket(id) {
        if (!this.isAvailable()) return null;

        try {
            const { data, error } = await this.client
                .from('packets')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            // Also get photos
            if (data) {
                const { data: photos, error: photosError } = await this.client
                    .from('packet_photos')
                    .select('*')
                    .eq('packet_id', id);

                if (!photosError) {
                    data.photos = photos || [];
                }
            }

            return data;
        } catch (e) {
            console.error('Failed to get packet:', e);
            return null;
        }
    },

    /**
     * Save a packet (create or update)
     */
    async savePacket(packetData) {
        if (!this.isAvailable()) return null;

        try {
            const { id, photos, ...data } = packetData;
            const now = new Date().toISOString();

            let result;
            if (id) {
                // Update existing
                const { data: updated, error } = await this.client
                    .from('packets')
                    .update({ ...data, updated_at: now })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                result = updated;
            } else {
                // Create new
                const { data: created, error } = await this.client
                    .from('packets')
                    .insert({ ...data, created_at: now, updated_at: now })
                    .select()
                    .single();

                if (error) throw error;
                result = created;
            }

            return result;
        } catch (e) {
            console.error('Failed to save packet:', e);
            return null;
        }
    },

    /**
     * Delete a packet
     */
    async deletePacket(id) {
        if (!this.isAvailable()) return false;

        try {
            // Delete photos from storage first
            await this.deletePacketPhotos(id);

            // Delete packet (photos table has ON DELETE CASCADE)
            const { error } = await this.client
                .from('packets')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Failed to delete packet:', e);
            return false;
        }
    },

    // ==================== INSPECTIONS ====================

    /**
     * List all inspections
     */
    async listInspections() {
        if (!this.isAvailable()) return [];

        try {
            const { data, error } = await this.client
                .from('inspections')
                .select('id, customer_name, customer_address, inspection_date, status, created_at, updated_at')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('Failed to list inspections:', e);
            return [];
        }
    },

    /**
     * Get a single inspection by ID
     */
    async getInspection(id) {
        if (!this.isAvailable()) return null;

        try {
            const { data, error } = await this.client
                .from('inspections')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            // Also get photos
            if (data) {
                const { data: photos, error: photosError } = await this.client
                    .from('inspection_photos')
                    .select('*')
                    .eq('inspection_id', id);

                if (!photosError) {
                    data.photos = photos || [];
                }
            }

            return data;
        } catch (e) {
            console.error('Failed to get inspection:', e);
            return null;
        }
    },

    /**
     * Save an inspection (create or update)
     */
    async saveInspection(inspectionData) {
        if (!this.isAvailable()) return null;

        try {
            const { id, photos, ...data } = inspectionData;
            const now = new Date().toISOString();

            let result;
            if (id) {
                // Update existing
                const { data: updated, error } = await this.client
                    .from('inspections')
                    .update({ ...data, updated_at: now })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                result = updated;
            } else {
                // Create new
                const { data: created, error } = await this.client
                    .from('inspections')
                    .insert({ ...data, created_at: now, updated_at: now })
                    .select()
                    .single();

                if (error) throw error;
                result = created;
            }

            return result;
        } catch (e) {
            console.error('Failed to save inspection:', e);
            return null;
        }
    },

    /**
     * Delete an inspection
     */
    async deleteInspection(id) {
        if (!this.isAvailable()) return false;

        try {
            // Delete photos from storage first
            await this.deleteInspectionPhotos(id);

            // Delete inspection (photos table has ON DELETE CASCADE)
            const { error } = await this.client
                .from('inspections')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Failed to delete inspection:', e);
            return false;
        }
    },

    // ==================== STORAGE (Photos) ====================

    /**
     * Upload a photo to Supabase Storage
     * @param {string} bucket - 'packets' or 'inspections'
     * @param {string} entityId - The packet or inspection ID
     * @param {string} slotId - The slot identifier (e.g., 'ssImg1', 'overview')
     * @param {Blob} blob - The image blob (should be WebP)
     * @returns {string|null} Public URL or null on failure
     */
    async uploadPhoto(bucket, entityId, slotId, blob) {
        if (!this.isAvailable()) return null;

        try {
            const path = `${bucket}/${entityId}/${slotId}.webp`;

            const { data, error } = await this.client.storage
                .from('photos')
                .upload(path, blob, {
                    contentType: 'image/webp',
                    upsert: true
                });

            if (error) throw error;

            // Get public URL
            const { data: urlData } = this.client.storage
                .from('photos')
                .getPublicUrl(path);

            return urlData.publicUrl;
        } catch (e) {
            console.error('Failed to upload photo:', e);
            return null;
        }
    },

    /**
     * Delete a photo from storage
     */
    async deletePhoto(bucket, entityId, slotId) {
        if (!this.isAvailable()) return false;

        try {
            const path = `${bucket}/${entityId}/${slotId}.webp`;
            const { error } = await this.client.storage
                .from('photos')
                .remove([path]);

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Failed to delete photo:', e);
            return false;
        }
    },

    /**
     * Delete all photos for a packet
     */
    async deletePacketPhotos(packetId) {
        if (!this.isAvailable()) return;

        try {
            const { data: list } = await this.client.storage
                .from('photos')
                .list(`packets/${packetId}`);

            if (list && list.length > 0) {
                const paths = list.map(f => `packets/${packetId}/${f.name}`);
                await this.client.storage.from('photos').remove(paths);
            }
        } catch (e) {
            console.error('Failed to delete packet photos:', e);
        }
    },

    /**
     * Delete all photos for an inspection
     */
    async deleteInspectionPhotos(inspectionId) {
        if (!this.isAvailable()) return;

        try {
            const { data: list } = await this.client.storage
                .from('photos')
                .list(`inspections/${inspectionId}`);

            if (list && list.length > 0) {
                const paths = list.map(f => `inspections/${inspectionId}/${f.name}`);
                await this.client.storage.from('photos').remove(paths);
            }
        } catch (e) {
            console.error('Failed to delete inspection photos:', e);
        }
    },

    /**
     * Save photo metadata to database
     */
    async savePacketPhoto(packetId, slotId, storagePath, position = { x: 50, y: 50 }, zoom = 1) {
        if (!this.isAvailable()) return null;

        try {
            const { data, error } = await this.client
                .from('packet_photos')
                .upsert({
                    packet_id: packetId,
                    slot_id: slotId,
                    storage_path: storagePath,
                    position: position,
                    zoom: zoom
                }, {
                    onConflict: 'packet_id,slot_id'
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('Failed to save packet photo:', e);
            return null;
        }
    },

    /**
     * Save inspection photo metadata to database
     */
    async saveInspectionPhoto(inspectionId, category, storagePath, caption = '') {
        if (!this.isAvailable()) return null;

        try {
            const { data, error } = await this.client
                .from('inspection_photos')
                .insert({
                    inspection_id: inspectionId,
                    category: category,
                    storage_path: storagePath,
                    caption: caption
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('Failed to save inspection photo:', e);
            return null;
        }
    },

    // ==================== UTILITIES ====================

    /**
     * Get recent activity (packets + inspections combined)
     */
    async getRecentActivity(limit = 10) {
        if (!this.isAvailable()) return [];

        try {
            const [packetsRes, inspectionsRes] = await Promise.all([
                this.client
                    .from('packets')
                    .select('id, customer_name, customer_address, updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(limit),
                this.client
                    .from('inspections')
                    .select('id, customer_name, customer_address, updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(limit)
            ]);

            const packets = (packetsRes.data || []).map(p => ({ ...p, type: 'packet' }));
            const inspections = (inspectionsRes.data || []).map(i => ({ ...i, type: 'inspection' }));

            // Combine and sort by updated_at
            return [...packets, ...inspections]
                .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
                .slice(0, limit);
        } catch (e) {
            console.error('Failed to get recent activity:', e);
            return [];
        }
    },

    /**
     * Get dashboard stats
     */
    async getDashboardStats() {
        if (!this.isAvailable()) {
            return { totalPackets: 0, totalInspections: 0, thisWeek: 0 };
        }

        try {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);

            const [packetsCount, inspectionsCount, weekPackets, weekInspections] = await Promise.all([
                this.client.from('packets').select('id', { count: 'exact', head: true }),
                this.client.from('inspections').select('id', { count: 'exact', head: true }),
                this.client.from('packets').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
                this.client.from('inspections').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString())
            ]);

            return {
                totalPackets: packetsCount.count || 0,
                totalInspections: inspectionsCount.count || 0,
                thisWeek: (weekPackets.count || 0) + (weekInspections.count || 0)
            };
        } catch (e) {
            console.error('Failed to get dashboard stats:', e);
            return { totalPackets: 0, totalInspections: 0, thisWeek: 0 };
        }
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseClient;
}
