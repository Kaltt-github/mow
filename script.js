// ═══════════════════════════════════════
// DISCORD OAUTH2 (Implicit Grant)
// ═══════════════════════════════════════
const DISCORD_CLIENT_ID = '1097264484495663314';
const DISCORD_REDIRECT_URI = window.MOW_DISCORD_REDIRECT_URI
    || `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}`;
const DISCORD_SCOPES = 'identify';
const DISCORD_AUTH_URL = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=token&scope=${DISCORD_SCOPES}`;
const DISCORD_API = 'https://discord.com/api/v10';
const STORAGE_KEY = 'mow_discord_session';
const PENDING_SUBSCRIPTIONS_KEY = 'mow_pending_paypal_subscriptions';
const PENDING_PURCHASES_KEY = 'mow_pending_paypal_store_purchases';
const STORE_INVOICE_PREFIX = 'mowstore';

function getStoredSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function storeSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
}

function readStoredArray(key) {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function getPendingSubscriptions() {
    return readStoredArray(PENDING_SUBSCRIPTIONS_KEY);
}

function storePendingSubscription(entry) {
    const pending = getPendingSubscriptions().filter(item => item.subscriptionId !== entry.subscriptionId);
    pending.unshift(entry);
    localStorage.setItem(PENDING_SUBSCRIPTIONS_KEY, JSON.stringify(pending.slice(0, 20)));
}

function getPendingPurchases() {
    return readStoredArray(PENDING_PURCHASES_KEY);
}

function storePendingPurchase(entry) {
    const pending = getPendingPurchases().filter(item => item.orderId !== entry.orderId);
    pending.unshift(entry);
    localStorage.setItem(PENDING_PURCHASES_KEY, JSON.stringify(pending.slice(0, 30)));
}

function updateStatus(targetId, message, state = 'info') {
    const status = document.getElementById(targetId);
    if (!status) return;
    if (!message) {
        status.hidden = true;
        status.textContent = '';
        status.removeAttribute('data-state');
        return;
    }
    status.hidden = false;
    status.textContent = message;
    status.setAttribute('data-state', state);
}

function updateBillingStatus(message, state = 'info') {
    updateStatus('billingStatus', message, state);
}

function updateStoreStatus(message, state = 'info') {
    updateStatus('storeStatus', message, state);
}

function restorePendingSubscriptionNotice(user) {
    if (!user) {
        updateBillingStatus('');
        return;
    }
    const pending = getPendingSubscriptions().find(entry => entry.userId === user.id);
    if (!pending) return;
    updateBillingStatus(
        `Compra registrada para ${pending.tier}. Ahora entra a Discord y usa /suscripciones para reclamar tu suscripcion.`,
        'info'
    );
}

function restorePendingPurchaseNotice(user) {
    if (!user) {
        updateStoreStatus('');
        return;
    }
    const pending = getPendingPurchases().find(entry => entry.userId === user.id);
    if (!pending) return;
    updateStoreStatus(
        `Tu compra de ${pending.productName} ya fue confirmada. Este es tu codigo de compra: ${pending.orderId}. Ve a Niutem y usa /compras para canjearlo.`,
        'info'
    );
}

function getCurrentDiscordUser() {
    const session = getStoredSession();
    if (!session || session.expiresAt <= Date.now()) return null;
    return session.user || null;
}

function ensureDiscordUserForPaypal() {
    const user = getCurrentDiscordUser();
    if (!user) {
        updateBillingStatus('Necesitas iniciar sesion con Discord antes de suscribirte.', 'error');
        updateStoreStatus('Necesitas iniciar sesion con Discord antes de comprar en la tienda.', 'error');
        throw new Error('No Discord session available');
    }
    return user;
}

function buildStoreInvoiceId(userId, productId) {
    return `${STORE_INVOICE_PREFIX}-${userId}-${productId}-${Date.now()}`;
}

function handlePayPalApproval(tier, planId, data) {
    const user = ensureDiscordUserForPaypal();
    storePendingSubscription({
        userId: user.id,
        subscriptionId: data.subscriptionID,
        tier,
        planId,
        approvedAt: new Date().toISOString()
    });
    updateBillingStatus(
        `PayPal activo ${tier}. Tu compra se ha guardado y ahora debes usar /suscripciones en Discord para reclamar tu suscripcion.`,
        'success'
    );
}

function handlePayPalStoreApproval(productName, productId, orderId, captureId) {
    const user = ensureDiscordUserForPaypal();
    storePendingPurchase({
        userId: user.id,
        orderId,
        captureId,
        productId,
        productName,
        approvedAt: new Date().toISOString()
    });
    updateStoreStatus(
        `Tu compra de ${productName} ya fue confirmada. Este es tu codigo de compra: ${orderId}. Ve a Niutem y usa /compras para canjearlo.`,
        'success'
    );
}

function renderPayPalButtons() {
    if (!window.paypal) return;
    document.querySelectorAll('.paypal-tier-container').forEach(container => {
        if (container.dataset.paypalRendered === 'true') return;
        const planId = container.dataset.paypalPlanId;
        const tier = container.dataset.paypalTier || 'suscripcion';
        if (!planId) return;

        paypal.Buttons({
            style: {
                shape: 'rect',
                color: 'gold',
                layout: 'vertical',
                label: 'subscribe'
            },
            createSubscription: function(data, actions) {
                const user = ensureDiscordUserForPaypal();
                return actions.subscription.create({
                    plan_id: planId,
                    custom_id: user.id
                });
            },
            onApprove: function(data) {
                handlePayPalApproval(tier, planId, data);
            },
            onError: function(err) {
                console.error('PayPal subscription error:', err);
                updateBillingStatus('No se pudo iniciar la suscripcion con PayPal. Intentalo de nuevo.', 'error');
            }
        }).render(`#${container.id}`);

        container.dataset.paypalRendered = 'true';
    });
}

