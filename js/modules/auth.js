/**
 * LAVA Packet Builder - Authentication Module
 * Handles password protection for the portal
 * Now supports Supabase for password storage with localStorage fallback
 */

const Auth = {
    // Fallback password (used when Supabase is not available)
    fallbackPassword: 'lavaroofing',
    storageKey: 'lavaAuth',

    init() {
        // Check if already authenticated
        if (this.isAuthenticated()) {
            this.unlock();
            return;
        }

        // Set up password input
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.checkPassword();
                }
            });
        }

        // Set up unlock button if it exists
        const unlockBtn = document.getElementById('unlockBtn');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => this.checkPassword());
        }
    },

    isAuthenticated() {
        return sessionStorage.getItem(this.storageKey) === 'true';
    },

    async checkPassword() {
        const input = document.getElementById('passwordInput');
        const error = document.getElementById('passwordError');
        const btn = document.getElementById('unlockBtn');

        if (!input) return;

        const password = input.value;

        // Disable button while checking
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Checking...';
        }

        try {
            let isValid = false;

            // Try Supabase first if available
            if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isAvailable()) {
                isValid = await SupabaseClient.checkPassword(password);
            } else {
                // Fallback to hardcoded password
                isValid = password === this.fallbackPassword;
            }

            if (isValid) {
                this.unlock();
                sessionStorage.setItem(this.storageKey, 'true');
            } else {
                input.classList.add('error');
                if (error) error.classList.add('visible');
                setTimeout(() => input.classList.remove('error'), 500);
            }
        } catch (e) {
            console.error('Password check error:', e);
            // On error, try fallback
            if (password === this.fallbackPassword) {
                this.unlock();
                sessionStorage.setItem(this.storageKey, 'true');
            } else {
                input.classList.add('error');
                if (error) error.classList.add('visible');
                setTimeout(() => input.classList.remove('error'), 500);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Unlock';
            }
        }
    },

    unlock() {
        const screen = document.getElementById('passwordScreen');
        if (screen) screen.classList.add('hidden');

        document.querySelectorAll('.content-locked').forEach(el => {
            el.classList.add('unlocked');
        });

        // Dispatch event for other modules to know auth is complete
        document.dispatchEvent(new CustomEvent('auth:unlocked'));
    },

    lock() {
        sessionStorage.removeItem(this.storageKey);
        const screen = document.getElementById('passwordScreen');
        if (screen) screen.classList.remove('hidden');

        document.querySelectorAll('.content-locked').forEach(el => {
            el.classList.remove('unlocked');
        });

        // Dispatch event
        document.dispatchEvent(new CustomEvent('auth:locked'));
    }
};

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
}
