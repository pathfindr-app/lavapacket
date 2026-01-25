/**
 * LAVA Roofing Portal - Calendar Module
 * Custom calendar UI for job scheduling
 */

const Calendar = {
    currentDate: new Date(),
    currentView: 'month', // 'month', 'week', 'day'
    jobs: [],
    crew: [],
    clients: [],
    selectedCrew: null, // null = all crew
    container: null,
    onJobClick: null,
    onDateClick: null,
    onJobDrop: null,
    onEventCreate: null,
    addEventModal: null,

    /**
     * Initialize calendar in a container
     */
    init(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('[Calendar] Container not found:', containerId);
            return;
        }

        this.onJobClick = options.onJobClick || null;
        this.onDateClick = options.onDateClick || null;
        this.onJobDrop = options.onJobDrop || null;
        this.onEventCreate = options.onEventCreate || null;

        this.render();
        this.createAddEventModal();
        this.loadData();
    },

    /**
     * Load jobs, crew, and clients data
     */
    async loadData() {
        const { startDate, endDate } = this.getDateRange();

        // Load jobs, crew, and clients in parallel
        const [jobs, crew, clients] = await Promise.all([
            typeof Jobs !== 'undefined' ? Jobs.getForCalendar(startDate, endDate) : [],
            typeof Crew !== 'undefined' ? Crew.list() : [],
            typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()
                ? SupabaseClient.listClients()
                : this.getLocalClients()
        ]);

        this.jobs = jobs;
        this.crew = crew;
        this.clients = clients;
        this.renderCalendarContent();
    },

    /**
     * Get clients from localStorage as fallback
     */
    getLocalClients() {
        const clients = [];
        // Check local clients storage
        try {
            const localClients = JSON.parse(localStorage.getItem('lavaClients') || '[]');
            clients.push(...localClients);
        } catch (e) {}
        // Check packets for customer names
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('lavaPacketBuilder_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    const name = data.customer_name || '';
                    const address = data.customer_address || '';
                    if (name && !clients.find(c => c.name === name)) {
                        clients.push({ id: key, name, address });
                    }
                } catch (e) {}
            }
        }
        return clients;
    },

    /**
     * Get date range for current view
     */
    getDateRange() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        if (this.currentView === 'month') {
            // Get first day of month's week and last day of month's week
            const firstDay = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0);

            // Adjust to include full weeks
            const startDate = new Date(firstDay);
            startDate.setDate(startDate.getDate() - startDate.getDay());

            const endDate = new Date(lastDay);
            endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

            return {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            };
        } else if (this.currentView === 'week') {
            const startDate = new Date(this.currentDate);
            startDate.setDate(startDate.getDate() - startDate.getDay());

            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);

            return {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            };
        } else {
            // Day view
            return {
                startDate: this.currentDate.toISOString().split('T')[0],
                endDate: this.currentDate.toISOString().split('T')[0]
            };
        }
    },

    /**
     * Render the full calendar
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="calendar">
                <div class="calendar-header">
                    <div class="calendar-nav">
                        <button class="calendar-btn" data-action="prev">&lt;</button>
                        <button class="calendar-btn" data-action="today">Today</button>
                        <button class="calendar-btn" data-action="next">&gt;</button>
                    </div>
                    <h2 class="calendar-title"></h2>
                    <div class="calendar-views">
                        <button class="calendar-view-btn ${this.currentView === 'month' ? 'active' : ''}" data-view="month">Month</button>
                        <button class="calendar-view-btn ${this.currentView === 'week' ? 'active' : ''}" data-view="week">Week</button>
                        <button class="calendar-view-btn ${this.currentView === 'day' ? 'active' : ''}" data-view="day">Day</button>
                    </div>
                </div>
                <div class="calendar-crew-filter">
                    <button class="crew-filter-btn active" data-crew="all">All Crew</button>
                </div>
                <div class="calendar-body">
                    <div class="calendar-loading">Loading...</div>
                </div>
            </div>
        `;

        this.setupEventListeners();
        this.updateTitle();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Navigation
        this.container.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'prev') this.prev();
                else if (action === 'next') this.next();
                else if (action === 'today') this.goToToday();
            });
        });

        // View switching
        this.container.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setView(e.target.dataset.view);
            });
        });

        // Crew filter
        this.container.querySelector('.calendar-crew-filter').addEventListener('click', (e) => {
            if (e.target.matches('.crew-filter-btn')) {
                this.container.querySelectorAll('.crew-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.selectedCrew = e.target.dataset.crew === 'all' ? null : e.target.dataset.crew;
                this.renderCalendarContent();
            }
        });
    },

    /**
     * Update the title based on current view/date
     */
    updateTitle() {
        const titleEl = this.container.querySelector('.calendar-title');
        if (!titleEl) return;

        const options = { year: 'numeric', month: 'long' };

        if (this.currentView === 'day') {
            options.day = 'numeric';
            options.weekday = 'long';
        } else if (this.currentView === 'week') {
            const startOfWeek = new Date(this.currentDate);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);

            const startMonth = startOfWeek.toLocaleDateString('en-US', { month: 'short' });
            const endMonth = endOfWeek.toLocaleDateString('en-US', { month: 'short' });

            if (startMonth === endMonth) {
                titleEl.textContent = `${startMonth} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
            } else {
                titleEl.textContent = `${startMonth} ${startOfWeek.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
            }
            return;
        }

        titleEl.textContent = this.currentDate.toLocaleDateString('en-US', options);
    },

    /**
     * Render crew filter buttons
     */
    renderCrewFilter() {
        const filterContainer = this.container.querySelector('.calendar-crew-filter');
        if (!filterContainer || this.crew.length === 0) return;

        filterContainer.innerHTML = `
            <button class="crew-filter-btn ${!this.selectedCrew ? 'active' : ''}" data-crew="all">All Crew</button>
            ${this.crew.map(member => `
                <button class="crew-filter-btn ${this.selectedCrew === member.id ? 'active' : ''}"
                    data-crew="${member.id}"
                    style="--crew-color: ${member.color}">
                    <span class="crew-dot" style="background: ${member.color}"></span>
                    ${member.name.split(' ')[0]}
                </button>
            `).join('')}
        `;
    },

    /**
     * Render the calendar content based on view
     */
    renderCalendarContent() {
        const body = this.container.querySelector('.calendar-body');
        if (!body) return;

        // Render crew filter
        this.renderCrewFilter();

        // Filter jobs by selected crew
        let filteredJobs = this.jobs;
        if (this.selectedCrew) {
            filteredJobs = this.jobs.filter(job =>
                job.assigned_crew && job.assigned_crew.includes(this.selectedCrew)
            );
        }

        if (this.currentView === 'month') {
            body.innerHTML = this.renderMonthView(filteredJobs);
        } else if (this.currentView === 'week') {
            body.innerHTML = this.renderWeekView(filteredJobs);
        } else {
            body.innerHTML = this.renderDayView(filteredJobs);
        }

        this.setupCalendarInteractions();
    },

    /**
     * Render month view
     */
    renderMonthView(jobs) {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - startDate.getDay());

        const today = new Date().toISOString().split('T')[0];
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        let html = `
            <div class="calendar-grid month-view">
                <div class="calendar-weekdays">
                    ${days.map(d => `<div class="weekday">${d}</div>`).join('')}
                </div>
                <div class="calendar-days">
        `;

        const currentDate = new Date(startDate);
        for (let i = 0; i < 42; i++) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const isToday = dateStr === today;
            const isCurrentMonth = currentDate.getMonth() === month;
            const dayJobs = jobs.filter(j => j.scheduled_date === dateStr);

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'other-month' : ''}"
                    data-date="${dateStr}">
                    <div class="day-number">${currentDate.getDate()}</div>
                    <div class="day-jobs">
                        ${dayJobs.slice(0, 3).map(job => this.renderJobChip(job)).join('')}
                        ${dayJobs.length > 3 ? `<div class="more-jobs">+${dayJobs.length - 3} more</div>` : ''}
                    </div>
                </div>
            `;

            currentDate.setDate(currentDate.getDate() + 1);
        }

        html += `</div></div>`;
        return html;
    },

    /**
     * Render week view
     */
    renderWeekView(jobs) {
        const startOfWeek = new Date(this.currentDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

        const today = new Date().toISOString().split('T')[0];
        const hours = Array.from({ length: 12 }, (_, i) => i + 6); // 6 AM to 5 PM

        let html = `
            <div class="calendar-grid week-view">
                <div class="week-header">
                    <div class="time-gutter"></div>
                    ${Array.from({ length: 7 }, (_, i) => {
                        const date = new Date(startOfWeek);
                        date.setDate(date.getDate() + i);
                        const dateStr = date.toISOString().split('T')[0];
                        const isToday = dateStr === today;
                        return `
                            <div class="week-day-header ${isToday ? 'today' : ''}" data-date="${dateStr}">
                                <div class="day-name">${date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                <div class="day-date">${date.getDate()}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="week-body">
                    <div class="time-column">
                        ${hours.map(h => `
                            <div class="time-slot">${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}</div>
                        `).join('')}
                    </div>
                    <div class="week-columns">
                        ${Array.from({ length: 7 }, (_, i) => {
                            const date = new Date(startOfWeek);
                            date.setDate(date.getDate() + i);
                            const dateStr = date.toISOString().split('T')[0];
                            const dayJobs = jobs.filter(j => j.scheduled_date === dateStr);
                            const isToday = dateStr === today;
                            return `
                                <div class="week-column ${isToday ? 'today' : ''}" data-date="${dateStr}">
                                    <div class="week-jobs">
                                        ${dayJobs.map(job => this.renderJobBlock(job)).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
        return html;
    },

    /**
     * Render day view
     */
    renderDayView(jobs) {
        const dateStr = this.currentDate.toISOString().split('T')[0];
        const dayJobs = jobs.filter(j => j.scheduled_date === dateStr);
        const hours = Array.from({ length: 14 }, (_, i) => i + 5); // 5 AM to 6 PM

        let html = `
            <div class="calendar-grid day-view">
                <div class="day-schedule">
                    ${hours.map(h => `
                        <div class="hour-row">
                            <div class="hour-label">${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}</div>
                            <div class="hour-content"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="day-jobs-list">
                    <h3>Jobs for ${this.currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                    ${dayJobs.length === 0 ? '<div class="no-jobs">No jobs scheduled</div>' : ''}
                    ${dayJobs.map(job => this.renderJobCard(job)).join('')}
                </div>
            </div>
        `;
        return html;
    },

    /**
     * Render a job chip (for month view)
     */
    renderJobChip(job) {
        const status = typeof Jobs !== 'undefined' ? Jobs.getStatusInfo(job.status) : { color: '#3b82f6' };
        const crewColors = (job.assigned_crew || [])
            .map(id => this.crew.find(c => c.id === id)?.color)
            .filter(Boolean);

        const borderStyle = crewColors.length > 0 ?
            `border-left: 3px solid ${crewColors[0]}` : '';

        return `
            <div class="job-chip"
                data-job-id="${job.id}"
                style="${borderStyle}; background: ${status.color}15; color: ${status.color}"
                draggable="true">
                <span class="job-title">${this.escapeHtml(job.title || job.clients?.name || 'Job')}</span>
            </div>
        `;
    },

    /**
     * Render a job block (for week view)
     */
    renderJobBlock(job) {
        const status = typeof Jobs !== 'undefined' ? Jobs.getStatusInfo(job.status) : { color: '#3b82f6' };
        const crewColors = (job.assigned_crew || [])
            .map(id => this.crew.find(c => c.id === id)?.color)
            .filter(Boolean);

        return `
            <div class="job-block"
                data-job-id="${job.id}"
                style="background: ${status.color}; border-left: 4px solid ${crewColors[0] || status.color}"
                draggable="true">
                <div class="job-time">${job.scheduled_time || 'All day'}</div>
                <div class="job-title">${this.escapeHtml(job.title || job.clients?.name || 'Job')}</div>
                <div class="job-address">${this.escapeHtml(job.address || '')}</div>
            </div>
        `;
    },

    /**
     * Render a job card (for day view)
     */
    renderJobCard(job) {
        const status = typeof Jobs !== 'undefined' ? Jobs.getStatusInfo(job.status) : { color: '#3b82f6', label: 'Pending' };
        const crewMembers = (job.assigned_crew || [])
            .map(id => this.crew.find(c => c.id === id))
            .filter(Boolean);

        return `
            <div class="job-card" data-job-id="${job.id}">
                <div class="job-header">
                    <span class="job-status" style="background: ${status.color}">${status.label}</span>
                    <span class="job-time">${job.scheduled_time || 'All day'}</span>
                </div>
                <h4 class="job-title">${this.escapeHtml(job.title || job.clients?.name || 'Job')}</h4>
                <p class="job-address">${this.escapeHtml(job.address || 'No address')}</p>
                ${crewMembers.length > 0 ? `
                    <div class="job-crew">
                        ${crewMembers.map(m => `
                            <span class="crew-badge" style="background: ${m.color}">${m.name.split(' ')[0]}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Setup calendar interactions (clicks, drag & drop)
     */
    setupCalendarInteractions() {
        // Job clicks
        this.container.querySelectorAll('[data-job-id]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (this.onJobClick) {
                    this.onJobClick(e.currentTarget.dataset.jobId);
                }
            });
        });

        // Date clicks
        this.container.querySelectorAll('[data-date]').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('[data-job-id]')) return; // Don't trigger on job click
                if (this.onDateClick) {
                    this.onDateClick(e.currentTarget.dataset.date);
                }
            });
        });

        // Drag and drop
        this.setupDragAndDrop();
    },

    /**
     * Setup drag and drop for job rescheduling
     */
    setupDragAndDrop() {
        const jobElements = this.container.querySelectorAll('[data-job-id][draggable="true"]');
        const dateElements = this.container.querySelectorAll('[data-date]');

        jobElements.forEach(el => {
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', e.target.dataset.jobId);
                e.target.classList.add('dragging');
            });

            el.addEventListener('dragend', (e) => {
                e.target.classList.remove('dragging');
            });
        });

        dateElements.forEach(el => {
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                el.classList.add('drag-over');
            });

            el.addEventListener('dragleave', (e) => {
                el.classList.remove('drag-over');
            });

            el.addEventListener('drop', async (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');

                const jobId = e.dataTransfer.getData('text/plain');
                const newDate = el.dataset.date;

                if (jobId && newDate && this.onJobDrop) {
                    await this.onJobDrop(jobId, newDate);
                    this.loadData(); // Refresh
                }
            });
        });
    },

    // ==================== ADD EVENT MODAL ====================

    /**
     * Create the add event modal
     */
    createAddEventModal() {
        // Remove existing
        const existing = document.getElementById('addEventModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'addEventModal';
        modal.className = 'add-event-modal';
        modal.innerHTML = `
            <div class="add-event-content">
                <button class="add-event-close" onclick="Calendar.closeAddEventModal()">&times;</button>
                <h3 class="add-event-title">Add to Calendar</h3>
                <div class="add-event-date" id="addEventDate"></div>

                <!-- Event Type -->
                <div class="event-type-tabs">
                    <button class="event-type-tab active" data-type="job">Job</button>
                    <button class="event-type-tab" data-type="reminder">Reminder</button>
                    <button class="event-type-tab" data-type="meeting">Meeting</button>
                </div>

                <!-- Event Title -->
                <div class="form-group">
                    <input type="text" id="eventTitle" class="event-input" placeholder="What needs to be done?">
                </div>

                <!-- Time -->
                <div class="form-row">
                    <div class="form-group half">
                        <label>Start Time</label>
                        <input type="time" id="eventStartTime" class="event-input" value="08:00">
                    </div>
                    <div class="form-group half">
                        <label>Duration</label>
                        <select id="eventDuration" class="event-input">
                            <option value="1">1 hour</option>
                            <option value="2">2 hours</option>
                            <option value="4" selected>Half day</option>
                            <option value="8">Full day</option>
                            <option value="multi">Multi-day</option>
                        </select>
                    </div>
                </div>

                <!-- Client Tag -->
                <div class="form-group">
                    <label>Client (optional)</label>
                    <div class="tag-search-wrapper">
                        <input type="text" id="eventClientSearch" class="event-input"
                            placeholder="Search client name..."
                            autocomplete="off"
                            oninput="Calendar.searchClients(this.value)">
                        <div class="tag-search-results" id="clientSearchResults"></div>
                    </div>
                    <div class="selected-tags" id="selectedClient" style="display: none;"></div>
                </div>

                <!-- Crew/Employee Tags -->
                <div class="form-group">
                    <label>Assign Crew</label>
                    <div class="crew-checkboxes" id="crewCheckboxes"></div>
                </div>

                <!-- Notes -->
                <div class="form-group">
                    <textarea id="eventNotes" class="event-input event-textarea" placeholder="Notes (optional)"></textarea>
                </div>

                <!-- Actions -->
                <div class="add-event-actions">
                    <button class="btn btn-secondary" onclick="Calendar.closeAddEventModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="Calendar.saveEvent()">Add to Calendar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.addEventModal = modal;

        // Event type tabs
        modal.querySelectorAll('.event-type-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                modal.querySelectorAll('.event-type-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    },

    /**
     * Open the add event modal for a specific date
     */
    openAddEventModal(dateStr) {
        if (!this.addEventModal) this.createAddEventModal();

        const date = new Date(dateStr + 'T12:00:00');
        document.getElementById('addEventDate').textContent =
            date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        this.addEventModal.dataset.date = dateStr;

        // Populate crew checkboxes
        const crewContainer = document.getElementById('crewCheckboxes');
        crewContainer.innerHTML = this.crew.map(member => `
            <label class="crew-checkbox">
                <input type="checkbox" value="${member.id}" name="assignedCrew">
                <span class="crew-checkbox-dot" style="background: ${member.color}"></span>
                <span class="crew-checkbox-name">${member.name}</span>
            </label>
        `).join('') || '<span class="no-crew">No crew members yet. <a href="../crew/index.html">Add crew</a></span>';

        // Reset form
        document.getElementById('eventTitle').value = '';
        document.getElementById('eventStartTime').value = '08:00';
        document.getElementById('eventDuration').value = '4';
        document.getElementById('eventClientSearch').value = '';
        document.getElementById('clientSearchResults').innerHTML = '';
        document.getElementById('selectedClient').style.display = 'none';
        document.getElementById('selectedClient').innerHTML = '';
        document.getElementById('eventNotes').value = '';
        crewContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);

        // Show modal
        this.addEventModal.classList.add('open');
        setTimeout(() => document.getElementById('eventTitle').focus(), 100);
    },

    /**
     * Close the add event modal
     */
    closeAddEventModal() {
        if (this.addEventModal) {
            this.addEventModal.classList.remove('open');
        }
    },

    /**
     * Search clients for tagging
     */
    searchClients(query) {
        const resultsContainer = document.getElementById('clientSearchResults');
        if (!resultsContainer) return;

        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        const q = query.toLowerCase();
        const matches = this.clients.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.address || '').toLowerCase().includes(q)
        ).slice(0, 5);

        if (matches.length === 0) {
            resultsContainer.innerHTML = `
                <div class="tag-result create-new" onclick="Calendar.createClient('${this.escapeHtml(query)}')">
                    <span class="tag-result-icon">➕</span>
                    <span>Create "${query}"</span>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = matches.map(c => `
                <div class="tag-result" onclick="Calendar.selectClient('${c.id}', '${this.escapeHtml(c.name)}', '${this.escapeHtml(c.address || '')}')">
                    <span class="tag-result-icon">👤</span>
                    <span>${this.escapeHtml(c.name)}</span>
                    ${c.address ? `<small>${this.escapeHtml(c.address)}</small>` : ''}
                </div>
            `).join('');
        }
    },

    /**
     * Select a client for the event
     */
    selectClient(id, name, address) {
        document.getElementById('eventClientSearch').style.display = 'none';
        document.getElementById('clientSearchResults').innerHTML = '';

        const selectedContainer = document.getElementById('selectedClient');
        selectedContainer.innerHTML = `
            <span class="selected-tag">
                <strong>${name}</strong>${address ? ` - ${address}` : ''}
                <button onclick="Calendar.clearClient()">&times;</button>
            </span>
        `;
        selectedContainer.style.display = 'flex';
        selectedContainer.dataset.clientId = id;
        selectedContainer.dataset.clientName = name;
        selectedContainer.dataset.clientAddress = address;
    },

    /**
     * Create a new client from the modal
     */
    async createClient(name) {
        let clientId = 'local_' + Date.now();

        // Try to create in Supabase
        if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
            const created = await SupabaseClient.saveClient({ name });
            if (created) {
                clientId = created.id;
                this.clients.push(created);
            }
        } else {
            // Save locally
            const localClients = JSON.parse(localStorage.getItem('lavaClients') || '[]');
            const newClient = { id: clientId, name, address: '' };
            localClients.push(newClient);
            localStorage.setItem('lavaClients', JSON.stringify(localClients));
            this.clients.push(newClient);
        }

        this.selectClient(clientId, name, '');
    },

    /**
     * Clear selected client
     */
    clearClient() {
        document.getElementById('eventClientSearch').style.display = 'block';
        document.getElementById('eventClientSearch').value = '';
        document.getElementById('selectedClient').style.display = 'none';
        document.getElementById('selectedClient').innerHTML = '';
        delete document.getElementById('selectedClient').dataset.clientId;
    },

    /**
     * Save the event
     */
    async saveEvent() {
        const dateStr = this.addEventModal.dataset.date;
        const title = document.getElementById('eventTitle').value.trim();
        const startTime = document.getElementById('eventStartTime').value;
        const duration = document.getElementById('eventDuration').value;
        const notes = document.getElementById('eventNotes').value.trim();
        const eventType = this.addEventModal.querySelector('.event-type-tab.active').dataset.type;

        const selectedClientEl = document.getElementById('selectedClient');
        const clientId = selectedClientEl.dataset.clientId || null;
        const clientName = selectedClientEl.dataset.clientName || '';

        const assignedCrew = Array.from(
            document.querySelectorAll('input[name="assignedCrew"]:checked')
        ).map(cb => cb.value);

        if (!title) {
            alert('Please enter what needs to be done');
            return;
        }

        const eventData = {
            title: title,
            type: eventType,
            scheduled_date: dateStr,
            scheduled_time: startTime,
            duration_hours: duration === 'multi' ? null : parseInt(duration),
            client_id: clientId,
            client_name: clientName,
            assigned_crew: assignedCrew,
            notes: notes,
            status: 'scheduled'
        };

        console.log('[Calendar] Saving event:', eventData);

        // Try to save via Jobs module or callback
        let saved = false;

        if (this.onEventCreate) {
            saved = await this.onEventCreate(eventData);
        } else if (typeof Jobs !== 'undefined') {
            // Create as a job
            const job = await Jobs.create(eventData);
            saved = !!job;
        } else {
            // Save locally
            const localEvents = JSON.parse(localStorage.getItem('lavaCalendarEvents') || '[]');
            eventData.id = 'event_' + Date.now();
            eventData.created_at = new Date().toISOString();
            localEvents.push(eventData);
            localStorage.setItem('lavaCalendarEvents', JSON.stringify(localEvents));
            saved = true;
        }

        if (saved) {
            this.closeAddEventModal();
            this.loadData(); // Refresh calendar

            // Show toast
            if (typeof showToast === 'function') {
                showToast(`Added "${title}" to calendar`);
            }
        } else {
            alert('Failed to save event. Please try again.');
        }
    },

    // ==================== NAVIGATION ====================

    prev() {
        if (this.currentView === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        } else if (this.currentView === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() - 7);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() - 1);
        }
        this.updateTitle();
        this.loadData();
    },

    next() {
        if (this.currentView === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        } else if (this.currentView === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + 7);
        } else {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
        }
        this.updateTitle();
        this.loadData();
    },

    goToToday() {
        this.currentDate = new Date();
        this.updateTitle();
        this.loadData();
    },

    goToDate(date) {
        this.currentDate = new Date(date);
        this.updateTitle();
        this.loadData();
    },

    setView(view) {
        this.currentView = view;
        this.container.querySelectorAll('[data-view]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
        this.updateTitle();
        this.renderCalendarContent();
    },

    // ==================== UTILITIES ====================

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    },

    /**
     * Refresh calendar data
     */
    refresh() {
        this.loadData();
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calendar;
}