function renderPayPalStoreButtons() {
    if (!window.paypalStore) return;
    document.querySelectorAll('.paypal-store-container').forEach(container => {
        if (container.dataset.paypalRendered === 'true') return;

        const productId = container.dataset.productId;
        const productName = container.dataset.productName || 'Compra de tienda';
        const productPrice = container.dataset.productPrice;
        const currencyCode = container.dataset.productCurrency || 'EUR';
        if (!productId || !productPrice) return;

        window.paypalStore.Buttons({
            style: {
                shape: 'rect',
                color: 'gold',
                layout: 'vertical',
                label: 'pay'
            },
            createOrder: function(_data, actions) {
                const user = ensureDiscordUserForPaypal();
                return actions.order.create({
                    purchase_units: [
                        {
                            amount: {
                                currency_code: currencyCode,
                                value: productPrice,
                            },
                            description: productName,
                            custom_id: user.id,
                            invoice_id: buildStoreInvoiceId(user.id, productId),
                        }
                    ]
                });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(details => {
                    const captureId = details?.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;
                    handlePayPalStoreApproval(productName, productId, data.orderID, captureId);
                });
            },
            onError: function(err) {
                console.error('PayPal store error:', err);
                updateStoreStatus('No se pudo iniciar la compra con PayPal. Intentalo de nuevo.', 'error');
            }
        }).render(`#${container.id}`);

        container.dataset.paypalRendered = 'true';
    });
}

async function fetchDiscordUser(accessToken) {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
}

