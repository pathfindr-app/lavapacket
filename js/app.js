/**
 * LAVA Packet Builder - Main Application
 * Orchestrates all modules and handles app initialization
 */

const App = {
    version: '1.0.0',
    isBuilder: false,
    currentProduct: 'standing-seam',

    init() {
        // Determine if we're in builder mode or packet view mode
        this.isBuilder = document.body.classList.contains('builder-mode');

        // Initialize all modules
        this.initModules();

        // Set up UI event handlers
        this.setupEventHandlers();

        // Initialize page visibility
        this.initPageVisibility();

        // Set up product switcher
        this.initProductSwitcher();

        console.log(`LAVA Packet Builder v${this.version} initialized`);
    },

    initModules() {
        // Initialize Supabase first (before Auth and Storage need it)
        if (typeof SupabaseClient !== 'undefined') {
            SupabaseClient.init();
        }

        // Auth module
        if (typeof Auth !== 'undefined') {
            Auth.init();
        }

        // Editor module
        if (typeof Editor !== 'undefined') {
            Editor.init();
        }

        // Photos module
        if (typeof Photos !== 'undefined') {
            Photos.init();
        }

        // Resize module (only in builder mode)
        if (this.isBuilder && typeof Resize !== 'undefined') {
            Resize.init();
        }

        // Estimate module
        if (typeof Estimate !== 'undefined') {
            Estimate.init();
        }

        // EagleView module
        if (typeof EagleView !== 'undefined') {
            EagleView.init();
        }

        // Storage module - load saved data
        if (typeof Storage !== 'undefined') {
            const packetId = this.getPacketId();
            Storage.init(packetId);
        }
    },

    setupEventHandlers() {
        // Toolbar buttons
        const editBtn = document.querySelector('.toolbar-btn.secondary');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.toggleEdit());
        }

        const printBtn = document.querySelector('.toolbar-btn:not(.secondary)');
        if (printBtn) {
            printBtn.addEventListener('click', () => window.print());
        }

        // Sidebar buttons
        const newBtn = document.getElementById('newPacketBtn');
        if (newBtn) {
            newBtn.addEventListener('click', () => this.newPacket());
        }

        const loadBtn = document.getElementById('loadPacketBtn');
        if (loadBtn) {
            loadBtn.addEventListener('click', () => this.showLoadDialog());
        }

        const saveBtn = document.getElementById('savePacketBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => Storage.save());
        }

        const printBuilderBtn = document.getElementById('printPacketBtn');
        if (printBuilderBtn) {
            printBuilderBtn.addEventListener('click', () => window.print());
        }

        // Customer info inputs
        document.querySelectorAll('.customer-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const field = e.target.dataset.field;
                if (field) {
                    Editor.setFieldValue(field, e.target.value);
                }
            });
        });
    },

    initPageVisibility() {
        // Page toggle checkboxes
        document.querySelectorAll('.page-toggle input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const pageId = e.target.dataset.page;
                this.togglePage(pageId, e.target.checked);
            });
        });
    },

    initProductSwitcher() {
        document.querySelectorAll('input[name="product"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.switchProduct(e.target.value);
            });
        });
    },

    toggleEdit() {
        if (typeof Editor !== 'undefined') {
            return Editor.toggle();
        }
        return false;
    },

    togglePage(pageId, visible) {
        const page = document.querySelector(`[data-page-id="${pageId}"]`);
        if (page) {
            page.style.display = visible ? 'block' : 'none';
        }
    },

    switchProduct(productType) {
        this.currentProduct = productType;

        // Hide all product pages
        document.querySelectorAll('.product-page').forEach(page => {
            page.style.display = 'none';
        });

        // Show selected product page
        const selectedPage = document.querySelector(`.product-page[data-product="${productType}"]`);
        if (selectedPage) {
            selectedPage.style.display = 'block';
        }

        // Update section number/title if needed
        this.updateProductHeader(productType);

        // Save
        if (typeof Storage !== 'undefined') {
            Storage.save();
        }
    },

    updateProductHeader(productType) {
        const headers = {
            'standing-seam': 'Why Standing Seam',
            'brava': 'Why Brava',
            'shingles': 'Why Premium Shingles'
        };

        const productHeader = document.querySelector('.product-page:not([style*="display: none"]) .section-title');
        if (productHeader && headers[productType]) {
            productHeader.textContent = headers[productType];
        }
    },

    newPacket() {
        if (confirm('Create a new packet? Any unsaved changes will be lost.')) {
            // Generate new packet ID
            const newId = 'packet-' + Date.now();

            // Clear current data
            if (typeof Storage !== 'undefined') {
                Storage.currentPacketId = newId;
            }

            // Reload the page to reset
            window.location.reload();
        }
    },

    showLoadDialog() {
        // Get list of saved packets
        const packets = Storage.listPackets();

        if (packets.length === 0) {
            Storage.showToast('No saved packets found', 'info');
            return;
        }

        // Create simple dialog
        const dialog = document.createElement('div');
        dialog.className = 'load-dialog';
        dialog.innerHTML = `
            <div class="load-dialog-overlay" onclick="this.parentElement.remove()"></div>
            <div class="load-dialog-content">
                <h3>Load Packet</h3>
                <div class="packet-list">
                    ${packets.map(p => `
                        <div class="packet-item" onclick="App.loadPacket('${p.id}')">
                            <div class="packet-name">${p.customerName}</div>
                            <div class="packet-date">${new Date(p.timestamp).toLocaleDateString()}</div>
                        </div>
                    `).join('')}
                </div>
                <button onclick="this.parentElement.parentElement.remove()">Cancel</button>
            </div>
        `;
        document.body.appendChild(dialog);
    },

    loadPacket(packetId) {
        if (typeof Storage !== 'undefined') {
            Storage.currentPacketId = packetId;
            Storage.load();
        }

        // Remove dialog
        const dialog = document.querySelector('.load-dialog');
        if (dialog) dialog.remove();
    },

    getPacketId() {
        // Get packet ID from URL or generate default
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('packet') || 'default';
    },

    // Utility: Generate unique ID
    generateId() {
        return 'id-' + Math.random().toString(36).substr(2, 9);
    }
};

// Global functions for inline event handlers
function toggleEdit() {
    return App.toggleEdit();
}

function checkPassword() {
    if (typeof Auth !== 'undefined') {
        Auth.checkPassword();
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
}
