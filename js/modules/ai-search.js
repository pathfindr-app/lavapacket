/**
 * LAVA Roofing Portal - AI Search Module
 * Natural language search across all data
 */

const AISearch = {
    // OpenAI endpoint (via Supabase Edge Function)
    endpoint: null,

    /**
     * Initialize with endpoint
     */
    init(endpoint = '/api/ai-search') {
        this.endpoint = endpoint;
    },

    /**
     * Perform AI-powered search
     */
    async search(query) {
        if (!query || query.trim().length < 2) {
            return { results: [], query: query };
        }

        console.log('[AISearch] Searching:', query);

        try {
            // First, try to parse intent locally for common queries
            const intent = this.parseIntent(query);

            // Perform searches based on intent
            const results = await this.executeSearch(intent, query);

            return {
                query,
                intent,
                results,
                totalCount: results.reduce((sum, group) => sum + group.items.length, 0)
            };
        } catch (e) {
            console.error('[AISearch] Search failed:', e);
            return { results: [], query, error: e.message };
        }
    },

    /**
     * Parse search intent from natural language
     */
    parseIntent(query) {
        const lower = query.toLowerCase();
        const intent = {
            types: [], // 'clients', 'packets', 'inspections', 'jobs', 'media', 'voice'
            filters: {},
            keywords: []
        };

        // Detect entity types
        if (lower.includes('client') || lower.includes('customer')) {
            intent.types.push('clients');
        }
        if (lower.includes('packet') || lower.includes('proposal') || lower.includes('estimate')) {
            intent.types.push('packets');
        }
        if (lower.includes('inspection') || lower.includes('report')) {
            intent.types.push('inspections');
        }
        if (lower.includes('job') || lower.includes('project') || lower.includes('work')) {
            intent.types.push('jobs');
        }
        if (lower.includes('photo') || lower.includes('image') || lower.includes('picture') || lower.includes('media')) {
            intent.types.push('media');
        }
        if (lower.includes('memo') || lower.includes('voice') || lower.includes('recording') || lower.includes('note')) {
            intent.types.push('voice');
        }

        // If no type detected, search all
        if (intent.types.length === 0) {
            intent.types = ['clients', 'packets', 'inspections', 'jobs', 'media'];
        }

        // Detect time filters
        if (lower.includes('today')) {
            intent.filters.dateRange = 'today';
        } else if (lower.includes('this week')) {
            intent.filters.dateRange = 'week';
        } else if (lower.includes('this month')) {
            intent.filters.dateRange = 'month';
        } else if (lower.includes('this year')) {
            intent.filters.dateRange = 'year';
        }

        // Detect status filters
        if (lower.includes('pending')) intent.filters.status = 'pending';
        if (lower.includes('scheduled')) intent.filters.status = 'scheduled';
        if (lower.includes('in progress') || lower.includes('active')) intent.filters.status = 'in_progress';
        if (lower.includes('completed') || lower.includes('done') || lower.includes('finished')) intent.filters.status = 'completed';

        // Detect product types
        if (lower.includes('standing seam') || lower.includes('metal')) intent.filters.product = 'standing-seam';
        if (lower.includes('shingle')) intent.filters.product = 'shingles';
        if (lower.includes('brava') || lower.includes('tile')) intent.filters.product = 'brava';

        // Extract search keywords (remove common words)
        const stopWords = ['find', 'show', 'get', 'search', 'for', 'the', 'a', 'an', 'of', 'with', 'from', 'all', 'my', 'me'];
        intent.keywords = lower
            .split(/\s+/)
            .filter(word => word.length > 2 && !stopWords.includes(word))
            .slice(0, 5);

        return intent;
    },

    /**
     * Execute search based on parsed intent
     */
    async executeSearch(intent, originalQuery) {
        const results = [];
        const searchTerm = intent.keywords.join(' ') || originalQuery;

        // Search each entity type
        if (intent.types.includes('clients')) {
            const clients = await this.searchClients(searchTerm, intent.filters);
            if (clients.length > 0) {
                results.push({
                    type: 'clients',
                    label: 'Clients',
                    icon: '👤',
                    items: clients
                });
            }
        }

        if (intent.types.includes('packets')) {
            const packets = await this.searchPackets(searchTerm, intent.filters);
            if (packets.length > 0) {
                results.push({
                    type: 'packets',
                    label: 'Packets',
                    icon: '📦',
                    items: packets
                });
            }
        }

        if (intent.types.includes('inspections')) {
            const inspections = await this.searchInspections(searchTerm, intent.filters);
            if (inspections.length > 0) {
                results.push({
                    type: 'inspections',
                    label: 'Inspections',
                    icon: '🔍',
                    items: inspections
                });
            }
        }

        if (intent.types.includes('jobs')) {
            const jobs = await this.searchJobs(searchTerm, intent.filters);
            if (jobs.length > 0) {
                results.push({
                    type: 'jobs',
                    label: 'Jobs',
                    icon: '🔨',
                    items: jobs
                });
            }
        }

        if (intent.types.includes('media')) {
            const media = await this.searchMedia(searchTerm, intent.filters);
            if (media.length > 0) {
                results.push({
                    type: 'media',
                    label: 'Photos & Media',
                    icon: '📷',
                    items: media
                });
            }
        }

        if (intent.types.includes('voice')) {
            const memos = await this.searchVoiceMemos(searchTerm, intent.filters);
            if (memos.length > 0) {
                results.push({
                    type: 'voice',
                    label: 'Voice Memos',
                    icon: '🎤',
                    items: memos
                });
            }
        }

        return results;
    },

    /**
     * Search clients
     */
    async searchClients(term, filters) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('clients')
                .select('id, name, address, phone, email, tags')
                .or(`name.ilike.%${term}%,address.ilike.%${term}%`)
                .limit(10);

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(c => ({
                ...c,
                title: c.name,
                subtitle: c.address,
                url: `clients/view.html?id=${c.id}`
            }));
        } catch (e) {
            console.error('[AISearch] Client search failed:', e);
            return [];
        }
    },

    /**
     * Search packets
     */
    async searchPackets(term, filters) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('packets')
                .select('id, customer_name, customer_address, product_type, created_at')
                .or(`customer_name.ilike.%${term}%,customer_address.ilike.%${term}%`)
                .order('created_at', { ascending: false })
                .limit(10);

            if (filters.product) {
                query = query.eq('product_type', filters.product);
            }

            if (filters.dateRange) {
                query = query.gte('created_at', this.getDateFromRange(filters.dateRange));
            }

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(p => ({
                ...p,
                title: p.customer_name || 'Unnamed',
                subtitle: `${p.product_type || 'Unknown'} - ${p.customer_address || 'No address'}`,
                url: `packets/builder.html?id=${p.id}`
            }));
        } catch (e) {
            console.error('[AISearch] Packet search failed:', e);
            return [];
        }
    },

    /**
     * Search inspections
     */
    async searchInspections(term, filters) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('inspections')
                .select('id, customer_name, customer_address, status, inspection_date')
                .or(`customer_name.ilike.%${term}%,customer_address.ilike.%${term}%`)
                .order('inspection_date', { ascending: false })
                .limit(10);

            if (filters.status) {
                query = query.eq('status', filters.status);
            }

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(i => ({
                ...i,
                title: i.customer_name || 'Unnamed',
                subtitle: `${i.status || 'Unknown'} - ${i.customer_address || 'No address'}`,
                url: `inspections/form.html?id=${i.id}`
            }));
        } catch (e) {
            console.error('[AISearch] Inspection search failed:', e);
            return [];
        }
    },

    /**
     * Search jobs
     */
    async searchJobs(term, filters) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('jobs')
                .select('id, title, address, status, scheduled_date')
                .or(`title.ilike.%${term}%,address.ilike.%${term}%`)
                .order('scheduled_date', { ascending: false })
                .limit(10);

            if (filters.status) {
                query = query.eq('status', filters.status);
            }

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(j => ({
                ...j,
                title: j.title || 'Unnamed Job',
                subtitle: `${Jobs.getStatusInfo(j.status).label} - ${j.address || 'No address'}`,
                url: `jobs/view.html?id=${j.id}`
            }));
        } catch (e) {
            console.error('[AISearch] Job search failed:', e);
            return [];
        }
    },

    /**
     * Search media
     */
    async searchMedia(term, filters) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('media')
                .select('id, filename, public_url, caption, tags, address')
                .or(`filename.ilike.%${term}%,caption.ilike.%${term}%,address.ilike.%${term}%`)
                .order('created_at', { ascending: false })
                .limit(10);

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(m => ({
                ...m,
                title: m.filename || 'Image',
                subtitle: m.caption || m.address || 'No description',
                thumbnail: m.public_url,
                url: m.public_url
            }));
        } catch (e) {
            console.error('[AISearch] Media search failed:', e);
            return [];
        }
    },

    /**
     * Search voice memos
     */
    async searchVoiceMemos(term, filters) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('voice_memos')
                .select('id, transcript, duration_seconds, created_at, client_id, job_id')
                .ilike('transcript', `%${term}%`)
                .order('created_at', { ascending: false })
                .limit(10);

            const { data, error } = await query;
            if (error) throw error;

            return (data || []).map(v => ({
                ...v,
                title: `Voice Memo - ${new Date(v.created_at).toLocaleDateString()}`,
                subtitle: v.transcript?.substring(0, 100) + '...' || 'No transcript',
                url: v.job_id ? `jobs/view.html?id=${v.job_id}` : '#'
            }));
        } catch (e) {
            console.error('[AISearch] Voice memo search failed:', e);
            return [];
        }
    },

    /**
     * Get date from range string
     */
    getDateFromRange(range) {
        const now = new Date();
        switch (range) {
            case 'today':
                return now.toISOString().split('T')[0];
            case 'week':
                now.setDate(now.getDate() - 7);
                return now.toISOString().split('T')[0];
            case 'month':
                now.setMonth(now.getMonth() - 1);
                return now.toISOString().split('T')[0];
            case 'year':
                now.setFullYear(now.getFullYear() - 1);
                return now.toISOString().split('T')[0];
            default:
                return null;
        }
    },

    /**
     * Get search suggestions
     */
    getSuggestions() {
        return [
            'Find photos of standing seam roofs',
            'Show all pending jobs',
            'Clients in Kailua',
            'Inspections this month',
            'Packets for shingle roofs',
            'Jobs completed this week'
        ];
    },

    /**
     * Render search results
     */
    renderResults(searchResult) {
        if (!searchResult || searchResult.results.length === 0) {
            return `
                <div class="search-empty">
                    <div class="empty-icon">🔍</div>
                    <h3>No results found</h3>
                    <p>Try a different search term or browse categories</p>
                </div>
            `;
        }

        return `
            <div class="search-results">
                <div class="results-summary">
                    Found ${searchResult.totalCount} result${searchResult.totalCount !== 1 ? 's' : ''} for "${searchResult.query}"
                </div>
                ${searchResult.results.map(group => `
                    <div class="result-group">
                        <h3 class="group-header">
                            <span class="group-icon">${group.icon}</span>
                            ${group.label}
                            <span class="group-count">${group.items.length}</span>
                        </h3>
                        <div class="group-items">
                            ${group.items.map(item => this.renderResultItem(item, group.type)).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render a single result item
     */
    renderResultItem(item, type) {
        const thumbnail = item.thumbnail ?
            `<img src="${item.thumbnail}" alt="" class="result-thumb">` :
            `<div class="result-icon">${this.getTypeIcon(type)}</div>`;

        return `
            <a href="${item.url}" class="result-item" data-type="${type}">
                ${thumbnail}
                <div class="result-content">
                    <div class="result-title">${this.escapeHtml(item.title)}</div>
                    <div class="result-subtitle">${this.escapeHtml(item.subtitle)}</div>
                </div>
            </a>
        `;
    },

    /**
     * Get icon for type
     */
    getTypeIcon(type) {
        const icons = {
            clients: '👤',
            packets: '📦',
            inspections: '🔍',
            jobs: '🔨',
            media: '📷',
            voice: '🎤'
        };
        return icons[type] || '📄';
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
    module.exports = AISearch;
}
