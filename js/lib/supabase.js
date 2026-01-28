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
        console.log('[SupabaseClient] init() called, already initialized:', this.initialized);
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

        console.log('[SupabaseClient] config.url:', this.config.url ? 'present' : 'missing');
        console.log('[SupabaseClient] config.anonKey:', this.config.anonKey ? 'present' : 'missing');

        if (!this.config.url || !this.config.anonKey) {
            console.warn('[SupabaseClient] Supabase not configured. Using localStorage fallback.');
            return null;
        }

        try {
            this.client = supabase.createClient(this.config.url, this.config.anonKey);
            this.initialized = true;
            console.log('[SupabaseClient] Supabase client initialized successfully');
            return this.client;
        } catch (e) {
            console.error('[SupabaseClient] Failed to initialize Supabase:', e);
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
        console.log('[SupabaseClient] getPacket() called, id:', id);
        if (!this.isAvailable()) {
            console.log('[SupabaseClient] getPacket() - not available');
            return null;
        }

        try {
            const { data, error } = await this.client
                .from('packets')
                .select('*')
                .eq('id', id)
                .single();

            if (error) {
                console.error('[SupabaseClient] getPacket() error:', error);
                throw error;
            }

            console.log('[SupabaseClient] getPacket() found:', data?.customer_name);

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
            console.error('[SupabaseClient] Failed to get packet:', e);
            return null;
        }
    },

    /**
     * Save a packet (create or update)
     */
    async savePacket(packetData) {
        console.log('[SupabaseClient] savePacket() called, isAvailable:', this.isAvailable());
        if (!this.isAvailable()) {
            console.log('[SupabaseClient] savePacket() - Supabase not available, returning null');
            return null;
        }

        try {
            const { id, photos, ...data } = packetData;
            const now = new Date().toISOString();
            console.log('[SupabaseClient] savePacket() id:', id, 'data keys:', Object.keys(data));

            let result;
            if (id) {
                // Update existing
                console.log('[SupabaseClient] Updating existing packet:', id);
                const { data: updated, error } = await this.client
                    .from('packets')
                    .update({ ...data, updated_at: now })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    console.error('[SupabaseClient] Update error:', error);
                    throw error;
                }
                result = updated;
            } else {
                // Create new
                console.log('[SupabaseClient] Creating new packet');
                const { data: created, error } = await this.client
                    .from('packets')
                    .insert({ ...data, created_at: now, updated_at: now })
                    .select()
                    .single();

                if (error) {
                    console.error('[SupabaseClient] Insert error:', error);
                    throw error;
                }
                result = created;
            }

            console.log('[SupabaseClient] savePacket() success, result id:', result?.id);
            return result;
        } catch (e) {
            console.error('[SupabaseClient] Failed to save packet:', e);
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

    // ==================== CLIENTS ====================

    /**
     * List all clients
     */
    async listClients() {
        if (!this.isAvailable()) return [];

        try {
            const { data, error } = await this.client
                .from('clients')
                .select('id, name, address, phone, email, tags, total_packets, total_inspections, total_media, created_at, updated_at, last_activity_at')
                .order('last_activity_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('Failed to list clients:', e);
            return [];
        }
    },

    /**
     * Search clients by name or address
     */
    async searchClients(query) {
        if (!this.isAvailable()) return [];

        try {
            const { data, error } = await this.client
                .from('clients')
                .select('id, name, address, phone, email, tags, total_packets, total_inspections, total_media, last_activity_at')
                .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
                .order('last_activity_at', { ascending: false })
                .limit(20);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('Failed to search clients:', e);
            return [];
        }
    },

    /**
     * Get a single client by ID
     */
    async getClientById(id) {
        if (!this.isAvailable()) return null;

        try {
            const { data, error } = await this.client
                .from('clients')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('Failed to get client:', e);
            return null;
        }
    },

    /**
     * Save a client (create or update)
     */
    async saveClient(clientData) {
        if (!this.isAvailable()) return null;

        try {
            const { id, ...data } = clientData;
            const now = new Date().toISOString();

            let result;
            if (id) {
                // Update existing
                const { data: updated, error } = await this.client
                    .from('clients')
                    .update({ ...data, updated_at: now })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) throw error;
                result = updated;
            } else {
                // Create new
                const { data: created, error } = await this.client
                    .from('clients')
                    .insert({ ...data, created_at: now, updated_at: now, last_activity_at: now })
                    .select()
                    .single();

                if (error) throw error;
                result = created;
            }

            return result;
        } catch (e) {
            console.error('Failed to save client:', e);
            return null;
        }
    },

    /**
     * Delete a client
     */
    async deleteClient(id) {
        if (!this.isAvailable()) return false;

        try {
            const { error } = await this.client
                .from('clients')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (e) {
            console.error('Failed to delete client:', e);
            return false;
        }
    },

    /**
     * Find client by name and address, or create new
     */
    async findOrCreateClient(name, address = '') {
        if (!this.isAvailable()) return null;

        try {
            // Try to find existing
            let query = this.client
                .from('clients')
                .select('*')
                .ilike('name', name);

            if (address) {
                query = query.ilike('address', address);
            }

            const { data: existing, error: findError } = await query.limit(1);

            if (findError) throw findError;

            if (existing && existing.length > 0) {
                return existing[0];
            }

            // Create new
            const { data: created, error: createError } = await this.client
                .from('clients')
                .insert({ name, address })
                .select()
                .single();

            if (createError) throw createError;
            return created;
        } catch (e) {
            console.error('Failed to find or create client:', e);
            return null;
        }
    },

    /**
     * Get client history (packets, inspections, media)
     */
    async getClientHistory(clientId) {
        if (!this.isAvailable()) return { packets: [], inspections: [], media: [] };

        try {
            const [packetsRes, inspectionsRes, mediaRes, inspectionPhotosRes] = await Promise.all([
                this.client
                    .from('packets')
                    .select('id, customer_name, customer_address, product_type, created_at, updated_at')
                    .eq('client_id', clientId)
                    .order('updated_at', { ascending: false }),
                this.client
                    .from('inspections')
                    .select('id, customer_name, customer_address, inspection_date, status, created_at, updated_at')
                    .eq('client_id', clientId)
                    .order('updated_at', { ascending: false }),
                this.client
                    .from('media')
                    .select('id, filename, file_type, public_url, caption, tags, created_at')
                    .eq('client_id', clientId)
                    .order('created_at', { ascending: false }),
                // Also get inspection photos for this client
                this.client
                    .from('inspection_photos')
                    .select('id, storage_path, category, caption, created_at, inspection_id, inspections!inner(client_id)')
                    .eq('inspections.client_id', clientId)
                    .order('created_at', { ascending: false })
            ]);

            // Convert inspection photos to media format
            const inspectionPhotos = (inspectionPhotosRes.data || []).map(photo => {
                const { data: urlData } = this.client.storage.from('photos').getPublicUrl(photo.storage_path);
                return {
                    id: photo.id,
                    filename: photo.storage_path.split('/').pop(),
                    file_type: 'photo',
                    public_url: urlData?.publicUrl || '',
                    caption: photo.caption || `Inspection photo (${photo.category})`,
                    tags: ['inspection'],
                    created_at: photo.created_at,
                    storage_path: photo.storage_path,
                    source: 'inspection'
                };
            });

            // Combine media and inspection photos, removing duplicates by URL
            const allMedia = [...(mediaRes.data || [])];
            const existingUrls = new Set(allMedia.map(m => m.public_url));
            for (const photo of inspectionPhotos) {
                if (!existingUrls.has(photo.public_url)) {
                    allMedia.push(photo);
                    existingUrls.add(photo.public_url);
                }
            }

            // Sort by created_at descending
            allMedia.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            return {
                packets: packetsRes.data || [],
                inspections: inspectionsRes.data || [],
                media: allMedia
            };
        } catch (e) {
            console.error('Failed to get client history:', e);
            return { packets: [], inspections: [], media: [] };
        }
    },

    /**
     * Update client activity and counts
     */
    async updateClientActivity(clientId) {
        if (!this.isAvailable() || !clientId) return;

        try {
            // Use the database function if available, otherwise update directly
            const { error } = await this.client.rpc('update_client_counts', { p_client_id: clientId });

            if (error) {
                // Fallback: just update last_activity_at
                await this.client
                    .from('clients')
                    .update({ last_activity_at: new Date().toISOString() })
                    .eq('id', clientId);
            }
        } catch (e) {
            console.error('Failed to update client activity:', e);
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
            return { totalPackets: 0, totalInspections: 0, totalClients: 0, thisWeek: 0 };
        }

        try {
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);

            const [packetsCount, inspectionsCount, clientsCount, weekPackets, weekInspections] = await Promise.all([
                this.client.from('packets').select('id', { count: 'exact', head: true }),
                this.client.from('inspections').select('id', { count: 'exact', head: true }),
                this.client.from('clients').select('id', { count: 'exact', head: true }),
                this.client.from('packets').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
                this.client.from('inspections').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString())
            ]);

            return {
                totalPackets: packetsCount.count || 0,
                totalInspections: inspectionsCount.count || 0,
                totalClients: clientsCount.count || 0,
                thisWeek: (weekPackets.count || 0) + (weekInspections.count || 0)
            };
        } catch (e) {
            console.error('Failed to get dashboard stats:', e);
            return { totalPackets: 0, totalInspections: 0, totalClients: 0, thisWeek: 0 };
        }
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseClient;
}
