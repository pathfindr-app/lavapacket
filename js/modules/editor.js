/**
 * LAVA Packet Builder - Editor Module
 * Handles inline text editing with data-field attributes
 */

const Editor = {
    isEditing: false,
    autoSaveTimeout: null,
    autoSaveDelay: 1000,

    init() {
        // Set up input listener for auto-save
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('editable')) {
                this.scheduleAutoSave();
            }
        });

        // Set cover date
        this.updateCoverDate();
    },

    toggle() {
        this.isEditing = !this.isEditing;

        document.querySelectorAll('.editable').forEach(el => {
            el.contentEditable = this.isEditing;
        });

        // Toggle editing class on packet for CSS hooks
        const packet = document.querySelector('.packet');
        if (packet) {
            packet.classList.toggle('editing', this.isEditing);
        }

        // Update button text
        const editBtn = document.querySelector('.toolbar-btn.secondary');
        if (editBtn) {
            editBtn.textContent = this.isEditing ? 'Done' : 'Edit';
        }

        // Save when exiting edit mode
        if (!this.isEditing) {
            Storage.save();
        }

        return this.isEditing;
    },

    enableEditing() {
        if (!this.isEditing) {
            this.toggle();
        }
    },

    disableEditing() {
        if (this.isEditing) {
            this.toggle();
        }
    },

    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            if (typeof Storage !== 'undefined') {
                Storage.save();
            }
        }, this.autoSaveDelay);
    },

    updateCoverDate() {
        const coverDate = document.getElementById('coverDate');
        if (coverDate) {
            const now = new Date();
            coverDate.textContent = now.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
            });
        }
    },

    getFieldValue(fieldName) {
        // Prefer .editable elements over inputs for getting values
        const editable = document.querySelector(`.editable[data-field="${fieldName}"]`);
        if (editable) {
            return editable.innerHTML;
        }
        const input = document.querySelector(`input[data-field="${fieldName}"]`);
        if (input) {
            return input.value;
        }
        return null;
    },

    setFieldValue(fieldName, value) {
        // Update ALL elements with this data-field (both inputs and editables)
        document.querySelectorAll(`[data-field="${fieldName}"]`).forEach(el => {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = this.stripHtml(value) || '';
            } else {
                // Use innerHTML for editable elements (may contain formatting)
                el.innerHTML = value || '';
            }
        });
    },

    // Strip HTML tags for plain text inputs
    stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    },

    getAllFields() {
        const data = {};
        // Get from editable elements (preserve HTML)
        document.querySelectorAll('.editable[data-field]').forEach(el => {
            data[el.dataset.field] = el.innerHTML;
        });
        // Also get from inputs (plain text, will overwrite if same field)
        document.querySelectorAll('input.customer-input[data-field]').forEach(el => {
            if (el.value) {
                data[el.dataset.field] = el.value;
            }
        });
        return data;
    },

    setAllFields(data) {
        Object.keys(data).forEach(field => {
            this.setFieldValue(field, data[field]);
        });
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Editor;
}