function getAvatarUrl(user) {
    if (!user.avatar) {
        const defaultIndex = (BigInt(user.id) >> 22n) % 6n;
        return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'webp';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

function updateNavbarForUser(user) {
    const loginSlot = document.getElementById('discordLoginSlot');
    if (!loginSlot) return;

    if (user) {
        loginSlot.innerHTML = `
            <div class="discord-user-badge">
                <img class="discord-user-avatar" src="${getAvatarUrl(user)}" alt="${user.username}">
                <span class="discord-user-name">${user.global_name || user.username}</span>
                <button class="discord-logout-btn" id="discordLogout" title="Cerrar sesión">✕</button>
            </div>
        `;
        document.getElementById('discordLogout')?.addEventListener('click', () => {
            clearSession();
            updateNavbarForUser(null);
            updatePaypalGate(null);
            updateBillingStatus('');
            updateStoreStatus('');
        });
    } else {
        loginSlot.innerHTML = `<a href="${DISCORD_AUTH_URL}" class="btn-discord-login"><svg width="20" height="15" viewBox="0 0 71 55" fill="none"><path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.1 37.1 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0C1.5 18 -.9 30.6.3 43a.2.2 0 000 .2A58.7 58.7 0 0017.8 55a.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.6 38.6 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2 0A58.5 58.5 0 0070.3 43.2a.2.2 0 000-.1c1.4-14.7-2.4-27.4-10-38.2a.2.2 0 00-.2 0zM23.7 35.3c-3.3 0-6.1-3.1-6.1-6.9s2.7-6.9 6.1-6.9 6.2 3.1 6.1 6.9c0 3.8-2.7 6.9-6.1 6.9zm22.6 0c-3.3 0-6.1-3.1-6.1-6.9s2.7-6.9 6.1-6.9 6.2 3.1 6.1 6.9c0 3.8-2.7 6.9-6.1 6.9z" fill="currentColor"/></svg> Entrar con Discord</a>`;
    }
}

function mountLoginGate(boxes, message) {
    boxes.forEach(box => {
        if (box.querySelector('.login-gate')) return;
        const gate = document.createElement('div');
        gate.className = 'login-gate';
        gate.innerHTML = `<p class="login-gate-msg">${message}</p><a href="${DISCORD_AUTH_URL}" class="btn-discord-login btn-discord-login--small"><svg width="16" height="12" viewBox="0 0 71 55" fill="none"><path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.1 37.1 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0C1.5 18 -.9 30.6.3 43a.2.2 0 000 .2A58.7 58.7 0 0017.8 55a.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.6 38.6 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2 0A58.5 58.5 0 0070.3 43.2a.2.2 0 000-.1c1.4-14.7-2.4-27.4-10-38.2a.2.2 0 00-.2 0zM23.7 35.3c-3.3 0-6.1-3.1-6.1-6.9s2.7-6.9 6.1-6.9 6.2 3.1 6.1 6.9c0 3.8-2.7 6.9-6.1 6.9zm22.6 0c-3.3 0-6.1-3.1-6.1-6.9s2.7-6.9 6.1-6.9 6.2 3.1 6.1 6.9c0 3.8-2.7 6.9-6.1 6.9z" fill="currentColor"/></svg> Entrar con Discord</a>`;
        box.appendChild(gate);
    });
}

function updatePaypalGate(user) {
    const subscriptionContainers = document.querySelectorAll('.paypal-tier-container');
    const storeContainers = document.querySelectorAll('.paypal-store-container');

    if (!user) {
        // Hide PayPal buttons, show gate message
        subscriptionContainers.forEach(container => { container.style.display = 'none'; });
        storeContainers.forEach(container => { container.style.display = 'none'; });
        mountLoginGate(document.querySelectorAll('.tier-box'), 'Inicia sesion con Discord para suscribirte');
        mountLoginGate(document.querySelectorAll('.store-item'), 'Inicia sesion con Discord para comprar en la tienda');
        return;
        if (!document.getElementById('loginGateMsg')) {
            document.querySelectorAll('.tier-box').forEach(box => {
                if (!box.querySelector('.login-gate')) {
                    const gate = document.createElement('div');
                    gate.className = 'login-gate';
                    gate.innerHTML = `<p class="login-gate-msg">Inicia sesión con Discord para suscribirte</p><a href="${DISCORD_AUTH_URL}" class="btn-discord-login btn-discord-login--small"><svg width="16" height="12" viewBox="0 0 71 55" fill="none"><path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.1 37.1 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5a.2.2 0 00-.1 0C1.5 18 -.9 30.6.3 43a.2.2 0 000 .2A58.7 58.7 0 0017.8 55a.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.6 38.6 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.3 36.3 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2 0A58.5 58.5 0 0070.3 43.2a.2.2 0 000-.1c1.4-14.7-2.4-27.4-10-38.2a.2.2 0 00-.2 0zM23.7 35.3c-3.3 0-6.1-3.1-6.1-6.9s2.7-6.9 6.1-6.9 6.2 3.1 6.1 6.9c0 3.8-2.7 6.9-6.1 6.9zm22.6 0c-3.3 0-6.1-3.1-6.1-6.9s2.7-6.9 6.1-6.9 6.2 3.1 6.1 6.9c0 3.8-2.7 6.9-6.1 6.9z" fill="currentColor"/></svg> Entrar con Discord</a>`;
                    box.appendChild(gate);
                }
            });
        }
    } else {
        // Show PayPal buttons, remove gate
        subscriptionContainers.forEach(container => { container.style.display = ''; });
        storeContainers.forEach(container => { container.style.display = ''; });
        document.querySelectorAll('.login-gate').forEach(gate => { gate.remove(); });
    }
}

async function handleDiscordCallback() {
    const hash = window.location.hash;
    if (!hash.includes('access_token')) return null;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const expiresIn = parseInt(params.get('expires_in') || '604800', 10);

    // Clean URL
    history.replaceState(null, '', window.location.pathname);

    if (!accessToken) return null;

    try {
        const user = await fetchDiscordUser(accessToken);
        const session = {
            accessToken,
            user,
            expiresAt: Date.now() + expiresIn * 1000
        };
        storeSession(session);
        return user;
    } catch (e) {
        console.error('Discord auth error:', e);
        return null;
    }
}

async function initDiscordAuth() {
    // Check for OAuth callback first
    let user = await handleDiscordCallback();

    // Fall back to stored session
    if (!user) {
        const session = getStoredSession();
        if (session && session.expiresAt > Date.now()) {
            user = session.user;
        } else if (session) {
            clearSession();
        }
    }

    updateNavbarForUser(user);
    updatePaypalGate(user);
    renderPayPalButtons();
    renderPayPalStoreButtons();
    restorePendingSubscriptionNotice(user);
    restorePendingPurchaseNotice(user);
}

document.addEventListener('DOMContentLoaded', () => {
    initDiscordAuth();

    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 60);
        });
    }

    // Mobile menu toggle
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (navToggle && navLinks) {
        const resetToggleIcon = () => {
            const spans = navToggle.querySelectorAll('span');
            spans[0].style.transform = '';
            spans[1].style.opacity = '';
            spans[2].style.transform = '';
        };

        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
            const spans = navToggle.querySelectorAll('span');
            if (navLinks.classList.contains('open')) {
                spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                spans[1].style.opacity = '0';
                spans[2].style.transform = 'rotate(-45deg) translate(6px, -6px)';
            } else {
                resetToggleIcon();
            }
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                resetToggleIcon();
            });
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                navLinks.classList.remove('open');
                resetToggleIcon();
            }
        });
    }

    // Scroll reveal
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.15 });

    reveals.forEach(el => { observer.observe(el); });

    // Hero particles
    const particlesContainer = document.getElementById('heroParticles');
    if (particlesContainer) {
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.top = 60 + Math.random() * 40 + '%';
            p.style.animationDelay = Math.random() * 6 + 's';
            p.style.animationDuration = 4 + Math.random() * 4 + 's';
            const size = 2 + Math.random() * 4;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            particlesContainer.appendChild(p);
        }
    }

    // Parallax on hero - disabled for full image display
    // const heroBg = document.querySelector('.hero-bg img');
    // window.addEventListener('scroll', () => {
    //     const scrolled = window.scrollY;
    //     if (scrolled < window.innerHeight) {
    //         heroBg.style.transform = `translateY(${scrolled * 0.3}px)`;
    //     }
    // });

    // Progress bar animation
    const progressBars = document.querySelectorAll('.progress-bar-fill');
    const progressObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const width = entry.target.style.width;
                entry.target.style.width = '0%';
                setTimeout(() => {
                    entry.target.style.width = width;
                }, 200);
            }
        });
    }, { threshold: 0.5 });

    progressBars.forEach(bar => { progressObserver.observe(bar); });
});
