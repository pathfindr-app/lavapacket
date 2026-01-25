/**
 * LAVA Roofing Portal - Reports Module
 * Analytics and reporting functionality
 */

const Reports = {
    /**
     * Get revenue by month data
     */
    async getRevenueByMonth(months = 12) {
        try {
            const data = [];
            const now = new Date();

            for (let i = months - 1; i >= 0; i--) {
                const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const startDate = date.toISOString().split('T')[0];
                const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0)
                    .toISOString().split('T')[0];

                const jobs = await Jobs.list({
                    startDate,
                    endDate,
                    status: 'completed'
                });

                const revenue = jobs.reduce((sum, j) => sum + (j.estimated_amount || 0), 0);

                data.push({
                    month: date.toLocaleDateString('en-US', { month: 'short' }),
                    year: date.getFullYear(),
                    label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                    revenue,
                    jobs: jobs.length
                });
            }

            return data;
        } catch (e) {
            console.error('[Reports] Failed to get revenue by month:', e);
            return [];
        }
    },

    /**
     * Get jobs by status
     */
    async getJobsByStatus() {
        try {
            const stats = await Jobs.getStats();

            return [
                { status: 'pending', label: 'Pending', count: stats.pending, color: '#6b7280' },
                { status: 'scheduled', label: 'Scheduled', count: stats.scheduled, color: '#3b82f6' },
                { status: 'in_progress', label: 'In Progress', count: stats.inProgress, color: '#f59e0b' },
                { status: 'completed', label: 'Completed', count: stats.completed, color: '#22c55e' }
            ];
        } catch (e) {
            console.error('[Reports] Failed to get jobs by status:', e);
            return [];
        }
    },

    /**
     * Get revenue by product type
     */
    async getRevenueByProduct() {
        try {
            const jobs = await Jobs.list({ status: 'completed' });

            const byProduct = {};
            jobs.forEach(job => {
                const product = this.extractProductType(job.title) || 'Other';
                if (!byProduct[product]) {
                    byProduct[product] = { revenue: 0, count: 0 };
                }
                byProduct[product].revenue += job.estimated_amount || 0;
                byProduct[product].count++;
            });

            const colors = {
                'Standing Seam': '#3b82f6',
                'Shingles': '#22c55e',
                'Brava': '#f59e0b',
                'Other': '#6b7280'
            };

            return Object.entries(byProduct).map(([product, data]) => ({
                product,
                revenue: data.revenue,
                count: data.count,
                color: colors[product] || '#6b7280'
            })).sort((a, b) => b.revenue - a.revenue);
        } catch (e) {
            console.error('[Reports] Failed to get revenue by product:', e);
            return [];
        }
    },

    /**
     * Extract product type from job title
     */
    extractProductType(title) {
        if (!title) return null;
        const lower = title.toLowerCase();
        if (lower.includes('standing seam') || lower.includes('metal')) return 'Standing Seam';
        if (lower.includes('shingle')) return 'Shingles';
        if (lower.includes('brava') || lower.includes('tile')) return 'Brava';
        return 'Other';
    },

    /**
     * Get close rate (packets to signed contracts)
     */
    async getCloseRate() {
        try {
            const [packets, signatures] = await Promise.all([
                SupabaseClient.listPackets(),
                SupabaseClient.isAvailable() ?
                    SupabaseClient.getClient().from('signatures').select('packet_id').then(r => r.data || []) :
                    []
            ]);

            const signedPacketIds = new Set(signatures.map(s => s.packet_id));

            const totalPackets = packets.length;
            const signedPackets = packets.filter(p => signedPacketIds.has(p.id)).length;
            const closeRate = totalPackets > 0 ? (signedPackets / totalPackets * 100) : 0;

            return {
                totalPackets,
                signedPackets,
                unsignedPackets: totalPackets - signedPackets,
                closeRate: Math.round(closeRate * 10) / 10
            };
        } catch (e) {
            console.error('[Reports] Failed to get close rate:', e);
            return { totalPackets: 0, signedPackets: 0, unsignedPackets: 0, closeRate: 0 };
        }
    },

    /**
     * Get crew utilization
     */
    async getCrewUtilization(startDate, endDate) {
        try {
            const [crew, jobs] = await Promise.all([
                Crew.list(),
                Jobs.list({ startDate, endDate })
            ]);

            const completedJobs = jobs.filter(j => j.status === 'completed');

            const utilization = crew.map(member => {
                const memberJobs = completedJobs.filter(j =>
                    j.assigned_crew && j.assigned_crew.includes(member.id)
                );

                const daysWorked = memberJobs.reduce((sum, j) =>
                    sum + (j.estimated_days || 1), 0);

                return {
                    ...member,
                    jobsCompleted: memberJobs.length,
                    daysWorked,
                    utilization: daysWorked // Could calculate against available days
                };
            });

            return utilization.sort((a, b) => b.daysWorked - a.daysWorked);
        } catch (e) {
            console.error('[Reports] Failed to get crew utilization:', e);
            return [];
        }
    },

    /**
     * Get jobs by area/location
     */
    async getJobsByArea() {
        try {
            const jobs = await Jobs.list();

            const byArea = {};
            jobs.forEach(job => {
                const area = this.extractArea(job.address) || 'Other';
                if (!byArea[area]) {
                    byArea[area] = { count: 0, revenue: 0 };
                }
                byArea[area].count++;
                byArea[area].revenue += job.estimated_amount || 0;
            });

            return Object.entries(byArea).map(([area, data]) => ({
                area,
                count: data.count,
                revenue: data.revenue
            })).sort((a, b) => b.count - a.count);
        } catch (e) {
            console.error('[Reports] Failed to get jobs by area:', e);
            return [];
        }
    },

    /**
     * Extract area from address (city/neighborhood)
     */
    extractArea(address) {
        if (!address) return null;

        // Common Hawaii areas - customize for your region
        const areas = [
            'Honolulu', 'Kailua', 'Kaneohe', 'Pearl City', 'Aiea',
            'Mililani', 'Kapolei', 'Ewa Beach', 'Hawaii Kai', 'Waikiki'
        ];

        const lower = address.toLowerCase();
        for (const area of areas) {
            if (lower.includes(area.toLowerCase())) {
                return area;
            }
        }

        return 'Other';
    },

    /**
     * Get comprehensive dashboard stats
     */
    async getDashboardStats() {
        try {
            const [jobStats, costingStats, closeRate] = await Promise.all([
                Jobs.getStats(),
                Costing.getStats(),
                this.getCloseRate()
            ]);

            return {
                jobs: jobStats,
                costing: costingStats,
                closeRate
            };
        } catch (e) {
            console.error('[Reports] Failed to get dashboard stats:', e);
            return null;
        }
    },

    /**
     * Export data to CSV
     */
    exportToCSV(data, filename) {
        if (!data || data.length === 0) return;

        const headers = Object.keys(data[0]);
        const rows = data.map(row =>
            headers.map(h => {
                let val = row[h];
                if (val === null || val === undefined) val = '';
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    val = `"${val.replace(/"/g, '""')}"`;
                }
                return val;
            }).join(',')
        );

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'report.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // ==================== CHART RENDERING ====================

    /**
     * Render a bar chart using pure CSS
     */
    renderBarChart(data, options = {}) {
        const {
            valueKey = 'value',
            labelKey = 'label',
            colorKey = 'color',
            maxValue = null,
            height = 200,
            showValues = true
        } = options;

        const max = maxValue || Math.max(...data.map(d => d[valueKey])) || 1;

        return `
            <div class="bar-chart" style="height: ${height}px">
                ${data.map((item, i) => `
                    <div class="bar-container">
                        <div class="bar-wrapper">
                            ${showValues ? `<span class="bar-value">${this.formatValue(item[valueKey])}</span>` : ''}
                            <div class="bar" style="
                                height: ${(item[valueKey] / max * 100)}%;
                                background: ${item[colorKey] || `hsl(${i * 30}, 70%, 50%)`}
                            "></div>
                        </div>
                        <span class="bar-label">${item[labelKey]}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /**
     * Render a pie/donut chart using pure CSS
     */
    renderPieChart(data, options = {}) {
        const {
            valueKey = 'value',
            labelKey = 'label',
            colorKey = 'color',
            size = 200,
            donut = false
        } = options;

        const total = data.reduce((sum, d) => sum + d[valueKey], 0) || 1;
        let accumulated = 0;

        const segments = data.map((item, i) => {
            const percentage = (item[valueKey] / total) * 100;
            const startAngle = accumulated * 3.6;
            accumulated += percentage;
            const endAngle = accumulated * 3.6;

            return {
                ...item,
                percentage,
                startAngle,
                endAngle,
                color: item[colorKey] || `hsl(${i * 60}, 70%, 50%)`
            };
        });

        // Create conic gradient
        const gradientStops = segments.map((seg, i) => {
            const prevEnd = i > 0 ? segments[i - 1].endAngle : 0;
            return `${seg.color} ${prevEnd}deg ${seg.endAngle}deg`;
        }).join(', ');

        return `
            <div class="pie-chart-container">
                <div class="pie-chart ${donut ? 'donut' : ''}" style="
                    width: ${size}px;
                    height: ${size}px;
                    background: conic-gradient(${gradientStops});
                ">
                    ${donut ? `<div class="donut-hole"></div>` : ''}
                </div>
                <div class="pie-legend">
                    ${segments.map(seg => `
                        <div class="legend-item">
                            <span class="legend-color" style="background: ${seg.color}"></span>
                            <span class="legend-label">${seg[labelKey]}</span>
                            <span class="legend-value">${seg.percentage.toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Render a progress/gauge chart
     */
    renderGauge(value, max, options = {}) {
        const {
            label = '',
            color = '#3b82f6',
            size = 'medium',
            showValue = true,
            format = 'percent'
        } = options;

        const percentage = Math.min((value / max) * 100, 100);
        let displayValue = format === 'percent' ?
            `${percentage.toFixed(0)}%` :
            this.formatValue(value);

        return `
            <div class="gauge ${size}">
                <div class="gauge-track">
                    <div class="gauge-fill" style="width: ${percentage}%; background: ${color}"></div>
                </div>
                ${showValue ? `<div class="gauge-value">${displayValue}</div>` : ''}
                ${label ? `<div class="gauge-label">${label}</div>` : ''}
            </div>
        `;
    },

    /**
     * Render a stat card
     */
    renderStatCard(label, value, options = {}) {
        const {
            icon = '',
            change = null,
            changeLabel = '',
            color = ''
        } = options;

        return `
            <div class="stat-card ${color ? `stat-${color}` : ''}">
                ${icon ? `<div class="stat-icon">${icon}</div>` : ''}
                <div class="stat-content">
                    <div class="stat-value">${this.formatValue(value)}</div>
                    <div class="stat-label">${label}</div>
                    ${change !== null ? `
                        <div class="stat-change ${change >= 0 ? 'positive' : 'negative'}">
                            ${change >= 0 ? '↑' : '↓'} ${Math.abs(change).toFixed(1)}% ${changeLabel}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Format value for display
     */
    formatValue(value) {
        if (typeof value !== 'number') return value;

        if (value >= 1000000) {
            return `$${(value / 1000000).toFixed(1)}M`;
        }
        if (value >= 1000) {
            return `$${(value / 1000).toFixed(1)}K`;
        }
        if (value % 1 !== 0) {
            return value.toFixed(1);
        }
        return value.toString();
    },

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
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Reports;
}
