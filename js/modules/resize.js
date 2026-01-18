/**
 * LAVA Packet Builder - Resize Module
 * Handles photo and container resizing with drag controls
 */

const Resize = {
    activeElement: null,
    activeHandle: null,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
    minWidth: 50,
    minHeight: 50,

    init() {
        // Add mouse event listeners
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // Add touch event listeners for mobile
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Initialize resizable elements
        this.initResizableElements();
    },

    initResizableElements() {
        // Add resize handles to photo containers
        document.querySelectorAll('.photo-resizable').forEach(container => {
            this.addResizeHandles(container);
        });

        // Add resize handles to resizable containers
        document.querySelectorAll('.resizable').forEach(container => {
            this.addContainerResizeHandles(container);
        });
    },

    addResizeHandles(container) {
        const controls = document.createElement('div');
        controls.className = 'photo-resize-controls';
        controls.innerHTML = `
            <div class="photo-resize-overlay"></div>
            <div class="photo-resize-corner nw" data-handle="nw"></div>
            <div class="photo-resize-corner ne" data-handle="ne"></div>
            <div class="photo-resize-corner sw" data-handle="sw"></div>
            <div class="photo-resize-corner se" data-handle="se"></div>
        `;
        container.appendChild(controls);
    },

    addContainerResizeHandles(container) {
        const handleSE = document.createElement('div');
        handleSE.className = 'resize-handle resize-handle-se';
        handleSE.dataset.handle = 'se';
        container.appendChild(handleSE);

        const handleE = document.createElement('div');
        handleE.className = 'resize-handle resize-handle-e';
        handleE.dataset.handle = 'e';
        container.appendChild(handleE);

        const handleS = document.createElement('div');
        handleS.className = 'resize-handle resize-handle-s';
        handleS.dataset.handle = 's';
        container.appendChild(handleS);
    },

    handleMouseDown(e) {
        const handle = e.target.closest('[data-handle]');
        if (!handle) return;

        e.preventDefault();
        this.startResize(e, handle);
    },

    handleTouchStart(e) {
        const touch = e.touches[0];
        const handle = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-handle]');
        if (!handle) return;

        e.preventDefault();
        this.startResize(touch, handle);
    },

    startResize(e, handle) {
        const container = handle.closest('.photo-resizable, .resizable');
        if (!container) return;

        this.activeElement = container;
        this.activeHandle = handle.dataset.handle;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startWidth = container.offsetWidth;
        this.startHeight = container.offsetHeight;

        container.classList.add('active');
        document.body.style.cursor = this.getCursor(this.activeHandle);
    },

    handleMouseMove(e) {
        if (!this.activeElement) return;
        this.doResize(e);
    },

    handleTouchMove(e) {
        if (!this.activeElement) return;
        e.preventDefault();
        this.doResize(e.touches[0]);
    },

    doResize(e) {
        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;

        let newWidth = this.startWidth;
        let newHeight = this.startHeight;

        switch (this.activeHandle) {
            case 'se':
                newWidth = Math.max(this.minWidth, this.startWidth + deltaX);
                newHeight = Math.max(this.minHeight, this.startHeight + deltaY);
                break;
            case 'e':
                newWidth = Math.max(this.minWidth, this.startWidth + deltaX);
                break;
            case 's':
                newHeight = Math.max(this.minHeight, this.startHeight + deltaY);
                break;
            case 'ne':
                newWidth = Math.max(this.minWidth, this.startWidth + deltaX);
                newHeight = Math.max(this.minHeight, this.startHeight - deltaY);
                break;
            case 'nw':
                newWidth = Math.max(this.minWidth, this.startWidth - deltaX);
                newHeight = Math.max(this.minHeight, this.startHeight - deltaY);
                break;
            case 'sw':
                newWidth = Math.max(this.minWidth, this.startWidth - deltaX);
                newHeight = Math.max(this.minHeight, this.startHeight + deltaY);
                break;
        }

        // Apply new dimensions
        this.activeElement.style.width = `${newWidth}px`;
        this.activeElement.style.height = `${newHeight}px`;

        // If it's a photo container, also resize the image
        const img = this.activeElement.querySelector('img');
        if (img) {
            img.style.width = '100%';
            img.style.height = '100%';
        }
    },

    handleMouseUp() {
        this.endResize();
    },

    handleTouchEnd() {
        this.endResize();
    },

    endResize() {
        if (this.activeElement) {
            this.activeElement.classList.remove('active');

            // Save the new dimensions
            const id = this.activeElement.id || this.activeElement.dataset.resizeId;
            if (id && typeof Storage !== 'undefined') {
                Storage.save();
            }
        }

        this.activeElement = null;
        this.activeHandle = null;
        document.body.style.cursor = '';
    },

    getCursor(handle) {
        const cursors = {
            'se': 'se-resize',
            'sw': 'sw-resize',
            'ne': 'ne-resize',
            'nw': 'nw-resize',
            'e': 'e-resize',
            'w': 'w-resize',
            'n': 'n-resize',
            's': 's-resize'
        };
        return cursors[handle] || 'default';
    },

    // Set element dimensions programmatically
    setDimensions(element, width, height) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        if (!element) return;

        if (width) element.style.width = `${width}px`;
        if (height) element.style.height = `${height}px`;
    },

    // Get element dimensions
    getDimensions(element) {
        if (typeof element === 'string') {
            element = document.getElementById(element);
        }
        if (!element) return null;

        return {
            width: element.offsetWidth,
            height: element.offsetHeight
        };
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Resize;
}
