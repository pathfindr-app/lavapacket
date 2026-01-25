/**
 * LAVA Roofing Portal - Notifications Module
 * Email and SMS notifications
 */

const Notifications = {
    templates: {
        packet_sent: {
            subject: 'Your LAVA Roofing Proposal',
            body: 'Hello {customerName},\n\nYour roofing proposal is ready for review.\n\nYou can view it here: {packetUrl}\n\nIf you have any questions, please call us at (808) 555-LAVA.\n\nBest regards,\nLAVA Roofing Team'
        },
        inspection_complete: {
            subject: 'Your Roof Inspection Report',
            body: 'Hello {customerName},\n\nYour roof inspection has been completed. You can view the full report here: {inspectionUrl}\n\nIf you would like to discuss the findings or schedule repairs, please contact us.\n\nBest regards,\nLAVA Roofing Team'
        },
        job_scheduled: {
            subject: 'Your Roofing Job is Scheduled',
            body: 'Hello {customerName},\n\nGreat news! Your roofing project has been scheduled for {scheduledDate}.\n\nOur crew will arrive between 7:00-8:00 AM. Please ensure the work area is accessible.\n\nIf you need to reschedule, please contact us at least 48 hours in advance.\n\nBest regards,\nLAVA Roofing Team'
        },
        job_starting: {
            subject: 'Your Roofing Job Starts Tomorrow',
            body: 'Hello {customerName},\n\nThis is a reminder that our crew will arrive tomorrow morning to begin your roofing project.\n\nPlease ensure:\n- Vehicles are moved away from the work area\n- Pets are secured\n- Any fragile items near the work area are protected\n\nIf you have any questions, please call us.\n\nBest regards,\nLAVA Roofing Team'
        },
        job_complete: {
            subject: 'Your New Roof is Complete!',
            body: 'Hello {customerName},\n\nCongratulations! Your roofing project has been completed.\n\nWarranty Information:\n- Manufacturer warranty: 30 years\n- Workmanship warranty: 10 years\n\nPlease inspect your new roof and let us know if you have any questions.\n\nThank you for choosing LAVA Roofing!\n\nBest regards,\nLAVA Roofing Team'
        },
        signature_request: {
            subject: 'Please Sign Your LAVA Roofing Proposal',
            body: 'Hello {customerName},\n\nYour roofing proposal is ready for your signature.\n\nPlease click here to review and sign: {signatureUrl}\n\nThis link expires in 30 days.\n\nIf you have any questions before signing, please call us.\n\nBest regards,\nLAVA Roofing Team'
        }
    },

    /**
     * Send an email notification
     */
    async sendEmail(options) {
        const { to, template, variables = {}, clientId, jobId, packetId } = options;

        if (!to) {
            throw new Error('Email recipient is required');
        }

        // Get template or use custom content
        const emailTemplate = this.templates[template] || { subject: options.subject, body: options.body };

        // Replace variables in template
        let subject = emailTemplate.subject;
        let body = emailTemplate.body;

        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{${key}}`, 'g');
            subject = subject.replace(regex, value);
            body = body.replace(regex, value);
        });

        // Log notification to database
        const notification = {
            type: 'email',
            template: template,
            recipient: to,
            subject: subject,
            body: body,
            client_id: clientId,
            job_id: jobId,
            packet_id: packetId,
            status: 'pending'
        };

        try {
            // Save notification record
            if (SupabaseClient.isAvailable()) {
                const { data: saved, error: saveError } = await SupabaseClient.getClient()
                    .from('notifications')
                    .insert(notification)
                    .select()
                    .single();

                if (saveError) throw saveError;
                notification.id = saved.id;
            }

            // Send via Edge Function
            if (SupabaseClient.isAvailable()) {
                const { data, error } = await SupabaseClient.getClient()
                    .functions.invoke('send-email', {
                        body: { to, subject, body }
                    });

                if (error) throw error;

                // Update status to sent
                await this.updateStatus(notification.id, 'sent');
                console.log('[Notifications] Email sent to:', to);

                return { success: true, id: notification.id };
            } else {
                // Demo mode - just log
                console.log('[Notifications] Demo - would send email to:', to);
                return { success: true, demo: true };
            }
        } catch (e) {
            console.error('[Notifications] Email failed:', e);
            await this.updateStatus(notification.id, 'failed', e.message);
            return { success: false, error: e.message };
        }
    },

    /**
     * Send an SMS notification
     */
    async sendSMS(options) {
        const { to, template, variables = {}, clientId, jobId } = options;

        if (!to) {
            throw new Error('Phone number is required');
        }

        // Get template body or use custom
        const messageTemplate = this.templates[template]?.body || options.message;
        if (!messageTemplate) {
            throw new Error('Message template or content required');
        }

        // Replace variables
        let message = messageTemplate;
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{${key}}`, 'g');
            message = message.replace(regex, value);
        });

        // Truncate for SMS (keep under 160 chars for single SMS)
        if (message.length > 160) {
            message = message.substring(0, 157) + '...';
        }

        // Log notification
        const notification = {
            type: 'sms',
            template: template,
            recipient: to,
            subject: null,
            body: message,
            client_id: clientId,
            job_id: jobId,
            status: 'pending'
        };

        try {
            if (SupabaseClient.isAvailable()) {
                const { data: saved } = await SupabaseClient.getClient()
                    .from('notifications')
                    .insert(notification)
                    .select()
                    .single();

                notification.id = saved?.id;

                // Send via Edge Function
                const { error } = await SupabaseClient.getClient()
                    .functions.invoke('send-sms', {
                        body: { to, message }
                    });

                if (error) throw error;

                await this.updateStatus(notification.id, 'sent');
                console.log('[Notifications] SMS sent to:', to);

                return { success: true, id: notification.id };
            } else {
                console.log('[Notifications] Demo - would send SMS to:', to);
                return { success: true, demo: true };
            }
        } catch (e) {
            console.error('[Notifications] SMS failed:', e);
            await this.updateStatus(notification.id, 'failed', e.message);
            return { success: false, error: e.message };
        }
    },

    /**
     * Update notification status
     */
    async updateStatus(id, status, errorMessage = null) {
        if (!id || !SupabaseClient.isAvailable()) return;

        const updates = {
            status,
            sent_at: status === 'sent' ? new Date().toISOString() : null,
            error_message: errorMessage
        };

        await SupabaseClient.getClient()
            .from('notifications')
            .update(updates)
            .eq('id', id);
    },

    /**
     * Get notification history
     */
    async getHistory(options = {}) {
        if (!SupabaseClient.isAvailable()) return [];

        try {
            let query = SupabaseClient.getClient()
                .from('notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(options.limit || 50);

            if (options.clientId) {
                query = query.eq('client_id', options.clientId);
            }
            if (options.jobId) {
                query = query.eq('job_id', options.jobId);
            }
            if (options.type) {
                query = query.eq('type', options.type);
            }

            const { data, error } = await query;
            if (error) throw error;

            return data || [];
        } catch (e) {
            console.error('[Notifications] Failed to get history:', e);
            return [];
        }
    },

    /**
     * Send packet to customer via email
     */
    async sendPacketEmail(packetId, email) {
        const packet = await SupabaseClient.getPacket(packetId);
        if (!packet) throw new Error('Packet not found');

        const portalUrl = await this.generatePortalLink(packet.client_id, 'portal');

        return this.sendEmail({
            to: email,
            template: 'packet_sent',
            variables: {
                customerName: packet.customer_name || 'Valued Customer',
                packetUrl: portalUrl
            },
            clientId: packet.client_id,
            packetId: packetId
        });
    },

    /**
     * Send signature request
     */
    async sendSignatureRequest(packetId, email) {
        const packet = await SupabaseClient.getPacket(packetId);
        if (!packet) throw new Error('Packet not found');

        const signatureUrl = await this.generatePortalLink(packet.client_id, 'signature');

        return this.sendEmail({
            to: email,
            template: 'signature_request',
            variables: {
                customerName: packet.customer_name || 'Valued Customer',
                signatureUrl: signatureUrl + `&packet=${packetId}`
            },
            clientId: packet.client_id,
            packetId: packetId
        });
    },

    /**
     * Generate portal link with token
     */
    async generatePortalLink(clientId, purpose = 'portal') {
        if (!SupabaseClient.isAvailable()) {
            return `${window.location.origin}/portal/?demo=true`;
        }

        try {
            // Generate unique token
            const token = crypto.randomUUID();

            // Save token to database
            await SupabaseClient.getClient()
                .from('client_tokens')
                .insert({
                    client_id: clientId,
                    token: token,
                    purpose: purpose,
                    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
                });

            return `${window.location.origin}/portal/?token=${token}`;
        } catch (e) {
            console.error('[Notifications] Failed to generate portal link:', e);
            throw e;
        }
    },

    /**
     * Get template list
     */
    getTemplates() {
        return Object.entries(this.templates).map(([key, template]) => ({
            id: key,
            name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            subject: template.subject,
            preview: template.body.substring(0, 100) + '...'
        }));
    },

    /**
     * Show send email dialog
     */
    showEmailDialog(options = {}) {
        const { email = '', clientId, jobId, packetId, template = '', onSend } = options;

        document.querySelector('.email-dialog')?.remove();

        const templates = this.getTemplates();
        const dialog = document.createElement('div');
        dialog.className = 'email-dialog';

        dialog.innerHTML = `
            <div class="dialog-backdrop"></div>
            <div class="dialog-content">
                <div class="dialog-header">
                    <h3>Send Email</h3>
                    <button class="dialog-close">&times;</button>
                </div>
                <form class="email-form" id="emailForm">
                    <div class="form-group">
                        <label>To</label>
                        <input type="email" name="to" class="form-input" value="${email}" required placeholder="customer@email.com">
                    </div>
                    <div class="form-group">
                        <label>Template</label>
                        <select name="template" class="form-input">
                            <option value="">Custom message</option>
                            ${templates.map(t => `
                                <option value="${t.id}" ${t.id === template ? 'selected' : ''}>${t.name}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Subject</label>
                        <input type="text" name="subject" class="form-input" placeholder="Email subject">
                    </div>
                    <div class="form-group">
                        <label>Message</label>
                        <textarea name="body" class="form-input" rows="8" placeholder="Email message..."></textarea>
                    </div>
                    <div class="dialog-actions">
                        <button type="button" class="btn btn-secondary dialog-cancel">Cancel</button>
                        <button type="submit" class="btn btn-primary">Send Email</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(dialog);

        const form = dialog.querySelector('#emailForm');
        const templateSelect = form.template;
        const subjectInput = form.subject;
        const bodyInput = form.body;

        // Update form when template changes
        templateSelect.addEventListener('change', () => {
            const selected = templateSelect.value;
            if (selected && this.templates[selected]) {
                subjectInput.value = this.templates[selected].subject;
                bodyInput.value = this.templates[selected].body;
            }
        });

        // Initialize with template if provided
        if (template && this.templates[template]) {
            subjectInput.value = this.templates[template].subject;
            bodyInput.value = this.templates[template].body;
        }

        // Close handlers
        dialog.querySelector('.dialog-backdrop').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.remove());
        dialog.querySelector('.dialog-cancel').addEventListener('click', () => dialog.remove());

        // Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            try {
                const result = await this.sendEmail({
                    to: form.to.value,
                    template: form.template.value || null,
                    subject: form.subject.value,
                    body: form.body.value,
                    clientId,
                    jobId,
                    packetId
                });

                if (result.success) {
                    if (onSend) onSend(result);
                    dialog.remove();
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                alert('Failed to send email: ' + error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Email';
            }
        });
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Notifications;
}
