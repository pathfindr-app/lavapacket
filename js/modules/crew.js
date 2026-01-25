/**
 * LAVA Roofing Portal - Crew Management Module
 * Handles team members CRUD operations
 */

const Crew = {
    /**
     * List all active team members
     */
    async list(includeInactive = false) {
        if (!SupabaseClient.isAvailable()) return this.listLocal();

        try {
            let query = SupabaseClient.getClient()
                .from('team_members')
                .select('*')
                .order('name');

            if (!includeInactive) {
                query = query.eq('active', true);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Crew] Failed to list:', e);
            return [];
        }
    },

    /**
     * Get a single team member by ID
     */
    async get(id) {
        if (!SupabaseClient.isAvailable()) return this.getLocal(id);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('team_members')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[Crew] Failed to get:', e);
            return null;
        }
    },

    /**
     * Create a new team member
     */
    async create(memberData) {
        if (!SupabaseClient.isAvailable()) return this.createLocal(memberData);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('team_members')
                .insert(memberData)
                .select()
                .single();

            if (error) throw error;
            console.log('[Crew] Created team member:', data.name);
            return data;
        } catch (e) {
            console.error('[Crew] Failed to create:', e);
            return null;
        }
    },

    /**
     * Update a team member
     */
    async update(id, updates) {
        if (!SupabaseClient.isAvailable()) return this.updateLocal(id, updates);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('team_members')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            console.log('[Crew] Updated team member:', data.name);
            return data;
        } catch (e) {
            console.error('[Crew] Failed to update:', e);
            return null;
        }
    },

    /**
     * Delete (deactivate) a team member
     */
    async delete(id) {
        if (!SupabaseClient.isAvailable()) return this.deleteLocal(id);

        try {
            // Soft delete - set active to false
            const { error } = await SupabaseClient.getClient()
                .from('team_members')
                .update({ active: false })
                .eq('id', id);

            if (error) throw error;
            console.log('[Crew] Deactivated team member:', id);
            return true;
        } catch (e) {
            console.error('[Crew] Failed to delete:', e);
            return false;
        }
    },

    /**
     * Get crew members assigned to a job
     */
    async getForJob(jobId) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            const { data: job, error: jobError } = await SupabaseClient.getClient()
                .from('jobs')
                .select('assigned_crew')
                .eq('id', jobId)
                .single();

            if (jobError) throw jobError;
            if (!job.assigned_crew || job.assigned_crew.length === 0) return [];

            const { data, error } = await SupabaseClient.getClient()
                .from('team_members')
                .select('*')
                .in('id', job.assigned_crew);

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Crew] Failed to get crew for job:', e);
            return [];
        }
    },

    /**
     * Get crew availability for a date range
     */
    async getAvailability(startDate, endDate) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            // Get all active crew members
            const crew = await this.list();

            // Get jobs in the date range
            const { data: jobs, error } = await SupabaseClient.getClient()
                .from('jobs')
                .select('id, scheduled_date, estimated_days, assigned_crew')
                .gte('scheduled_date', startDate)
                .lte('scheduled_date', endDate)
                .not('status', 'eq', 'cancelled');

            if (error) throw error;

            // Build availability map
            const availability = crew.map(member => {
                const assignedJobs = (jobs || []).filter(job =>
                    job.assigned_crew && job.assigned_crew.includes(member.id)
                );

                return {
                    ...member,
                    jobs: assignedJobs,
                    busyDates: assignedJobs.flatMap(job => {
                        const dates = [];
                        const start = new Date(job.scheduled_date);
                        for (let i = 0; i < (job.estimated_days || 1); i++) {
                            const d = new Date(start);
                            d.setDate(d.getDate() + i);
                            dates.push(d.toISOString().split('T')[0]);
                        }
                        return dates;
                    })
                };
            });

            return availability;
        } catch (e) {
            console.error('[Crew] Failed to get availability:', e);
            return [];
        }
    },

    // ==================== LOCAL STORAGE FALLBACK ====================

    listLocal() {
        try {
            const data = localStorage.getItem('lava_crew');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    },

    getLocal(id) {
        const crew = this.listLocal();
        return crew.find(m => m.id === id) || null;
    },

    createLocal(memberData) {
        const crew = this.listLocal();
        const newMember = {
            ...memberData,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            active: true
        };
        crew.push(newMember);
        localStorage.setItem('lava_crew', JSON.stringify(crew));
        return newMember;
    },

    updateLocal(id, updates) {
        const crew = this.listLocal();
        const index = crew.findIndex(m => m.id === id);
        if (index === -1) return null;
        crew[index] = { ...crew[index], ...updates };
        localStorage.setItem('lava_crew', JSON.stringify(crew));
        return crew[index];
    },

    deleteLocal(id) {
        const crew = this.listLocal();
        const index = crew.findIndex(m => m.id === id);
        if (index === -1) return false;
        crew[index].active = false;
        localStorage.setItem('lava_crew', JSON.stringify(crew));
        return true;
    },

    // ==================== UI HELPERS ====================

    /**
     * Get role display name
     */
    getRoleDisplay(role) {
        const roles = {
            'admin': 'Administrator',
            'crew': 'Crew Member',
            'sales': 'Sales Rep'
        };
        return roles[role] || role;
    },

    /**
     * Get color options for crew members
     */
    getColorOptions() {
        return [
            { value: '#ef4444', label: 'Red' },
            { value: '#f97316', label: 'Orange' },
            { value: '#f59e0b', label: 'Amber' },
            { value: '#22c55e', label: 'Green' },
            { value: '#14b8a6', label: 'Teal' },
            { value: '#3b82f6', label: 'Blue' },
            { value: '#8b5cf6', label: 'Purple' },
            { value: '#ec4899', label: 'Pink' }
        ];
    },

    /**
     * Show crew select dialog
     */
    showSelectDialog(currentCrew = [], onSelect) {
        // Remove existing dialog
        document.querySelector('.crew-select-dialog')?.remove();

        const dialog = document.createElement('div');
        dialog.className = 'crew-select-dialog';

        this.list().then(crew => {
            dialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>Assign Crew</h3>
                        <button class="dialog-close">&times;</button>
                    </div>
                    <div class="crew-list">
                        ${crew.map(member => `
                            <label class="crew-option">
                                <input type="checkbox" value="${member.id}"
                                    ${currentCrew.includes(member.id) ? 'checked' : ''}>
                                <span class="crew-color" style="background: ${member.color}"></span>
                                <span class="crew-name">${member.name}</span>
                                <span class="crew-role">${this.getRoleDisplay(member.role)}</span>
                            </label>
                        `).join('')}
                        ${crew.length === 0 ? '<div class="empty-state">No crew members found</div>' : ''}
                    </div>
                    <div class="dialog-actions">
                        <button class="btn btn-secondary dialog-cancel">Cancel</button>
                        <button class="btn btn-primary dialog-confirm">Assign</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            // Event listeners
            dialog.querySelector('.dialog-backdrop').addEventListener('click', () => dialog.remove());
            dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.remove());
            dialog.querySelector('.dialog-cancel').addEventListener('click', () => dialog.remove());
            dialog.querySelector('.dialog-confirm').addEventListener('click', () => {
                const selected = Array.from(dialog.querySelectorAll('input:checked'))
                    .map(input => input.value);
                onSelect(selected);
                dialog.remove();
            });
        });
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Crew;
}
