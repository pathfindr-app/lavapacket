/**
 * LAVA Roofing Portal - Jobs Module
 * Handles job management, scheduling, and workflow
 */

const Jobs = {
    // Status workflow
    statuses: ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'],

    /**
     * List all jobs with optional filters
     */
    async list(filters = {}) {
        if (!SupabaseClient.isAvailable()) return this.listLocal(filters);

        try {
            let query = SupabaseClient.getClient()
                .from('jobs')
                .select(`
                    *,
                    clients (id, name, phone, email)
                `)
                .order('scheduled_date', { ascending: true, nullsFirst: false });

            // Apply filters
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.clientId) {
                query = query.eq('client_id', filters.clientId);
            }
            if (filters.startDate) {
                query = query.gte('scheduled_date', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('scheduled_date', filters.endDate);
            }
            if (filters.crewMember) {
                query = query.contains('assigned_crew', [filters.crewMember]);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Jobs] Failed to list:', e);
            return [];
        }
    },

    /**
     * Get job with full summary (includes expenses totals)
     */
    async get(id) {
        if (!SupabaseClient.isAvailable()) return this.getLocal(id);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('job_summary')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[Jobs] Failed to get:', e);
            return null;
        }
    },

    /**
     * Create a new job
     */
    async create(jobData) {
        if (!SupabaseClient.isAvailable()) return this.createLocal(jobData);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('jobs')
                .insert(jobData)
                .select()
                .single();

            if (error) throw error;
            console.log('[Jobs] Created job:', data.id);
            this.dispatchEvent('job:created', data);
            return data;
        } catch (e) {
            console.error('[Jobs] Failed to create:', e);
            return null;
        }
    },

    /**
     * Create job from packet
     */
    async createFromPacket(packetId) {
        if (!SupabaseClient.isAvailable()) return null;

        try {
            // Get packet data
            const packet = await SupabaseClient.getPacket(packetId);
            if (!packet) throw new Error('Packet not found');

            // Extract estimate amount from config if available
            let estimatedAmount = null;
            if (packet.config?.estimate?.amount) {
                estimatedAmount = parseFloat(packet.config.estimate.amount);
            }

            const jobData = {
                packet_id: packetId,
                client_id: packet.client_id,
                title: `${packet.product_type || 'Roofing'} - ${packet.customer_name}`,
                address: packet.customer_address,
                estimated_amount: estimatedAmount,
                status: 'pending',
                notes: `Created from packet`
            };

            return await this.create(jobData);
        } catch (e) {
            console.error('[Jobs] Failed to create from packet:', e);
            return null;
        }
    },

    /**
     * Update a job
     */
    async update(id, updates) {
        if (!SupabaseClient.isAvailable()) return this.updateLocal(id, updates);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('jobs')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            console.log('[Jobs] Updated job:', id);
            this.dispatchEvent('job:updated', data);
            return data;
        } catch (e) {
            console.error('[Jobs] Failed to update:', e);
            return null;
        }
    },

    /**
     * Update job status
     */
    async updateStatus(id, status) {
        const updates = { status };

        // Auto-set dates based on status
        if (status === 'in_progress' && !updates.actual_start_date) {
            updates.actual_start_date = new Date().toISOString().split('T')[0];
        }
        if (status === 'completed' && !updates.actual_end_date) {
            updates.actual_end_date = new Date().toISOString().split('T')[0];
        }

        return this.update(id, updates);
    },

    /**
     * Schedule a job
     */
    async schedule(id, date, time = null, crew = []) {
        const updates = {
            scheduled_date: date,
            scheduled_time: time,
            assigned_crew: crew,
            status: 'scheduled'
        };
        return this.update(id, updates);
    },

    /**
     * Assign crew to job
     */
    async assignCrew(id, crewIds) {
        return this.update(id, { assigned_crew: crewIds });
    },

    /**
     * Delete a job
     */
    async delete(id) {
        if (!SupabaseClient.isAvailable()) return this.deleteLocal(id);

        try {
            const { error } = await SupabaseClient.getClient()
                .from('jobs')
                .delete()
                .eq('id', id);

            if (error) throw error;
            console.log('[Jobs] Deleted job:', id);
            this.dispatchEvent('job:deleted', { id });
            return true;
        } catch (e) {
            console.error('[Jobs] Failed to delete:', e);
            return false;
        }
    },

    /**
     * Get jobs for calendar display
     */
    async getForCalendar(startDate, endDate) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('jobs')
                .select(`
                    id, title, status, scheduled_date, scheduled_time,
                    estimated_days, assigned_crew, address,
                    clients (id, name)
                `)
                .gte('scheduled_date', startDate)
                .lte('scheduled_date', endDate)
                .not('status', 'eq', 'cancelled')
                .order('scheduled_date');

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Jobs] Failed to get calendar jobs:', e);
            return [];
        }
    },

    /**
     * Get jobs by status
     */
    async getByStatus(status) {
        return this.list({ status });
    },

    /**
     * Get upcoming jobs
     */
    async getUpcoming(days = 7) {
        const today = new Date().toISOString().split('T')[0];
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        return this.list({
            startDate: today,
            endDate: endDate.toISOString().split('T')[0]
        });
    },

    /**
     * Get job statistics
     */
    async getStats() {
        if (!SupabaseClient.isAvailable()) return this.getLocalStats();

        try {
            const client = SupabaseClient.getClient();

            const [pending, scheduled, inProgress, completed, thisMonth] = await Promise.all([
                client.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
                client.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'scheduled'),
                client.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
                client.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
                client.from('jobs').select('id', { count: 'exact', head: true })
                    .eq('status', 'completed')
                    .gte('actual_end_date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
            ]);

            return {
                pending: pending.count || 0,
                scheduled: scheduled.count || 0,
                inProgress: inProgress.count || 0,
                completed: completed.count || 0,
                completedThisMonth: thisMonth.count || 0
            };
        } catch (e) {
            console.error('[Jobs] Failed to get stats:', e);
            return { pending: 0, scheduled: 0, inProgress: 0, completed: 0, completedThisMonth: 0 };
        }
    },

    // ==================== LOCAL STORAGE FALLBACK ====================

    listLocal(filters = {}) {
        try {
            const data = localStorage.getItem('lava_jobs');
            let jobs = data ? JSON.parse(data) : [];

            if (filters.status) {
                jobs = jobs.filter(j => j.status === filters.status);
            }
            if (filters.clientId) {
                jobs = jobs.filter(j => j.client_id === filters.clientId);
            }

            return jobs;
        } catch (e) {
            return [];
        }
    },

    getLocal(id) {
        const jobs = this.listLocal();
        return jobs.find(j => j.id === id) || null;
    },

    createLocal(jobData) {
        const jobs = this.listLocal();
        const newJob = {
            ...jobData,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            status: jobData.status || 'pending'
        };
        jobs.push(newJob);
        localStorage.setItem('lava_jobs', JSON.stringify(jobs));
        return newJob;
    },

    updateLocal(id, updates) {
        const jobs = this.listLocal();
        const index = jobs.findIndex(j => j.id === id);
        if (index === -1) return null;
        jobs[index] = { ...jobs[index], ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('lava_jobs', JSON.stringify(jobs));
        return jobs[index];
    },

    deleteLocal(id) {
        const jobs = this.listLocal();
        const filtered = jobs.filter(j => j.id !== id);
        localStorage.setItem('lava_jobs', JSON.stringify(filtered));
        return true;
    },

    getLocalStats() {
        const jobs = this.listLocal();
        return {
            pending: jobs.filter(j => j.status === 'pending').length,
            scheduled: jobs.filter(j => j.status === 'scheduled').length,
            inProgress: jobs.filter(j => j.status === 'in_progress').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            completedThisMonth: 0
        };
    },

    // ==================== UI HELPERS ====================

    /**
     * Get status display info
     */
    getStatusInfo(status) {
        const statusMap = {
            'pending': { label: 'Pending', color: '#6b7280', icon: '⏳' },
            'scheduled': { label: 'Scheduled', color: '#3b82f6', icon: '📅' },
            'in_progress': { label: 'In Progress', color: '#f59e0b', icon: '🔨' },
            'completed': { label: 'Completed', color: '#22c55e', icon: '✓' },
            'cancelled': { label: 'Cancelled', color: '#ef4444', icon: '✕' }
        };
        return statusMap[status] || statusMap['pending'];
    },

    /**
     * Format job for display
     */
    formatJob(job) {
        const status = this.getStatusInfo(job.status);
        return {
            ...job,
            statusLabel: status.label,
            statusColor: status.color,
            statusIcon: status.icon,
            formattedDate: job.scheduled_date ?
                new Date(job.scheduled_date).toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                }) : 'Not scheduled',
            clientName: job.clients?.name || job.client_name || 'Unknown Client'
        };
    },

    /**
     * Dispatch custom event
     */
    dispatchEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Jobs;
}
