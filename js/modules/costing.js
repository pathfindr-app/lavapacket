/**
 * LAVA Roofing Portal - Job Costing Module
 * Handles job profitability analysis and cost tracking
 */

const Costing = {
    /**
     * Get complete job cost analysis
     */
    async getJobAnalysis(jobId) {
        try {
            // Get job with summary (includes totals from view)
            const job = await Jobs.get(jobId);
            if (!job) return null;

            // Get expenses breakdown
            const expenses = await Expenses.listForJob(jobId);

            // Calculate totals by category
            const byCategory = {};
            Expenses.categories.forEach(cat => {
                byCategory[cat.value] = {
                    ...cat,
                    total: 0,
                    items: []
                };
            });

            expenses.forEach(exp => {
                const amount = exp.amount || (exp.unit_cost * exp.quantity);
                if (byCategory[exp.category]) {
                    byCategory[exp.category].total += amount;
                    byCategory[exp.category].items.push(exp);
                }
            });

            // Calculate profit metrics
            const estimatedAmount = job.estimated_amount || 0;
            const totalExpenses = job.total_expenses || expenses.reduce((sum, e) =>
                sum + (e.amount || e.unit_cost * e.quantity), 0);

            const profit = estimatedAmount - totalExpenses;
            const profitMargin = estimatedAmount > 0 ?
                ((profit / estimatedAmount) * 100) : 0;

            // Calculate labor hours
            const laborExpenses = byCategory['labor'].items;
            const totalLaborHours = laborExpenses.reduce((sum, e) =>
                e.unit === 'hour' ? sum + (e.quantity || 0) : sum, 0);
            const totalLaborDays = laborExpenses.reduce((sum, e) =>
                e.unit === 'day' ? sum + (e.quantity || 0) : sum, 0);

            return {
                job,
                estimatedAmount,
                totalExpenses,
                profit,
                profitMargin: Math.round(profitMargin * 10) / 10,
                byCategory,
                expenses,
                labor: {
                    hours: totalLaborHours,
                    days: totalLaborDays,
                    cost: byCategory['labor'].total
                },
                materials: {
                    cost: byCategory['material'].total,
                    items: byCategory['material'].items.length
                },
                isProfitable: profit >= 0,
                status: this.getProfitabilityStatus(profitMargin)
            };
        } catch (e) {
            console.error('[Costing] Failed to get job analysis:', e);
            return null;
        }
    },

    /**
     * Get profitability status
     */
    getProfitabilityStatus(margin) {
        if (margin >= 30) return { label: 'Excellent', color: '#22c55e', level: 'excellent' };
        if (margin >= 20) return { label: 'Good', color: '#84cc16', level: 'good' };
        if (margin >= 10) return { label: 'Fair', color: '#f59e0b', level: 'fair' };
        if (margin >= 0) return { label: 'Low', color: '#f97316', level: 'low' };
        return { label: 'Loss', color: '#ef4444', level: 'loss' };
    },

    /**
     * Get cost comparison across multiple jobs
     */
    async getJobComparison(jobIds) {
        const analyses = await Promise.all(
            jobIds.map(id => this.getJobAnalysis(id))
        );

        return analyses.filter(Boolean).map(a => ({
            id: a.job.id,
            title: a.job.title,
            client: a.job.client_name,
            address: a.job.address,
            status: a.job.status,
            estimatedAmount: a.estimatedAmount,
            totalExpenses: a.totalExpenses,
            profit: a.profit,
            profitMargin: a.profitMargin,
            profitabilityStatus: a.status
        }));
    },

    /**
     * Get aggregated costing statistics
     */
    async getStats(filters = {}) {
        try {
            let jobs;
            if (filters.startDate && filters.endDate) {
                jobs = await Jobs.list({
                    startDate: filters.startDate,
                    endDate: filters.endDate
                });
            } else {
                jobs = await Jobs.list({ status: 'completed' });
            }

            const analyses = await Promise.all(
                jobs.map(j => this.getJobAnalysis(j.id))
            );

            const validAnalyses = analyses.filter(Boolean);

            if (validAnalyses.length === 0) {
                return {
                    totalJobs: 0,
                    totalRevenue: 0,
                    totalExpenses: 0,
                    totalProfit: 0,
                    avgProfitMargin: 0,
                    avgJobValue: 0,
                    byCategory: {},
                    profitableJobs: 0,
                    unprofitableJobs: 0
                };
            }

            const totalRevenue = validAnalyses.reduce((sum, a) => sum + a.estimatedAmount, 0);
            const totalExpenses = validAnalyses.reduce((sum, a) => sum + a.totalExpenses, 0);
            const totalProfit = validAnalyses.reduce((sum, a) => sum + a.profit, 0);

            // Aggregate by category
            const byCategory = {};
            Expenses.categories.forEach(cat => {
                byCategory[cat.value] = validAnalyses.reduce((sum, a) =>
                    sum + (a.byCategory[cat.value]?.total || 0), 0);
            });

            return {
                totalJobs: validAnalyses.length,
                totalRevenue,
                totalExpenses,
                totalProfit,
                avgProfitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0,
                avgJobValue: totalRevenue / validAnalyses.length,
                byCategory,
                profitableJobs: validAnalyses.filter(a => a.profit >= 0).length,
                unprofitableJobs: validAnalyses.filter(a => a.profit < 0).length,
                excellentMarginJobs: validAnalyses.filter(a => a.profitMargin >= 30).length,
                lowMarginJobs: validAnalyses.filter(a => a.profitMargin < 10 && a.profitMargin >= 0).length
            };
        } catch (e) {
            console.error('[Costing] Failed to get stats:', e);
            return null;
        }
    },

    /**
     * Get monthly profit trends
     */
    async getMonthlyTrends(months = 6) {
        try {
            const trends = [];
            const now = new Date();

            for (let i = months - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const startDate = date.toISOString().split('T')[0];
                const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0)
                    .toISOString().split('T')[0];

                const stats = await this.getStats({ startDate, endDate });

                trends.push({
                    month: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                    revenue: stats.totalRevenue,
                    expenses: stats.totalExpenses,
                    profit: stats.totalProfit,
                    margin: stats.avgProfitMargin,
                    jobs: stats.totalJobs
                });
            }

            return trends;
        } catch (e) {
            console.error('[Costing] Failed to get trends:', e);
            return [];
        }
    },

    /**
     * Estimate job cost based on similar jobs
     */
    async estimateJobCost(productType, squareFootage) {
        try {
            // Get completed jobs with similar product type
            const jobs = await Jobs.list({ status: 'completed' });

            // Filter by product type and get cost per sqft averages
            const analyses = await Promise.all(
                jobs.map(j => this.getJobAnalysis(j.id))
            );

            const similarJobs = analyses.filter(a =>
                a && a.job.title?.toLowerCase().includes(productType.toLowerCase())
            );

            if (similarJobs.length === 0) {
                // Return default estimates
                return this.getDefaultEstimates(productType, squareFootage);
            }

            // Calculate average costs
            const avgMaterialCostPerJob = similarJobs.reduce((sum, j) =>
                sum + j.byCategory['material'].total, 0) / similarJobs.length;
            const avgLaborCostPerJob = similarJobs.reduce((sum, j) =>
                sum + j.byCategory['labor'].total, 0) / similarJobs.length;
            const avgOtherCosts = similarJobs.reduce((sum, j) =>
                sum + j.byCategory['equipment'].total +
                j.byCategory['permit'].total +
                j.byCategory['subcontractor'].total, 0) / similarJobs.length;

            const avgTotalExpenses = avgMaterialCostPerJob + avgLaborCostPerJob + avgOtherCosts;
            const avgProfitMargin = similarJobs.reduce((sum, j) =>
                sum + j.profitMargin, 0) / similarJobs.length;

            // Project for this job
            const estimatedExpenses = avgTotalExpenses; // Could scale by sqft if we tracked it
            const suggestedPrice = estimatedExpenses / (1 - (avgProfitMargin / 100));

            return {
                basedOn: similarJobs.length,
                estimatedMaterials: avgMaterialCostPerJob,
                estimatedLabor: avgLaborCostPerJob,
                estimatedOther: avgOtherCosts,
                estimatedTotal: avgTotalExpenses,
                avgMargin: avgProfitMargin,
                suggestedPrice,
                suggestedProfit: suggestedPrice - avgTotalExpenses
            };
        } catch (e) {
            console.error('[Costing] Failed to estimate:', e);
            return null;
        }
    },

    /**
     * Get default cost estimates
     */
    getDefaultEstimates(productType, squareFootage) {
        const sqft = squareFootage || 2000;

        const defaults = {
            'standing seam': {
                materialPerSqft: 8.50,
                laborPerSqft: 4.50,
                otherFixed: 1500,
                marginTarget: 25
            },
            'shingles': {
                materialPerSqft: 3.50,
                laborPerSqft: 2.50,
                otherFixed: 1000,
                marginTarget: 30
            },
            'brava': {
                materialPerSqft: 12.00,
                laborPerSqft: 5.00,
                otherFixed: 1500,
                marginTarget: 25
            },
            'default': {
                materialPerSqft: 6.00,
                laborPerSqft: 3.50,
                otherFixed: 1200,
                marginTarget: 25
            }
        };

        const type = productType?.toLowerCase() || 'default';
        const rates = defaults[type] || defaults['default'];

        const materials = rates.materialPerSqft * sqft;
        const labor = rates.laborPerSqft * sqft;
        const other = rates.otherFixed;
        const total = materials + labor + other;
        const price = total / (1 - (rates.marginTarget / 100));

        return {
            basedOn: 0,
            estimatedMaterials: materials,
            estimatedLabor: labor,
            estimatedOther: other,
            estimatedTotal: total,
            avgMargin: rates.marginTarget,
            suggestedPrice: price,
            suggestedProfit: price - total
        };
    },

    // ==================== UI HELPERS ====================

    /**
     * Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    },

    /**
     * Render job costing card
     */
    renderCostingCard(analysis) {
        if (!analysis) return '<div class="costing-card empty">No data available</div>';

        const status = analysis.status;

        return `
            <div class="costing-card">
                <div class="costing-header">
                    <h3>${analysis.job.title || 'Job'}</h3>
                    <span class="profitability-badge" style="background: ${status.color}">
                        ${status.label}
                    </span>
                </div>

                <div class="costing-summary">
                    <div class="costing-metric">
                        <span class="metric-label">Estimated</span>
                        <span class="metric-value">${this.formatCurrency(analysis.estimatedAmount)}</span>
                    </div>
                    <div class="costing-metric">
                        <span class="metric-label">Expenses</span>
                        <span class="metric-value expense">${this.formatCurrency(analysis.totalExpenses)}</span>
                    </div>
                    <div class="costing-metric ${analysis.profit >= 0 ? 'positive' : 'negative'}">
                        <span class="metric-label">Profit</span>
                        <span class="metric-value">${this.formatCurrency(analysis.profit)}</span>
                    </div>
                    <div class="costing-metric">
                        <span class="metric-label">Margin</span>
                        <span class="metric-value">${analysis.profitMargin.toFixed(1)}%</span>
                    </div>
                </div>

                <div class="costing-breakdown">
                    <h4>Expense Breakdown</h4>
                    ${Object.values(analysis.byCategory).map(cat => `
                        <div class="breakdown-row">
                            <span class="breakdown-label">${cat.icon} ${cat.label}</span>
                            <span class="breakdown-value">${this.formatCurrency(cat.total)}</span>
                            <div class="breakdown-bar">
                                <div class="breakdown-fill" style="width: ${analysis.totalExpenses > 0 ?
                                    (cat.total / analysis.totalExpenses * 100) : 0}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Costing;
}
