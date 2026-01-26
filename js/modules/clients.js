/**
 * LAVA Portal - Clients Module
 * Manages client records and provides selection dialog for linking records
 */

const Clients = {
    // Current selected client (for use across pages)
    currentClient: null,

    // Cached client list
    clientsList: [],

    /**
     * Initialize the clients module
     */
    init() {
        console.log('[Clients] Module initialized');
    },

    // ==================== CRUD OPERATIONS ====================

    /**
     * List all clients
     * @param {string} search - Optional search query
     * @returns {Promise<Array>}
     */
    async list(search = '') {
        if (!SupabaseClient.isAvailable()) {
            return this.getLocalClients(search);
        }

        try {
            if (search) {
                this.clientsList = await SupabaseClient.searchClients(search);
            } else {
                this.clientsList = await SupabaseClient.listClients();
            }
            return this.clientsList;
        } catch (e) {
            console.error('[Clients] Failed to list:', e);
            return [];
        }
    },

    /**
     * Get a single client
     * @param {string} id
     * @returns {Promise<Object|null>}
     */
    async get(id) {
        if (!SupabaseClient.isAvailable()) {
            return this.getLocalClient(id);
        }

        try {
            return await SupabaseClient.getClientById(id);
        } catch (e) {
            console.error('[Clients] Failed to get:', e);
            return null;
        }
    },

    /**
     * Create a new client
     * @param {Object} data - Client data
     * @returns {Promise<Object|null>}
     */
    async create(data) {
        const clientData = {
            name: data.name,
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            notes: data.notes || '',
            tags: data.tags || []
        };

        if (!SupabaseClient.isAvailable()) {
            return this.saveLocalClient(clientData);
        }

        try {
            const result = await SupabaseClient.saveClient(clientData);
            this.dispatchEvent('client:created', result);
            return result;
        } catch (e) {
            console.error('[Clients] Failed to create:', e);
            return null;
        }
    },

    /**
     * Update an existing client
     * @param {string} id
     * @param {Object} data
     * @returns {Promise<Object|null>}
     */
    async update(id, data) {
        if (!SupabaseClient.isAvailable()) {
            return this.saveLocalClient({ ...data, id });
        }

        try {
            const result = await SupabaseClient.saveClient({ ...data, id });
            this.dispatchEvent('client:updated', result);
            return result;
        } catch (e) {
            console.error('[Clients] Failed to update:', e);
            return null;
        }
    },

    /**
     * Delete a client
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async delete(id) {
        if (!SupabaseClient.isAvailable()) {
            return this.deleteLocalClient(id);
        }

        try {
            const success = await SupabaseClient.deleteClient(id);
            if (success) {
                this.dispatchEvent('client:deleted', { id });
            }
            return success;
        } catch (e) {
            console.error('[Clients] Failed to delete:', e);
            return false;
        }
    },

    /**
     * Find existing client or create new one
     * @param {string} name
     * @param {string} address
     * @returns {Promise<Object|null>}
     */
    async findOrCreate(name, address = '') {
        if (!name || !name.trim()) return null;

        if (!SupabaseClient.isAvailable()) {
            // Local fallback
            const existing = this.getLocalClients().find(c =>
                c.name.toLowerCase() === name.toLowerCase() &&
                (c.address || '').toLowerCase() === (address || '').toLowerCase()
            );
            if (existing) return existing;
            return this.saveLocalClient({ name, address });
        }

        try {
            return await SupabaseClient.findOrCreateClient(name, address);
        } catch (e) {
            console.error('[Clients] Failed to find or create:', e);
            return null;
        }
    },

    /**
     * Get all history for a client
     * @param {string} clientId
     * @param {string} clientName - Optional client name for local media matching
     * @returns {Promise<Object>}
     */
    async getHistory(clientId, clientName = '') {
        let history = { packets: [], inspections: [], media: [] };

        // Try to get from Supabase first
        if (SupabaseClient.isAvailable()) {
            try {
                history = await SupabaseClient.getClientHistory(clientId);
            } catch (e) {
                console.error('[Clients] Failed to get history from Supabase:', e);
            }
        }

        // Also include locally stored quick-capture media
        const localMedia = this.getLocalQuickMedia(clientId, clientName);
        if (localMedia.length > 0) {
            // Merge local media, avoiding duplicates by id
            const existingIds = new Set(history.media.map(m => m.id));
            localMedia.forEach(m => {
                if (!existingIds.has(m.id)) {
                    history.media.push(m);
                }
            });

            // Sort by created_at descending
            history.media.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        return history;
    },

    /**
     * Get local quick-capture media for a client
     * @param {string} clientId
     * @param {string} clientName - Optional client name for matching
     * @returns {Array}
     */
    getLocalQuickMedia(clientId, clientName = '') {
        try {
            const allMedia = JSON.parse(localStorage.getItem('lavaQuickMedia') || '[]');

            // Filter by client_id or client name
            return allMedia.filter(m => {
                // Exact ID match
                if (m.client_id === clientId) return true;
                // ID might be stored with different format
                if (m.client_id && clientId && m.client_id.toString() === clientId.toString()) return true;
                // Match by client name (case insensitive)
                if (clientName && m.client_name &&
                    m.client_name.toLowerCase() === clientName.toLowerCase()) return true;
                return false;
            }).map(m => ({
                id: m.id,
                filename: m.id + (m.type === 'photo' ? '.jpg' : m.type === 'video' ? '.mp4' : '.webm'),
                file_type: m.type === 'voice' ? 'audio' : m.type,
                public_url: m.url || m.thumbnail || m.blob, // Use URL, thumbnail, or blob as fallback
                caption: m.note || m.transcript || '',
                tags: [m.client_name, m.type].filter(Boolean),
                created_at: m.created_at,
                is_local: !m.url, // Flag to indicate this is local/base64 data
                has_thumbnail_only: !m.url && m.thumbnail // Flag to indicate thumbnail only (no full image)
            }));
        } catch (e) {
            console.error('[Clients] Failed to get local quick media:', e);
            return [];
        }
    },

    /**
     * Update client activity timestamp
     * @param {string} clientId
     */
    async updateActivity(clientId) {
        if (clientId && SupabaseClient.isAvailable()) {
            await SupabaseClient.updateClientActivity(clientId);
        }
    },

    // ==================== LOCAL STORAGE FALLBACK ====================

    getLocalClients(search = '') {
        const clients = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('lavaClient_')) {
                try {
                    const client = JSON.parse(localStorage.getItem(key));
                    if (!search ||
                        client.name.toLowerCase().includes(search.toLowerCase()) ||
                        (client.address || '').toLowerCase().includes(search.toLowerCase())) {
                        clients.push(client);
                    }
                } catch (e) { }
            }
        }
        return clients.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    },

    getLocalClient(id) {
        try {
            return JSON.parse(localStorage.getItem(`lavaClient_${id}`));
        } catch (e) {
            return null;
        }
    },

    saveLocalClient(data) {
        const id = data.id || crypto.randomUUID();
        const now = new Date().toISOString();
        const client = {
            ...data,
            id,
            created_at: data.created_at || now,
            updated_at: now,
            last_activity_at: now
        };
        localStorage.setItem(`lavaClient_${id}`, JSON.stringify(client));
        return client;
    },

    deleteLocalClient(id) {
        localStorage.removeItem(`lavaClient_${id}`);
        return true;
    },

    // ==================== UI COMPONENTS ====================

    /**
     * Show client selection dialog
     * @param {Object} options
     * @param {boolean} options.allowCreate - Allow creating new client
     * @param {string} options.initialName - Pre-fill name field
     * @param {string} options.initialAddress - Pre-fill address field
     * @param {Function} options.onSelect - Callback when client is selected
     * @param {Function} options.onCancel - Callback when dialog is cancelled
     */
    showSelectDialog(options = {}) {
        const {
            allowCreate = true,
            initialName = '',
            initialAddress = '',
            onSelect = () => { },
            onCancel = () => { }
        } = options;

        // Remove existing dialog if any
        const existing = document.getElementById('clientSelectDialog');
        if (existing) existing.remove();

        // Create dialog HTML
        const dialog = document.createElement('div');
        dialog.id = 'clientSelectDialog';
        dialog.className = 'client-dialog-overlay';
        dialog.innerHTML = `
            <div class="client-dialog">
                <div class="client-dialog-header">
                    <h2>Select Client</h2>
                    <button class="btn-close" id="clientDialogClose">&times;</button>
                </div>
                <div class="client-dialog-body">
                    <div class="client-search-box">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="clientSearchInput" placeholder="Search clients..." value="${this.escapeHtml(initialName)}">
                    </div>
                    <div class="client-list" id="clientDialogList">
                        <div class="loading">Loading clients...</div>
                    </div>
                    ${allowCreate ? `
                    <div class="client-create-section">
                        <div class="divider"><span>or create new</span></div>
                        <div class="client-create-form">
                            <div class="form-row">
                                <input type="text" id="newClientName" placeholder="Client Name *" value="${this.escapeHtml(initialName)}">
                            </div>
                            <div class="form-row">
                                <input type="text" id="newClientAddress" placeholder="Address" value="${this.escapeHtml(initialAddress)}">
                            </div>
                            <div class="form-row">
                                <input type="text" id="newClientPhone" placeholder="Phone">
                                <input type="email" id="newClientEmail" placeholder="Email">
                            </div>
                            <button class="btn btn-primary" id="createClientBtn">Create Client</button>
                        </div>
                    </div>
                    ` : ''}
                </div>
                <div class="client-dialog-footer">
                    <button class="btn" id="clientDialogCancel">Cancel</button>
                    <button class="btn btn-secondary" id="clientDialogSkip">Skip (No Client)</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Load and render clients
        const listEl = document.getElementById('clientDialogList');
        const searchInput = document.getElementById('clientSearchInput');

        const renderClients = async (search = '') => {
            const clients = await this.list(search);

            if (clients.length === 0) {
                listEl.innerHTML = search
                    ? '<div class="empty-state">No clients match your search</div>'
                    : '<div class="empty-state">No clients yet</div>';
                return;
            }

            listEl.innerHTML = clients.map(client => `
                <div class="client-list-item" data-id="${client.id}">
                    <div class="client-item-info">
                        <div class="client-item-name">${this.escapeHtml(client.name)}</div>
                        ${client.address ? `<div class="client-item-address">${this.escapeHtml(client.address)}</div>` : ''}
                    </div>
                    <div class="client-item-meta">
                        ${client.total_packets ? `<span>${client.total_packets} packets</span>` : ''}
                        ${client.total_inspections ? `<span>${client.total_inspections} inspections</span>` : ''}
                    </div>
                </div>
            `).join('');

            // Add click handlers
            listEl.querySelectorAll('.client-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const client = clients.find(c => c.id === item.dataset.id);
                    if (client) {
                        this.currentClient = client;
                        dialog.remove();
                        onSelect(client);
                    }
                });
            });
        };

        // Initial load
        renderClients(initialName);

        // Search handler
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => renderClients(e.target.value), 300);
        });

        // Create client handler
        if (allowCreate) {
            document.getElementById('createClientBtn').addEventListener('click', async () => {
                const name = document.getElementById('newClientName').value.trim();
                if (!name) {
                    alert('Client name is required');
                    return;
                }

                const newClient = await this.create({
                    name,
                    address: document.getElementById('newClientAddress').value.trim(),
                    phone: document.getElementById('newClientPhone').value.trim(),
                    email: document.getElementById('newClientEmail').value.trim()
                });

                if (newClient) {
                    this.currentClient = newClient;
                    dialog.remove();
                    onSelect(newClient);
                }
            });
        }

        // Close handlers
        document.getElementById('clientDialogClose').addEventListener('click', () => {
            dialog.remove();
            onCancel();
        });

        document.getElementById('clientDialogCancel').addEventListener('click', () => {
            dialog.remove();
            onCancel();
        });

        document.getElementById('clientDialogSkip').addEventListener('click', () => {
            this.currentClient = null;
            dialog.remove();
            onSelect(null);
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
                onCancel();
            }
        });

        // Focus search input
        setTimeout(() => searchInput.focus(), 100);

        return dialog;
    },

    /**
     * Show client info button/badge
     * @param {Object} client
     * @param {HTMLElement} container
     * @param {Function} onChange - Called when client is changed
     */
    showClientBadge(client, container, onChange = () => { }) {
        const badge = document.createElement('div');
        badge.className = 'client-badge';

        if (client) {
            badge.innerHTML = `
                <span class="client-badge-icon">👤</span>
                <span class="client-badge-name">${this.escapeHtml(client.name)}</span>
                <button class="client-badge-change" title="Change client">✏️</button>
                <button class="client-badge-clear" title="Remove client">&times;</button>
            `;

            badge.querySelector('.client-badge-change').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showSelectDialog({
                    allowCreate: true,
                    onSelect: (newClient) => {
                        this.currentClient = newClient;
                        onChange(newClient);
                        this.showClientBadge(newClient, container, onChange);
                    }
                });
            });

            badge.querySelector('.client-badge-clear').addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentClient = null;
                onChange(null);
                this.showClientBadge(null, container, onChange);
            });
        } else {
            badge.innerHTML = `
                <button class="btn btn-small client-select-btn">
                    <span>👤</span> Select Client
                </button>
            `;

            badge.querySelector('.client-select-btn').addEventListener('click', () => {
                this.showSelectDialog({
                    allowCreate: true,
                    onSelect: (selectedClient) => {
                        this.currentClient = selectedClient;
                        onChange(selectedClient);
                        this.showClientBadge(selectedClient, container, onChange);
                    }
                });
            });
        }

        container.innerHTML = '';
        container.appendChild(badge);
    },

    // ==================== UTILITIES ====================

    /**
     * Escape HTML for safe rendering
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Dispatch custom event
     */
    dispatchEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    },

    /**
     * Generate tags from context
     * @param {Object} context
     * @returns {string[]}
     */
    generateTags(context = {}) {
        const tags = [];

        // File type tags
        if (context.fileType) {
            tags.push(context.fileType);
        }

        // Context tags from filename
        if (context.filename) {
            const lower = context.filename.toLowerCase();
            if (lower.includes('aerial')) tags.push('aerial');
            if (lower.includes('diagram')) tags.push('diagram');
            if (lower.includes('roof')) tags.push('roof');
            if (lower.includes('damage')) tags.push('damage');
            if (lower.includes('photo') || lower.includes('img')) tags.push('photo');
            if (lower.includes('report')) tags.push('report');
            if (lower.includes('estimate')) tags.push('estimate');
            if (lower.includes('invoice')) tags.push('invoice');
        }

        // Linked type tags
        if (context.linkedType) {
            tags.push(context.linkedType);
        }

        return [...new Set(tags)];
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Clients;
}
