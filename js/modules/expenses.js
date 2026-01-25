/**
 * LAVA Roofing Portal - Expenses Module
 * Handles expense tracking for jobs
 */

const Expenses = {
    categories: [
        { value: 'material', label: 'Materials', icon: '📦' },
        { value: 'labor', label: 'Labor', icon: '👷' },
        { value: 'equipment', label: 'Equipment', icon: '🔧' },
        { value: 'permit', label: 'Permits', icon: '📋' },
        { value: 'subcontractor', label: 'Subcontractor', icon: '🏢' },
        { value: 'other', label: 'Other', icon: '📝' }
    ],

    units: [
        { value: 'each', label: 'Each' },
        { value: 'sqft', label: 'Sq Ft' },
        { value: 'lnft', label: 'Lin Ft' },
        { value: 'hour', label: 'Hour' },
        { value: 'day', label: 'Day' },
        { value: 'bundle', label: 'Bundle' },
        { value: 'box', label: 'Box' },
        { value: 'tube', label: 'Tube' },
        { value: 'week', label: 'Week' }
    ],

    /**
     * List expenses for a job
     */
    async listForJob(jobId) {
        if (!SupabaseClient.isAvailable()) return this.listLocal(jobId);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('expenses')
                .select('*')
                .eq('job_id', jobId)
                .order('date', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Expenses] Failed to list:', e);
            return [];
        }
    },

    /**
     * Get expense by ID
     */
    async get(id) {
        if (!SupabaseClient.isAvailable()) return this.getLocal(id);

        try {
            const { data, error } = await SupabaseClient.getClient()
                .from('expenses')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (e) {
            console.error('[Expenses] Failed to get:', e);
            return null;
        }
    },

    /**
     * Create a new expense
     */
    async create(expenseData) {
        if (!SupabaseClient.isAvailable()) return this.createLocal(expenseData);

        try {
            // Calculate total amount if unit_cost provided
            if (expenseData.unit_cost && expenseData.quantity) {
                expenseData.amount = expenseData.unit_cost * expenseData.quantity;
            }

            const { data, error } = await SupabaseClient.getClient()
                .from('expenses')
                .insert(expenseData)
                .select()
                .single();

            if (error) throw error;
            console.log('[Expenses] Created expense:', data.id);
            this.dispatchEvent('expense:created', data);
            return data;
        } catch (e) {
            console.error('[Expenses] Failed to create:', e);
            return null;
        }
    },

    /**
     * Update an expense
     */
    async update(id, updates) {
        if (!SupabaseClient.isAvailable()) return this.updateLocal(id, updates);

        try {
            // Recalculate amount if needed
            if (updates.unit_cost !== undefined || updates.quantity !== undefined) {
                const current = await this.get(id);
                const unitCost = updates.unit_cost !== undefined ? updates.unit_cost : current.unit_cost;
                const quantity = updates.quantity !== undefined ? updates.quantity : current.quantity;
                if (unitCost && quantity) {
                    updates.amount = unitCost * quantity;
                }
            }

            const { data, error } = await SupabaseClient.getClient()
                .from('expenses')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            console.log('[Expenses] Updated expense:', id);
            this.dispatchEvent('expense:updated', data);
            return data;
        } catch (e) {
            console.error('[Expenses] Failed to update:', e);
            return null;
        }
    },

    /**
     * Delete an expense
     */
    async delete(id) {
        if (!SupabaseClient.isAvailable()) return this.deleteLocal(id);

        try {
            const { error } = await SupabaseClient.getClient()
                .from('expenses')
                .delete()
                .eq('id', id);

            if (error) throw error;
            console.log('[Expenses] Deleted expense:', id);
            this.dispatchEvent('expense:deleted', { id });
            return true;
        } catch (e) {
            console.error('[Expenses] Failed to delete:', e);
            return false;
        }
    },

    /**
     * Get job expense totals
     */
    async getTotalsForJob(jobId) {
        const expenses = await this.listForJob(jobId);

        const totals = {
            total: 0,
            byCategory: {}
        };

        this.categories.forEach(cat => {
            totals.byCategory[cat.value] = 0;
        });

        expenses.forEach(exp => {
            const amount = exp.amount * (exp.quantity || 1);
            totals.total += amount;
            if (totals.byCategory[exp.category] !== undefined) {
                totals.byCategory[exp.category] += amount;
            }
        });

        return totals;
    },

    /**
     * Get material presets
     */
    async getPresets(category = null) {
        if (!SupabaseClient.isAvailable()) return this.getLocalPresets();

        try {
            let query = SupabaseClient.getClient()
                .from('material_presets')
                .select('*')
                .order('name');

            if (category) {
                query = query.eq('category', category);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        } catch (e) {
            console.error('[Expenses] Failed to get presets:', e);
            return [];
        }
    },

    /**
     * Create expense from preset
     */
    async createFromPreset(jobId, presetId, quantity = 1) {
        const presets = await this.getPresets();
        const preset = presets.find(p => p.id === presetId);

        if (!preset) return null;

        return this.create({
            job_id: jobId,
            category: preset.category,
            description: preset.name,
            unit: preset.unit,
            unit_cost: preset.default_cost,
            quantity: quantity,
            amount: preset.default_cost * quantity,
            date: new Date().toISOString().split('T')[0]
        });
    },

    /**
     * Upload receipt
     */
    async uploadReceipt(expenseId, file) {
        if (!SupabaseClient.isAvailable()) return null;

        try {
            const path = `receipts/${expenseId}/${file.name}`;

            const { error: uploadError } = await SupabaseClient.getClient().storage
                .from('photos')
                .upload(path, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = SupabaseClient.getClient().storage
                .from('photos')
                .getPublicUrl(path);

            // Update expense with receipt URL
            await this.update(expenseId, { receipt_url: urlData.publicUrl });

            return urlData.publicUrl;
        } catch (e) {
            console.error('[Expenses] Failed to upload receipt:', e);
            return null;
        }
    },

    // ==================== LOCAL STORAGE FALLBACK ====================

    listLocal(jobId) {
        try {
            const data = localStorage.getItem('lava_expenses');
            const expenses = data ? JSON.parse(data) : [];
            return expenses.filter(e => e.job_id === jobId);
        } catch (e) {
            return [];
        }
    },

    getLocal(id) {
        try {
            const data = localStorage.getItem('lava_expenses');
            const expenses = data ? JSON.parse(data) : [];
            return expenses.find(e => e.id === id) || null;
        } catch (e) {
            return null;
        }
    },

    createLocal(expenseData) {
        try {
            const data = localStorage.getItem('lava_expenses');
            const expenses = data ? JSON.parse(data) : [];
            const newExpense = {
                ...expenseData,
                id: crypto.randomUUID(),
                created_at: new Date().toISOString()
            };
            expenses.push(newExpense);
            localStorage.setItem('lava_expenses', JSON.stringify(expenses));
            return newExpense;
        } catch (e) {
            return null;
        }
    },

    updateLocal(id, updates) {
        try {
            const data = localStorage.getItem('lava_expenses');
            const expenses = data ? JSON.parse(data) : [];
            const index = expenses.findIndex(e => e.id === id);
            if (index === -1) return null;
            expenses[index] = { ...expenses[index], ...updates };
            localStorage.setItem('lava_expenses', JSON.stringify(expenses));
            return expenses[index];
        } catch (e) {
            return null;
        }
    },

    deleteLocal(id) {
        try {
            const data = localStorage.getItem('lava_expenses');
            const expenses = data ? JSON.parse(data) : [];
            const filtered = expenses.filter(e => e.id !== id);
            localStorage.setItem('lava_expenses', JSON.stringify(filtered));
            return true;
        } catch (e) {
            return false;
        }
    },

    getLocalPresets() {
        return [
            { id: '1', name: 'Standing Seam Panel (24ga)', category: 'material', unit: 'sqft', default_cost: 8.50 },
            { id: '2', name: 'Underlayment (synthetic)', category: 'material', unit: 'sqft', default_cost: 0.35 },
            { id: '3', name: 'Ice & Water Shield', category: 'material', unit: 'sqft', default_cost: 1.25 },
            { id: '4', name: 'Ridge Cap', category: 'material', unit: 'lnft', default_cost: 12.00 },
            { id: '5', name: 'Flashing (aluminum)', category: 'material', unit: 'lnft', default_cost: 4.50 },
            { id: '6', name: 'Shingle Bundle', category: 'material', unit: 'bundle', default_cost: 35.00 },
            { id: '7', name: 'Dumpster Rental', category: 'equipment', unit: 'day', default_cost: 450.00 },
            { id: '8', name: 'Permit Fee', category: 'permit', unit: 'each', default_cost: 350.00 }
        ];
    },

    // ==================== UI HELPERS ====================

    /**
     * Get category info
     */
    getCategoryInfo(category) {
        return this.categories.find(c => c.value === category) || this.categories[5];
    },

    /**
     * Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    },

    /**
     * Dispatch custom event
     */
    dispatchEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    },

    /**
     * Show quick add expense dialog
     */
    showQuickAddDialog(jobId, onAdd) {
        document.querySelector('.expense-dialog')?.remove();

        const dialog = document.createElement('div');
        dialog.className = 'expense-dialog';

        this.getPresets().then(presets => {
            dialog.innerHTML = `
                <div class="dialog-backdrop"></div>
                <div class="dialog-content">
                    <div class="dialog-header">
                        <h3>Add Expense</h3>
                        <button class="dialog-close">&times;</button>
                    </div>
                    <form class="expense-form" id="expenseForm">
                        <div class="form-tabs">
                            <button type="button" class="form-tab active" data-tab="quick">Quick Add</button>
                            <button type="button" class="form-tab" data-tab="custom">Custom</button>
                        </div>

                        <div class="form-tab-content" id="quickTab">
                            <div class="form-group">
                                <label>Select Material</label>
                                <select name="preset" class="form-input">
                                    <option value="">Choose a preset...</option>
                                    ${presets.map(p => `
                                        <option value="${p.id}" data-cost="${p.default_cost}" data-unit="${p.unit}">
                                            ${p.name} - ${this.formatCurrency(p.default_cost)}/${p.unit}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Quantity</label>
                                <input type="number" name="preset_quantity" class="form-input" value="1" min="0" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>Total</label>
                                <div class="preset-total">$0.00</div>
                            </div>
                        </div>

                        <div class="form-tab-content hidden" id="customTab">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Category</label>
                                    <select name="category" class="form-input">
                                        ${this.categories.map(c => `
                                            <option value="${c.value}">${c.icon} ${c.label}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Date</label>
                                    <input type="date" name="date" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Description</label>
                                <input type="text" name="description" class="form-input" placeholder="What was purchased?">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Quantity</label>
                                    <input type="number" name="quantity" class="form-input" value="1" min="0" step="0.1">
                                </div>
                                <div class="form-group">
                                    <label>Unit</label>
                                    <select name="unit" class="form-input">
                                        ${this.units.map(u => `
                                            <option value="${u.value}">${u.label}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Unit Cost</label>
                                    <input type="number" name="unit_cost" class="form-input" placeholder="0.00" min="0" step="0.01">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Vendor</label>
                                <input type="text" name="vendor" class="form-input" placeholder="Where was it purchased?">
                            </div>
                        </div>

                        <div class="dialog-actions">
                            <button type="button" class="btn btn-secondary dialog-cancel">Cancel</button>
                            <button type="submit" class="btn btn-primary">Add Expense</button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(dialog);

            // Tab switching
            dialog.querySelectorAll('.form-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    dialog.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    dialog.querySelector('#quickTab').classList.toggle('hidden', tab.dataset.tab !== 'quick');
                    dialog.querySelector('#customTab').classList.toggle('hidden', tab.dataset.tab !== 'custom');
                });
            });

            // Preset total calculation
            const presetSelect = dialog.querySelector('[name="preset"]');
            const presetQty = dialog.querySelector('[name="preset_quantity"]');
            const presetTotal = dialog.querySelector('.preset-total');

            const updateTotal = () => {
                const option = presetSelect.selectedOptions[0];
                const cost = parseFloat(option?.dataset?.cost) || 0;
                const qty = parseFloat(presetQty.value) || 0;
                presetTotal.textContent = this.formatCurrency(cost * qty);
            };

            presetSelect.addEventListener('change', updateTotal);
            presetQty.addEventListener('input', updateTotal);

            // Close handlers
            dialog.querySelector('.dialog-backdrop').addEventListener('click', () => dialog.remove());
            dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.remove());
            dialog.querySelector('.dialog-cancel').addEventListener('click', () => dialog.remove());

            // Form submit
            dialog.querySelector('#expenseForm').addEventListener('submit', async (e) => {
                e.preventDefault();

                const activeTab = dialog.querySelector('.form-tab.active').dataset.tab;

                let expense;
                if (activeTab === 'quick') {
                    const presetId = presetSelect.value;
                    const quantity = parseFloat(presetQty.value) || 1;
                    expense = await this.createFromPreset(jobId, presetId, quantity);
                } else {
                    const form = e.target;
                    expense = await this.create({
                        job_id: jobId,
                        category: form.category.value,
                        description: form.description.value,
                        quantity: parseFloat(form.quantity.value) || 1,
                        unit: form.unit.value,
                        unit_cost: parseFloat(form.unit_cost.value) || 0,
                        amount: (parseFloat(form.quantity.value) || 1) * (parseFloat(form.unit_cost.value) || 0),
                        vendor: form.vendor.value,
                        date: form.date.value
                    });
                }

                if (expense && onAdd) {
                    onAdd(expense);
                }
                dialog.remove();
            });
        });
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Expenses;
}
