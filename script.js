// ==========================================
// NOVA TECH - MAIN JAVASCRIPT
// ==========================================

const PRODUCT_STORAGE_KEY = "novatechProducts";

function resolveProductImage(product) {
    const rawImage = product && (product.image || "");
    if (rawImage && rawImage.startsWith("http")) {
        return rawImage;
    }

    if (rawImage) {
        if (rawImage.startsWith("images/") && window.location.pathname.includes("/pages/")) {
            return `../${rawImage}`;
        }
        return rawImage;
    }

    // Do not substitute an old bundled phone image based on brand/name.
    // If the current Supabase product has no image, use only a neutral placeholder.
    return window.location.pathname.includes("/pages/")
        ? "../images/hero-phone.png"
        : "images/hero-phone.png";
}

function getDefaultProductCatalog() {
    // Supabase is the only production catalog source.
    // Never use the old embedded/demo phones as a fallback.
    return [];
}

function sanitizePrice(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    const raw = String(value).replace(/[^\d.]/g, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProduct(product) {
    return {
        id: String(product.id || product.product_id || product.name || Date.now()),
        product_id: product.product_id || product.id || "",
        name: product.name || product.model || "NovaTech Phone",
        brand: product.brand || "NovaTech",
        model: product.model || product.name || "",
        category: product.category || "",
        storage: product.storage || product.capacity || "256GB",
        ram: product.ram || "",
        colour: product.colour || "",
        condition: product.condition || "New",
        lock_status: product.lock_status || "",
        network: product.network || "",
        region: product.region || "",
        price: sanitizePrice(product.price || product.amount || 0),
        old_price: sanitizePrice(product.old_price || 0),
        discount_percent: Math.min(100, Math.max(0, Number(product.discount_percent || 0) || 0)),
        wholesale_price: sanitizePrice(product.wholesale_price || 0),
        stock: Number(product.stock || 0),
        image: resolveProductImage(product),
        availability: Number(product.stock || 0) > 0 ? (product.availability || "In Stock") : (product.availability || "Out of Stock"),
        description: product.description || "A premium NovaTech phone designed for everyday performance.",
        specifications: product.specifications || "",
        shipping: product.shipping || "",
        delivery: product.delivery || "",
        featured: Boolean(product.featured === true || product.featured === "true" || product.featured === 1 || product.featured === "1"),
        new_arrival: Boolean(product.new_arrival === true || product.new_arrival === "true" || product.new_arrival === 1 || product.new_arrival === "1"),
        is_hidden: Boolean(product.is_hidden === true || product.is_hidden === "true" || product.is_hidden === 1 || product.is_hidden === "1"),
        display_order: Number(product.display_order || 0),
        created_at: product.created_at || "",
        updated_at: product.updated_at || ""
    };
}

function getProductPricing(product) {
    const basePrice = Number(product?.price || 0);
    let discountPercent = Math.min(100, Math.max(0, Number(product?.discount_percent || 0) || 0));

    // Back-compat: older listings used old_price without a discount_percent.
    // Derive an equivalent percentage so they still display consistently.
    if (!discountPercent && product?.old_price && Number(product.old_price) > basePrice) {
        discountPercent = Math.round((1 - basePrice / Number(product.old_price)) * 100);
    }

    const finalPrice = discountPercent > 0 ? Math.round((basePrice * (1 - discountPercent / 100)) * 100) / 100 : basePrice;
    return {
        basePrice,
        finalPrice,
        discountPercent,
        hasDiscount: discountPercent > 0 && finalPrice < basePrice
    };
}

function formatMoney(value) {
    return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCardSpecs(product) {
    const parts = [];
    if (product?.storage) parts.push(String(product.storage).trim());
    if (product?.ram) parts.push(`${String(product.ram).trim()} RAM`);
    return parts.join(" • ");
}

function renderDiscountBadgeHtml(pricing) {
    return pricing.hasDiscount ? `<span class="badge badge-discount"><span class="badge-discount-pct">-${pricing.discountPercent}%</span></span>` : "";
}

function renderPriceRowHtml(pricing, sizeClass) {
    const cls = sizeClass || "";
    if (!pricing.hasDiscount) {
        return `<span class="price-now ${cls}">${formatMoney(pricing.basePrice)}</span>`;
    }
    return `
        <span class="price-now ${cls} price-now-discounted">${formatMoney(pricing.finalPrice)}</span>
        <span class="price-was">${formatMoney(pricing.basePrice)}</span>
        <span class="price-save-tag">Save ${pricing.discountPercent}%</span>
    `;
}

async function fetchProductsFromSupabase() {
    const supabase = window.novaSupabase;
    if (!supabase) return [];
    try {
        const { data, error } = await supabase.from("products").select("*").order("display_order", { ascending: true }).order("created_at", { ascending: false });
        if (error) {
            console.error("Supabase catalog load failed:", error);
            const empty = []; empty.__error = error; return empty;
        }
        const mappedProducts = Array.isArray(data) ? data.map(normalizeProduct) : [];
        return mappedProducts;
    } catch (error) {
        console.error("Supabase catalog load failed:", error);
        const empty = []; empty.__error = error; return empty;
    }
}

function getCatalogProducts() {
    // The live Supabase products table is the only catalogue source.
    // Never resurrect an old HTML/localStorage catalogue.
    return [];
}

let novaLiveCatalogPromise = null;

async function getLiveCatalogProducts() {
    if (!window.novaSupabase) {
        return getCatalogProducts();
    }

    if (!novaLiveCatalogPromise) {
        novaLiveCatalogPromise = fetchProductsFromSupabase();
    }

    const result = await novaLiveCatalogPromise;
    if (result && result.__error) {
        return result;
    }

    return Array.isArray(result) ? result : [];
}

async function updateWholesaleProductCount() {
    const countEl = document.getElementById("wholesaleProductCount");
    if (!countEl) return;

    const catalogResult = await getLiveCatalogProducts();
    if (catalogResult && catalogResult.__error) {
        countEl.textContent = "—";
        return;
    }

    const count = Array.isArray(catalogResult)
        ? catalogResult.filter(function (product) { return !product.is_hidden; }).length
        : 0;

    countEl.textContent = count > 0 ? `${count}+` : "0";
}

async function renderHomeBrands() {
    const brandList = document.getElementById("homeBrandList");
    if (!brandList) return;

    const catalogResult = await getLiveCatalogProducts();
    if (catalogResult && catalogResult.__error) {
        brandList.textContent = "Brands are temporarily unavailable.";
        return;
    }

    const products = Array.isArray(catalogResult)
        ? catalogResult.filter(function (product) { return !product.is_hidden; })
        : [];

    const brands = [...new Set(products.map(function (product) {
        return String(product.brand || "").trim();
    }).filter(Boolean))].sort(function (a, b) {
        return a.localeCompare(b);
    });

    if (!brands.length) {
        brandList.textContent = "No brands are currently listed.";
        return;
    }

    brandList.innerHTML = brands.map(function (brand) {
        return `<a href="pages/phones.html?brand=${encodeURIComponent(brand)}">${brand.replace(/</g, "&lt;")}</a>`;
    }).join("");
}

function getCartStorageKey() {
    const user = getCurrentUser();
    return user?.id ? `novatechCart:${user.id}` : "novatechCart:guest";
}
function getStockStatusBadge(stock) {
    const count = Number(stock || 0);
    if (count === 0) {
        return { label: "Out of Stock", className: "badge-out" };
    }
    if (count <= 9) {
        return { label: `Only ${count} left in stock`, className: "badge-low" };
    }
    return { label: "Available", className: "badge-available" };
}

function hasSupabaseSession() {
    try {
        return Object.keys(localStorage).some(function (key) {
            return key.startsWith("sb-") && (key.includes("auth") || key.includes("token"));
        });
    } catch (error) {
        return false;
    }
}

function isLoggedIn() {
    try {
        const localUser = JSON.parse(localStorage.getItem("novaTechUser") || "null");
        if (localUser) {
            return true;
        }
        if (window.novaSupabase) {
            return hasSupabaseSession();
        }
        return false;
    } catch (error) {
        return hasSupabaseSession();
    }
}

async function getAuthenticatedUser() {
    const supabase = window.novaSupabase;
    if (!supabase) {
        return null;
    }

    const { data, error } = await supabase.auth.getUser();
    return error || !data?.user ? null : data.user;
}

function getLoginRedirectPath() {
    return window.location.pathname.includes("/pages/") ? "../login.html" : "login.html";
}


/* ========================================
   NOVATECH PREMIUM AUTH / NOTICE UI
   Replaces browser-native alerts for a cleaner,
   trustworthy storefront experience.
======================================== */
function ensureNovaPremiumDialog() {
    let dialog = document.getElementById("novaPremiumDialog");
    if (dialog) return dialog;

    dialog = document.createElement("div");
    dialog.id = "novaPremiumDialog";
    dialog.className = "nova-premium-dialog";
    dialog.setAttribute("aria-hidden", "true");
    dialog.innerHTML = `
        <div class="nova-premium-dialog-backdrop" data-nova-dialog-close></div>
        <section class="nova-premium-dialog-card" role="dialog" aria-modal="true" aria-labelledby="novaPremiumDialogTitle">
            <button type="button" class="nova-premium-dialog-close" aria-label="Close" data-nova-dialog-close>×</button>
            <div class="nova-premium-dialog-icon" aria-hidden="true">⌁</div>
            <div class="nova-premium-dialog-eyebrow">NOVA TECH</div>
            <h2 id="novaPremiumDialogTitle">Sign in to continue</h2>
            <p id="novaPremiumDialogMessage">Please sign in to your Nova Tech account to continue.</p>
            <div class="nova-premium-dialog-actions">
                <button type="button" class="nova-premium-dialog-primary" id="novaPremiumDialogLogin">Log in</button>
                <button type="button" class="nova-premium-dialog-secondary" data-nova-dialog-close>Continue browsing</button>
            </div>
        </section>
    `;
    document.body.appendChild(dialog);

    dialog.addEventListener("click", function (event) {
        if (event.target.closest("[data-nova-dialog-close]")) {
            hideNovaPremiumDialog();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && dialog.classList.contains("is-open")) {
            hideNovaPremiumDialog();
        }
    });

    return dialog;
}

let novaPremiumDialogReturnTo = "";

function hideNovaPremiumDialog() {
    const dialog = document.getElementById("novaPremiumDialog");
    if (!dialog) return;
    dialog.classList.remove("is-open");
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nova-dialog-open");
}

function getNovaCurrentReturnTarget() {
    const path = window.location.pathname || "/";
    const relative = path.endsWith("/") ? "index.html" : path.split("/").pop();
    const isPages = path.includes("/pages/");
    const cleanPath = isPages ? `pages/${relative}` : relative;
    return `${cleanPath}${window.location.search || ""}${window.location.hash || ""}`;
}

function showLoginPrompt(returnTo, message) {
    const dialog = ensureNovaPremiumDialog();
    novaPremiumDialogReturnTo = returnTo || getNovaCurrentReturnTarget();
    const messageEl = document.getElementById("novaPremiumDialogMessage");
    if (messageEl) {
        messageEl.textContent = message || "Please sign in to your Nova Tech account to continue.";
    }
    const loginButton = document.getElementById("novaPremiumDialogLogin");
    if (loginButton && !loginButton.dataset.bound) {
        loginButton.dataset.bound = "1";
        loginButton.addEventListener("click", function () {
            const loginPage = window.location.pathname.includes("/pages/") ? "../login.html" : "login.html";
            const target = novaPremiumDialogReturnTo || getNovaCurrentReturnTarget();
            window.location.href = `${loginPage}?returnTo=${encodeURIComponent(target)}`;
        });
    }
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("nova-dialog-open");
    window.setTimeout(function () {
        loginButton?.focus();
    }, 50);
}

function showNovaPremiumNotice(message, options) {
    const dialog = ensureNovaPremiumDialog();
    const title = document.getElementById("novaPremiumDialogTitle");
    const messageEl = document.getElementById("novaPremiumDialogMessage");
    const loginButton = document.getElementById("novaPremiumDialogLogin");
    const secondary = dialog.querySelector(".nova-premium-dialog-secondary");
    if (title) title.textContent = options?.title || "Nova Tech";
    if (messageEl) messageEl.textContent = String(message || "");
    if (loginButton) loginButton.style.display = "none";
    if (secondary) secondary.textContent = options?.buttonText || "Close";
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("nova-dialog-open");
}
function showNovaConfirm(message, onConfirm, options) {
    const dialog = ensureNovaPremiumDialog();
    const title = document.getElementById("novaPremiumDialogTitle");
    const messageEl = document.getElementById("novaPremiumDialogMessage");
    const loginButton = document.getElementById("novaPremiumDialogLogin");
    const secondary = dialog.querySelector(".nova-premium-dialog-secondary");

    if (title) title.textContent = options?.title || "Please confirm";
    if (messageEl) messageEl.textContent = String(message || "");
    if (loginButton) {
        loginButton.style.display = "inline-flex";
        loginButton.textContent = options?.confirmText || "Yes, continue";
        loginButton.onclick = function () {
            hideNovaPremiumDialog();
            onConfirm();
        };
    }
    if (secondary) secondary.textContent = options?.cancelText || "Cancel";

    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("nova-dialog-open");
}
window.showNovaConfirm = showNovaConfirm;

window.showLoginPrompt = showLoginPrompt;
window.showNovaPremiumNotice = showNovaPremiumNotice;

// Keep existing site code from opening browser-native alert boxes.
window.alert = function (message) {
    showNovaPremiumNotice(message, { title: "Nova Tech" });
};

function requireLogin(returnTo, message) {
    if (!isLoggedIn()) {
        showLoginPrompt(returnTo || getNovaCurrentReturnTarget(), message || "Please sign in to your Nova Tech account to continue.");
        return false;
    }

    return true;
}

function getLoginReturnTarget() {
    const params = new URLSearchParams(window.location.search);
    const returnTarget = params.get("returnTo");
    return returnTarget ? returnTarget : "pages/account.html";
}

function redirectToLoginForChat() {
    const loginPage = window.location.pathname.includes("/pages/") ? "../login.html" : "login.html";
    const returnTarget = "pages/chat.html?chat=1";
    window.location.href = `${loginPage}?returnTo=${encodeURIComponent(returnTarget)}`;
}

const CHAT_STORAGE_KEY = "novaTechSupportConversations";

function getChatConversations() {
    try {
        const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
        return Array.isArray(stored) ? stored : [];
    } catch (error) {
        return [];
    }
}

function saveChatConversations(conversations) {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(conversations));
}

function getChatMessageCounts(conversation) {
    const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
    const unreadByCustomer = messages.filter(function (message) {
        return message.sender_role === "support" && message.read_by_customer !== true;
    }).length;
    const unreadByAdmin = messages.filter(function (message) {
        return message.sender_role === "customer" && message.read_by_admin !== true;
    }).length;

    conversation.unread_by_customer = unreadByCustomer;
    conversation.unread_by_admin = unreadByAdmin;
    return {
        unreadByCustomer,
        unreadByAdmin
    };
}

function normalizeChatConversation(conversation) {
    if (!conversation || !conversation.id) {
        return null;
    }

    const normalizedMessages = Array.isArray(conversation.messages) ? conversation.messages.map(function (message) {
        return {
            id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sender: message.sender || "Customer",
            sender_role: message.sender_role || "customer",
            text: String(message.text || "").trim(),
            created_at: message.created_at || new Date().toISOString(),
            read_by_customer: Boolean(message.read_by_customer),
            read_by_admin: Boolean(message.read_by_admin),
            attachment_url: message.attachment_url || null,
            attachment_name: message.attachment_name || null,
            attachment_type: message.attachment_type || null
        };
    }) : [];

    const normalized = {
        id: conversation.id,
        customer_email: conversation.customer_email || "",
        customer_name: conversation.customer_name || "Customer",
        customer_profile: conversation.customer_profile || {
            email: conversation.customer_email || "",
            name: conversation.customer_name || "Customer"
        },
        status: conversation.status || "open",
        last_message_at: conversation.last_message_at || new Date().toISOString(),
        created_at: conversation.created_at || new Date().toISOString(),
        updated_at: conversation.updated_at || new Date().toISOString(),
        messages: normalizedMessages,
        unread_by_customer: 0,
        unread_by_admin: 0
    };

    getChatMessageCounts(normalized);
    return normalized;
}

function ensureCustomerChatConversation() {
    const currentUser = getCurrentUser();
    if (!currentUser || !currentUser.email) {
        return null;
    }

    const conversations = getChatConversations();
    const customerEmail = String(currentUser.email).trim().toLowerCase();
    const customerName = currentUser.name || currentUser.email.split("@")[0] || "Customer";
    let conversation = conversations
        .map(normalizeChatConversation)
        .find(function (item) {
            return item && item.customer_email && item.customer_email.toLowerCase() === customerEmail;
        });

    if (!conversation) {
        conversation = {
            id: `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            customer_email: customerEmail,
            customer_name: customerName,
            customer_profile: {
                email: customerEmail,
                name: customerName
            },
            status: "open",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message_at: new Date().toISOString(),
            messages: [
                {
                    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    sender: "NovaTech Support",
                    sender_role: "support",
                    text: "Hello 👋 Welcome to NovaTech. Our support team is here to help.",
                    created_at: new Date().toISOString(),
                    read_by_customer: true,
                    read_by_admin: true
                }
            ]
        };

        conversations.unshift(conversation);
        saveChatConversations(conversations);
    }

    conversation = normalizeChatConversation(conversation);
    if (conversation) {
        const existingIndex = conversations.findIndex(function (item) {
            return item && item.id === conversation.id;
        });

        if (existingIndex >= 0) {
            conversations[existingIndex] = conversation;
            saveChatConversations(conversations);
        }
    }

    return conversation;
}

function appendConversationMessage(conversationId, payload) {
    if (!conversationId || !payload || (!payload.text && !payload.attachment_url)) {
        return null;
    }

    const conversations = getChatConversations();
    const conversation = conversations.find(function (item) {
        return item && item.id === conversationId;
    });

    if (!conversation) {
        return null;
    }

    const message = {
        id: payload.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sender: payload.sender || "Customer",
        sender_role: payload.sender_role || "customer",
        text: String(payload.text || "").trim(),
        created_at: payload.created_at || new Date().toISOString(),
        read_by_customer: Boolean(payload.read_by_customer),
        read_by_admin: Boolean(payload.read_by_admin),
        attachment_url: payload.attachment_url || null,
        attachment_name: payload.attachment_name || null,
        attachment_type: payload.attachment_type || null
    };

    if (!conversation.messages) {
        conversation.messages = [];
    }

    conversation.messages.push(message);
    conversation.updated_at = new Date().toISOString();
    conversation.last_message_at = message.created_at;
    const normalized = normalizeChatConversation(conversation);
    const index = conversations.findIndex(function (item) {
        return item && item.id === conversationId;
    });

    if (index >= 0) {
        conversations[index] = normalized;
        saveChatConversations(conversations);
    }

    return normalized;
}

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function openNovaLightbox(url, altText) {
    if (!url) return;
    let overlay = document.getElementById("novaLightbox");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "novaLightbox";
        overlay.className = "nova-lightbox";
        overlay.innerHTML = `
            <button type="button" class="nova-lightbox-close" aria-label="Close">×</button>
            <img class="nova-lightbox-img" alt="">
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay || event.target.classList.contains("nova-lightbox-close")) {
                closeNovaLightbox();
            }
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") closeNovaLightbox();
        });
    }
    overlay.querySelector(".nova-lightbox-img").src = url;
    overlay.querySelector(".nova-lightbox-img").alt = altText || "Shared image";
    overlay.classList.add("show");
}

function closeNovaLightbox() {
    const overlay = document.getElementById("novaLightbox");
    if (overlay) overlay.classList.remove("show");
}
window.openNovaLightbox = openNovaLightbox;

function showStockAlert(productName) {
    const message = `😔 "${productName || "This phone"}" just sold out. Request a quote and we'll notify you the moment new stock lands — or check out similar phones we have in stock right now.`;
    let toast = document.getElementById("novaStockToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "novaStockToast";
        toast.className = "nova-stock-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(window.__novaStockToastTimer);
    window.__novaStockToastTimer = setTimeout(function () {
        toast.classList.remove("show");
    }, 4500);
}

const CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const CHAT_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;

function validateChatAttachment(file) {
    if (!file) {
        return { ok: false, error: "No file selected." };
    }
    const isImage = CHAT_IMAGE_TYPES.includes(file.type);
    const isVideo = CHAT_VIDEO_TYPES.includes(file.type);
    if (!isImage && !isVideo) {
        return { ok: false, error: "Only JPG, PNG, WEBP, GIF images or MP4/WEBM/MOV videos are supported." };
    }
    const maxBytes = isImage ? CHAT_IMAGE_MAX_BYTES : CHAT_VIDEO_MAX_BYTES;
    if (file.size > maxBytes) {
        return { ok: false, error: `${isImage ? "Images" : "Videos"} must be under ${Math.round(maxBytes / (1024 * 1024))}MB.` };
    }
    return { ok: true, kind: isImage ? "image" : "video" };
}

async function uploadChatAttachment(file, userId) {
    const supabase = window.novaSupabase;
    if (!supabase || !file || !userId) {
        return null;
    }

    const safeName = String(file.name || "attachment").replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-80);
    const path = `chat/${userId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from("chat-attachments").upload(path, file, {
        upsert: false,
        contentType: file.type
    });

    if (uploadError) {
        console.error("Chat attachment upload failed:", uploadError);
        throw uploadError;
    }

    const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    return {
        attachment_url: data?.publicUrl || null,
        attachment_name: file.name || safeName,
        attachment_type: file.type
    };
}

async function saveChatMessageToSupabase(message) {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();
    if (!supabase || !currentUser?.id || (!message?.text && !message?.attachment_url)) {
        return null;
    }

    const { data, error } = await supabase.from("chat_messages").insert([{
        user_id: currentUser.id,
        sender: message.sender_role === "support" ? "support" : "customer",
        message: message.text ? String(message.text).trim() : null,
        attachment_url: message.attachment_url || null,
        attachment_name: message.attachment_name || null,
        attachment_type: message.attachment_type || null,
        read_by_customer: true,
        read_by_admin: false
    }]).select().single();

    if (error) {
        console.error("Chat message save failed:", error);
        return null;
    }

    return {
        ...message,
        id: data.id,
        created_at: data.created_at,
        text: data.message,
        sender_role: data.sender === "customer" ? "customer" : "support"
    };
}

function markCustomerConversationRead(conversationId) {
    const conversations = getChatConversations();
    const conversation = conversations.find(function (item) {
        return item && item.id === conversationId;
    });

    if (!conversation) {
        return null;
    }

    conversation.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    conversation.messages.forEach(function (message) {
        if (message.sender_role === "support") {
            message.read_by_customer = true;
        }
    });

    const normalized = normalizeChatConversation(conversation);
    const index = conversations.findIndex(function (item) {
        return item && item.id === conversationId;
    });

    if (index >= 0) {
        conversations[index] = normalized;
        saveChatConversations(conversations);
    }

    return normalized;
}

function markAdminConversationRead(conversationId) {
    const conversations = getChatConversations();
    const conversation = conversations.find(function (item) {
        return item && item.id === conversationId;
    });

    if (!conversation) {
        return null;
    }

    conversation.messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    conversation.messages.forEach(function (message) {
        if (message.sender_role === "customer") {
            message.read_by_admin = true;
        }
    });

    const normalized = normalizeChatConversation(conversation);
    const index = conversations.findIndex(function (item) {
        return item && item.id === conversationId;
    });

    if (index >= 0) {
        conversations[index] = normalized;
        saveChatConversations(conversations);
    }

    return normalized;
}

function closeConversation(conversationId) {
    const conversations = getChatConversations();
    const conversation = conversations.find(function (item) {
        return item && item.id === conversationId;
    });

    if (!conversation) {
        return null;
    }

    conversation.status = "closed";
    conversation.updated_at = new Date().toISOString();
    const normalized = normalizeChatConversation(conversation);
    const index = conversations.findIndex(function (item) {
        return item && item.id === conversationId;
    });

    if (index >= 0) {
        conversations[index] = normalized;
        saveChatConversations(conversations);
    }

    return normalized;
}

function saveCustomerChatMessage(message, sender) {
    const normalizedMessage = String(message || "").trim();
    if (!normalizedMessage) {
        return null;
    }

    const conversation = ensureCustomerChatConversation();
    if (!conversation) {
        return null;
    }

    const currentUser = getCurrentUser();
    const senderName = sender || currentUser?.name || "Customer";
    const senderRole = sender === "Support" || sender === "NovaTech Support" ? "support" : "customer";
    const updated = appendConversationMessage(conversation.id, {
        sender: senderName,
        sender_role: senderRole,
        text: normalizedMessage,
        created_at: new Date().toISOString(),
        read_by_customer: senderRole === "support" ? false : true,
        read_by_admin: senderRole === "support" ? true : false
    });

    if (senderRole === "support") {
        const customerChatBadge = document.getElementById("unreadChatBadge");
        if (customerChatBadge) {
            const serverCounts = getChatMessageCounts(updated || conversation);
            customerChatBadge.textContent = String(serverCounts.unreadByCustomer || 0);
            customerChatBadge.hidden = !serverCounts.unreadByCustomer;
        }
    }

    return updated;
}

function getCurrentUser() {
    try {
        const localUser = JSON.parse(localStorage.getItem("novaTechUser") || "null");
        if (localUser) {
            return localUser;
        }

        if (!window.novaSupabase) {
            return null;
        }

        const supabaseSession = Object.keys(localStorage).find(function (key) {
            return key.startsWith("sb-") && key.includes("auth") && key.includes("user");
        });

        if (!supabaseSession) {
            return null;
        }

        try {
            const sessionPayload = JSON.parse(localStorage.getItem(supabaseSession) || "null");
            const user = sessionPayload?.user;
            if (!user) {
                return null;
            }

            return {
                id: user.id,
                name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Customer",
                email: user.email,
                role: user.user_metadata?.role || "customer"
            };
        } catch (error) {
            return null;
        }
    } catch (error) {
        return null;
    }
}

async function saveContactMessage(formData) {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();
    let authUser = null;
    if (supabase) {
        const authResult = await supabase.auth.getUser();
        authUser = authResult.data?.user || null;
    }

    const payload = {
        name: (formData.name || "Customer").trim(),
        email: (formData.email || "").trim(),
        phone: (formData.phone || "").trim(),
        subject: (formData.subject || "General enquiry").trim(),
        message: (formData.message || "").trim()
    };

    if (!payload.name || !payload.email || !payload.message) {
        return false;
    }

    if (supabase) {
        try {
            const rpc = await supabase.rpc("submit_contact_message", {
                p_name: payload.name,
                p_email: payload.email,
                p_phone: payload.phone || null,
                p_subject: payload.subject,
                p_message: payload.message
            });
            if (!rpc.error) return true;
            // Fall back to a direct insert for projects that have not yet
            // installed the contact RPC, while still preserving the user id.
            const direct = await supabase.from("contact_messages").insert([{
                name: payload.name,
                email: payload.email,
                phone: payload.phone || null,
                subject: payload.subject,
                message: payload.message,
                customer_id: authUser?.id || currentUser?.id || null
            }]);
            if (!direct.error) return true;
            console.error("Contact message save failed:", direct.error);
        } catch (error) {
            console.error("Contact message save failed:", error);
        }
        return false;
    }
    return false;
}

async function saveCustomerAddress(address) {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();
    if (!supabase || !currentUser?.email) {
        return null;
    }

    try {
        const { data: profileData } = await supabase.from("profiles").select("id").eq("email", currentUser.email).maybeSingle();
        const customerId = profileData?.id || currentUser.id;
        if (!customerId) {
            return null;
        }

        const payload = {
            id: address?.id || `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            customer_id: customerId,
            full_name: address?.full_name || currentUser.name || "Customer",
            phone: address?.phone || currentUser.phone || "",
            address_line_1: address?.address_line_1 || address?.address || "",
            city: address?.city || "",
            state_region: address?.state_region || address?.state || "",
            country: address?.country || "",
            is_default: Boolean(address?.is_default),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from("customer_addresses").upsert(payload, { onConflict: "id" }).select().single();
        if (error) {
            throw error;
        }

        return data;
    } catch (error) {
        console.error("Address save failed:", error);
        return null;
    }
}

async function createCustomerNotification(title, message, type) {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();
    if (!supabase || !currentUser?.email) {
        return null;
    }

    try {
        const { data: profileData } = await supabase.from("profiles").select("id").eq("email", currentUser.email).maybeSingle();
        const customerId = profileData?.id || currentUser.id;
        if (!customerId) {
            return null;
        }

        const { data, error } = await supabase.from("notifications").insert([{
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            customer_id: customerId,
            title: title || "Account update",
            message: message || "",
            type: type || "account",
            read: false,
            created_at: new Date().toISOString()
        }]).select().single();

        if (error) {
            throw error;
        }

        return data;
    } catch (error) {
        console.error("Notification create failed:", error);
        return null;
    }
}

async function saveProductToWishlist(product) {
    const currentUser = getCurrentUser();
    if (!currentUser?.email) {
        showLoginPrompt(getNovaCurrentReturnTarget(), "Sign in to save this phone to your saved list and access it anytime from your account.");
        return null;
    }

    const supabase = window.novaSupabase;
    if (!supabase) {
        return null;
    }

    try {
        const { data: profileData, error: profileError } = await supabase.from("profiles").select("id").eq("email", currentUser.email).maybeSingle();
        if (profileError) {
            throw profileError;
        }

        const customerId = profileData?.id || currentUser.id;
        if (!customerId) {
            return null;
        }

        const payload = {
            id: `wish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            customer_id: customerId,
            product_id: String(product?.id || product?.product_id || ""),
            product_name: product?.name || product?.model || "Phone",
            brand: product?.brand || "",
            storage: product?.storage || "",
            price: Number(product?.price || 0),
            image: product?.image || "",
            availability: product?.availability || "Available",
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from("saved_phones").upsert(payload, { onConflict: "customer_id,product_id" }).select().single();
        if (error) {
            throw error;
        }

        return data;
    } catch (error) {
        console.error("Wishlist save failed:", error);
        alert("This phone could not be saved right now. Please try again.");
        return null;
    }
}

async function removeSavedPhone(savedPhoneId) {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();
    if (!supabase || !savedPhoneId || !currentUser?.email) {
        return false;
    }

    try {
        // saved_phones.customer_id points to profiles.id, not directly to the
        // auth user in this project. Resolve that id before deleting so the
        // request also satisfies the customer's RLS policy.
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", currentUser.email)
            .maybeSingle();

        if (profileError) throw profileError;
        const customerId = profile?.id || null;
        if (!customerId) return false;

        const { data, error } = await supabase
            .from("saved_phones")
            .delete()
            .eq("id", String(savedPhoneId))
            .eq("customer_id", customerId)
            .select("id");

        if (error) throw error;
        return Array.isArray(data) && data.length > 0;
    } catch (error) {
        console.error("Wishlist remove failed:", error);
        return false;
    }
}

function subscribeToCustomerMessages(conversationId, onMessage) {
    const supabase = window.novaSupabase;
    if (!supabase || !conversationId) {
        return null;
    }

    const channel = supabase.channel(`nova-customer-chat-${conversationId}`)
        .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `user_id=eq.${conversationId}`
        }, function (payload) {
            const nextMessage = payload.new;
            if (!nextMessage) {
                return;
            }

            const conversations = getChatConversations();
            const found = conversations.find(function (item) {
                return item && item.id === conversationId;
            });

            if (!found) {
                return;
            }

            const messageEntry = {
                id: nextMessage.id,
                sender: nextMessage.sender === "customer" ? "Customer" : "NovaTech Support",
                sender_role: nextMessage.sender === "customer" ? "customer" : "support",
                text: nextMessage.message || "",
                created_at: nextMessage.created_at || new Date().toISOString(),
                read_by_customer: Boolean(nextMessage.read_by_customer),
                read_by_admin: Boolean(nextMessage.read_by_admin),
                attachment_url: nextMessage.attachment_url || null,
                attachment_name: nextMessage.attachment_name || null,
                attachment_type: nextMessage.attachment_type || null
            };

            if (!found.messages) {
                found.messages = [];
            }

            const exists = found.messages.some(function (message) {
                return message.id === messageEntry.id;
            });

            if (!exists) {
                found.messages.push(messageEntry);
                found.updated_at = new Date().toISOString();
                found.last_message_at = messageEntry.created_at;
                saveChatConversations(conversations);
                if (typeof onMessage === "function") {
                    onMessage(messageEntry, found);
                }
            }
        })
        .subscribe();

    return channel;
}

async function markSupportMessagesRead(userId) {
    const supabase = window.novaSupabase;
    if (!supabase || !userId) return;
    const { error } = await supabase.from("chat_messages").update({ read_by_customer: true }).eq("user_id", userId).eq("sender", "support").eq("read_by_customer", false);
    if (error) console.warn("Could not mark support messages read:", error.message);
}

async function loadCustomerChatFromSupabase(userId) {
    const supabase = window.novaSupabase;
    if (!supabase || !userId) {
        return null;
    }

    const { data, error } = await supabase.from("chat_messages").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) {
        console.error("Customer chat load failed:", error);
        return null;
    }

    const currentUser = getCurrentUser() || {};
    const conversation = normalizeChatConversation({
        id: userId,
        customer_email: currentUser.email || "",
        customer_name: currentUser.name || "Customer",
        status: "open",
        messages: (data || []).map(function (message) {
            return {
                id: message.id,
                sender: message.sender === "customer" ? currentUser.name || "Customer" : "NovaTech Support",
                sender_role: message.sender === "customer" ? "customer" : "support",
                text: message.message || "",
                created_at: message.created_at,
                read_by_customer: message.read_by_customer === true,
                read_by_admin: message.read_by_admin === true,
                attachment_url: message.attachment_url || null,
                attachment_name: message.attachment_name || null,
                attachment_type: message.attachment_type || null
            };
        })
    });

    const conversations = getChatConversations().filter(function (item) {
        return item && item.id !== userId && item.customer_email !== currentUser.email;
    });
    conversations.unshift(conversation);
    saveChatConversations(conversations);
    return conversation;
}

function buildQuoteNumber(type = "retail") {
    const quotes = JSON.parse(localStorage.getItem("novaTechQuotes") || "[]");
    const extracted = quotes
        .map(function (quote) {
            const candidate = String(quote.quote_number || quote.quote_id || "").replace(/[^0-9]/g, "");
            return Number(candidate || 0);
        })
        .filter(function (value) {
            return Number.isFinite(value) && value > 0;
        });

    const nextValue = extracted.length ? Math.max(...extracted) + 1 : 10001;
    return `NT-${String(type).toLowerCase() === "wholesale" ? "WQ" : "RQ"}-${nextValue}`;
}

function normalizeQuoteRecord(quote) {
    const normalized = quote || {};
    const status = String(normalized.status || "NEW").trim();
    const quantity = Number(normalized.quantity || 1);
    const quotedPrice = Number(normalized.quoted_price || normalized.quotedPrice || 0);
    const shippingCost = Number(normalized.shipping_cost || normalized.shippingCost || 0);
    const totalAmount = Number(normalized.total_amount || normalized.totalAmount || (quotedPrice + shippingCost) || 0);

    return {
        id: normalized.id || normalized.quote_id || `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        quote_id: normalized.quote_id || normalized.id || `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        quote_number: normalized.quote_number || buildQuoteNumber(),
        customer_id: normalized.customer_id || null,
        customer_name: normalized.customer_name || normalized.customer || "Customer",
        customer: normalized.customer_name || normalized.customer || "Customer",
        email: normalized.email || normalized.customer_email || "",
        customer_email: normalized.customer_email || normalized.email || "",
        phone: normalized.phone || normalized.customer_phone || "",
        customer_phone: normalized.customer_phone || normalized.phone || "",
        product_name: normalized.product_name || normalized.product || "General enquiry",
        product: normalized.product_name || normalized.product || "General enquiry",
        product_id: normalized.product_id || null,
        product_image: normalized.product_image || normalized.image || "",
        quantity: quantity,
        condition: normalized.condition || "new",
        destination: normalized.destination || "",
        shipping_preference: normalized.shipping_preference || normalized.shippingMethod || "standard",
        message: normalized.message || normalized.customer_message || "",
        customer_message: normalized.customer_message || normalized.message || "",
        status: status.toUpperCase() === "NEW" ? "NEW" : status,
        admin_note: normalized.admin_note || "",
        admin_message: normalized.admin_message || "",
        quoted_price: quotedPrice,
        shipping_cost: shippingCost,
        total_amount: totalAmount,
        estimated_delivery: normalized.estimated_delivery || "",
        created_at: normalized.created_at || normalized.createdAt || new Date().toISOString(),
        createdAt: normalized.created_at || normalized.createdAt || new Date().toISOString(),
        updated_at: normalized.updated_at || new Date().toISOString(),
        quote_date: normalized.quote_date || normalized.created_at || normalized.createdAt || new Date().toISOString(),
        order_id: normalized.order_id || null,
        order_status: normalized.order_status || null,
        accepted_at: normalized.accepted_at || null,
        declined_at: normalized.declined_at || null,
        closed_at: normalized.closed_at || null,
        customer_accepted_at: normalized.customer_accepted_at || null,
        customer_declined_at: normalized.customer_declined_at || null
    };
}

async function saveQuoteRequest(formData) {
    const quotedId = `QT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const quoteType = String(formData.quoteType || "retail").toLowerCase() === "wholesale" ? "wholesale" : "retail";
    const currentUser = getCurrentUser();
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
        throw new Error("Please confirm your email and sign in before requesting a quote.");
    }
    const quoteNumber = buildQuoteNumber(quoteType);
    const payload = {
        id: quotedId,
        quote_id: quotedId,
        quote_number: quoteNumber,
        quote_type: quoteType,
        business_name: (formData.businessName || "").trim(),
        business_type: (formData.businessType || "").trim(),
        monthly_volume: (formData.monthlyVolume || "").trim(),
        moq_acknowledged: Boolean(formData.moqAcknowledged),
        customer_id: authUser.id,
        customer_name: (formData.name || currentUser?.name || "Customer").trim(),
        customer: (formData.name || currentUser?.name || "Customer").trim(),
        email: (formData.email || currentUser?.email || "").trim(),
        customer_email: (formData.email || currentUser?.email || "").trim(),
        phone: (formData.phone || "").trim(),
        customer_phone: (formData.phone || "").trim(),
        product_name: (formData.phoneModel || "General enquiry").trim(),
        product: (formData.phoneModel || "General enquiry").trim(),
        product_id: formData.productId || null,
        product_image: formData.productImage || "",
        quantity: Number(formData.quantity || 1),
        condition: (formData.condition || "new").toLowerCase(),
        lock_status_requested: (formData.lockStatusRequested || "").trim() || null,
        network_requested: (formData.networkRequested || "").trim() || null,
        destination: `${formData.city || ""}${formData.city && formData.country ? ", " : ""}${formData.country || ""}`.trim(),
        shipping_preference: formData.shippingMethod || "standard",
        message: (formData.message || "").trim(),
        customer_message: (formData.message || "").trim(),
        status: "NEW",
        admin_note: "",
        admin_message: "",
        quoted_price: null,
        shipping_cost: null,
        total_amount: null,
        estimated_delivery: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const normalizedQuote = normalizeQuoteRecord(payload);

    const supabase = window.novaSupabase;
    if (!supabase) {
        throw new Error("We couldn't reach NovaTech's servers. Please check your connection and try again.");
    }

    const quotePayload = {
        id: payload.id,
        quote_number: payload.quote_number,
        quote_type: payload.quote_type,
        business_name: payload.business_name,
        business_type: payload.business_type,
        monthly_volume: payload.monthly_volume,
        moq_acknowledged: payload.moq_acknowledged,
        customer_id: payload.customer_id,
        customer_name: payload.customer_name,
        email: payload.email,
        phone: payload.phone,
        customer_phone: payload.customer_phone,
        product_id: payload.product_id,
        product_name: payload.product_name,
        product_image: payload.product_image,
        quantity: payload.quantity,
        condition: payload.condition,
        lock_status_requested: payload.lock_status_requested,
        network_requested: payload.network_requested,
        destination: payload.destination,
        shipping_preference: payload.shipping_preference,
        message: payload.message,
        customer_message: payload.customer_message,
        status: payload.status,
        admin_note: payload.admin_note,
        admin_message: payload.admin_message,
        quoted_price: payload.quoted_price,
        shipping_cost: payload.shipping_cost,
        total_amount: payload.total_amount,
        estimated_delivery: payload.estimated_delivery,
        created_at: payload.created_at,
        updated_at: payload.updated_at
    };

    // Submitted through an RPC (with explicit column casts inside the
    // function) rather than a raw table insert, because a raw insert was
    // hitting "column customer_id is of type uuid but expression is of
    // type text" on some Supabase projects — a PostgREST/Postgres type
    // inference quirk. The RPC sidesteps it entirely with explicit casts.
    let data, error;
    const rpcResult = await supabase.rpc("submit_quote", { payload: quotePayload });
    if (rpcResult.error && /Could not find the function|does not exist/i.test(rpcResult.error.message || "")) {
        // Migration not run yet on this project — fall back to the direct
        // insert so quote submission still works until it is.
        console.warn("submit_quote RPC not found, falling back to direct insert. Run UPGRADE_V6_SUBMIT_QUOTE_RPC.sql to fix the uuid/text error permanently.");
        const fallback = await supabase.from("quotes").insert([quotePayload]).select().maybeSingle();
        data = fallback.data;
        error = fallback.error;
    } else {
        data = rpcResult.data;
        error = rpcResult.error;
    }

    if (error) {
        console.error("Quote insert failed:", error);
        // Do NOT fall back to a localStorage-only "success" — a quote that
        // isn't actually in Supabase will never reach the admin dashboard,
        // so the customer needs to know it genuinely failed.
        throw new Error(error.message || "Your quote could not be saved. Please try again.");
    }

    // The RPC returns a single row object; the raw-insert fallback (with
    // .select()) also normalized to a single row via .maybeSingle() above,
    // but handle the array shape too in case Supabase changes RPC return shape.
    const savedRow = Array.isArray(data) ? data[0] : data;
    if (!savedRow) {
        throw new Error("Your quote could not be saved. Please try again.");
    }

    const syncedQuote = normalizeQuoteRecord(savedRow);
    localStorage.setItem("novaTechQuotes", JSON.stringify([
        ...JSON.parse(localStorage.getItem("novaTechQuotes") || "[]").filter(function (quote) {
            return String(quote.id) !== String(savedRow.id);
        }),
        syncedQuote
    ]));
    return syncedQuote;
}

async function createOrderFromCart() {
    const cart = JSON.parse(localStorage.getItem(getCartStorageKey()) || "[]");
    if (!cart.length) {
        alert("Your cart is empty.");
        return null;
    }

    const currentUser = getCurrentUser();
    const orderId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0")}`;
    const subtotal = cart.reduce(function (sum, item) {
        return sum + Number(item.price || 0);
    }, 0);
    const shipping = subtotal > 0 ? 25 : 0;
    const total = subtotal + shipping;

    const orderPayload = {
        id: orderId,
        user_id: currentUser?.id || null,
        item_name: cart.map(function (item) {
            return `${item.name} (${item.quantity || 1})`;
        }).join(", "),
        amount: total,
        status: "pending",
        created_at: new Date().toISOString()
    };

    const supabase = window.novaSupabase;
    if (supabase) {
        try {
            const { data, error } = await supabase.from("orders").insert([orderPayload]).select().single();
            if (!error) {
                const orderItems = cart.map(function (item) {
                    return {
                        id: `${Date.now()}-${String(item.id).replace(/[^a-zA-Z0-9]/g, "-")}`,
                        order_id: String(data.id),
                        product_id: item.id || null,
                        product_name: item.name || "Phone",
                        quantity: Number(item.quantity || 1),
                        unit_price: Number(item.price || 0),
                        subtotal: Number(item.price || 0) * Number(item.quantity || 1)
                    };
                });
                const itemsResult = await supabase.from("order_items").insert(orderItems);
                if (itemsResult.error) {
                    console.error("Order items insert failed:", itemsResult.error);
                }
                localStorage.removeItem("novaTechOrders");
                localStorage.removeItem(getCartStorageKey());
                updateCartCount();
                renderCartDrawer();
                return orderPayload;
            } else {
                console.error("Order insert failed:", error);
            }
        } catch (error) {
            console.error("Supabase order insert error:", error);
        }
    }

    const localOrders = JSON.parse(localStorage.getItem("novaTechOrders") || "[]");
    localOrders.push({
        ...orderPayload,
        order_id: orderPayload.id,
        customer: currentUser?.name || "Customer",
        email: currentUser?.email || "",
        products: orderPayload.item_name
    });
    localStorage.setItem("novaTechOrders", JSON.stringify(localOrders));
    localStorage.removeItem(getCartStorageKey());
    updateCartCount();
    renderCartDrawer();
    return orderPayload;
}

async function createOrderFromQuote(quote) {
    const customer = getCurrentUser() || { name: quote.customer_name || "Customer", email: quote.email || quote.customer_email || "" };
    const finalQuote = normalizeQuoteRecord(quote);
    const orderId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0")}`;
    const orderPayload = {
        id: orderId,
        user_id: customer.id || null,
        item_name: finalQuote.product_name || "Phone quote",
        amount: Number(finalQuote.total_amount || finalQuote.quoted_price || 0) + Number(finalQuote.shipping_cost || 0),
        status: "pending",
        created_at: new Date().toISOString()
    };

    const localOrders = JSON.parse(localStorage.getItem("novaTechOrders") || "[]");
    localOrders.push({
        ...orderPayload,
        order_id: orderPayload.id,
        status: "pending",
        amount: orderPayload.amount,
        customer: customer.name || "Customer",
        email: customer.email || "",
        products: orderPayload.item_name,
        item: orderPayload.item_name
    });
    localStorage.setItem("novaTechOrders", JSON.stringify(localOrders));

    if (window.novaSupabase) {
        try {
            const { error } = await window.novaSupabase.from("orders").insert([orderPayload]).select().single();
            if (error) {
                console.error("Quote acceptance order insert failed:", error);
            }
        } catch (error) {
            console.error("Quote acceptance order insert failed:", error);
        }
    }

    const quoteList = JSON.parse(localStorage.getItem("novaTechQuotes") || "[]");
    const targetIndex = quoteList.findIndex(function (item) {
        return String(item.id) === String(finalQuote.id) || String(item.quote_id) === String(finalQuote.quote_id);
    });
    if (targetIndex >= 0) {
        quoteList[targetIndex].status = "ACCEPTED";
        quoteList[targetIndex].order_id = orderId;
        quoteList[targetIndex].updated_at = new Date().toISOString();
        localStorage.setItem("novaTechQuotes", JSON.stringify(quoteList));
    }

    return orderPayload;
}

async function ensureCustomerProfile() {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();

    if (!supabase || !currentUser?.email) {
        return currentUser;
    }

    try {
        const { data: authUserData, error: authError } = await supabase.auth.getUser();
        if (authError) {
            console.error("Could not read authenticated user:", authError);
            return currentUser;
        }

        const authUser = authUserData?.user || null;
        const authId = authUser?.id || null;
        if (!authId) return currentUser;

        // Never overwrite an existing database role/status with the value
        // from browser metadata. This prevents an admin account from being
        // accidentally changed to customer just by visiting the storefront.
        let existingProfile = null;
        const byId = await supabase.from("profiles")
            .select("id,full_name,email,phone,role,account_status,auth_user_id")
            .eq("id", authId)
            .maybeSingle();
        if (!byId.error) existingProfile = byId.data || null;
        if (!existingProfile) {
            const byAuth = await supabase.from("profiles")
                .select("id,full_name,email,phone,role,account_status,auth_user_id")
                .eq("auth_user_id", authId)
                .maybeSingle();
            if (!byAuth.error) existingProfile = byAuth.data || null;
        }

        const safeRole = existingProfile?.role || currentUser.role || "customer";
        const safeStatus = existingProfile?.account_status || "active";
        const profilePayload = {
            id: authId,
            auth_user_id: String(authId),
            full_name: existingProfile?.full_name || currentUser.name || authUser?.user_metadata?.full_name || currentUser.email.split("@")[0],
            email: existingProfile?.email || currentUser.email || authUser.email,
            phone: existingProfile?.phone || currentUser.phone || "",
            role: safeRole,
            account_status: safeStatus,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from("profiles")
            .upsert(profilePayload, { onConflict: "id" })
            .select()
            .single();
        if (error) {
            console.error("Profile upsert failed:", error);
            return currentUser;
        }

        if (data) {
            const resolvedUser = {
                id: data.id || authId,
                name: data.full_name || currentUser.name || "Customer",
                email: data.email || currentUser.email,
                phone: data.phone || currentUser.phone || "",
                role: data.role || safeRole,
                account_status: data.account_status || safeStatus
            };
            setCurrentUser(resolvedUser);
            return resolvedUser;
        }
    } catch (error) {
        console.error("Customer profile sync error:", error);
    }

    return currentUser;
}

async function fetchCustomerDashboardData() {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();

    if (!supabase || !currentUser?.email) {
        return {
            profile: currentUser,
            orders: [],
            quotes: [],
            addresses: [],
            wishlist: [],
            notifications: [],
            errors: []
        };
    }

    try {
        const profileResult = await supabase.from("profiles").select("*").eq("email", currentUser.email).maybeSingle();
        const profile = profileResult?.data || null;

        const customerId = profile?.id || currentUser.id;
        const tableNames = ["orders", "quotes", "saved_phones", "customer_addresses", "notifications"];
        const [ordersResult, quotesResult, wishlistResult, addressesResult, notificationsResult] = await Promise.all([
            customerId ? supabase.from("orders").select("*").eq("user_id", customerId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
            customerId ? supabase.from("quotes").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
            customerId ? supabase.from("saved_phones").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
            customerId ? supabase.from("customer_addresses").select("*").eq("customer_id", customerId).order("is_default", { ascending: false }).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
            customerId ? supabase.from("notifications").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }) : Promise.resolve({ data: [] })
        ]);

        const rawResults = [ordersResult, quotesResult, wishlistResult, addressesResult, notificationsResult];
        const errors = rawResults
            .map(function (result, index) { return result?.error ? { table: tableNames[index], message: result.error.message } : null; })
            .filter(Boolean);
        if (profileResult?.error) errors.unshift({ table: "profiles", message: profileResult.error.message });
        if (errors.length) console.error("Dashboard data errors:", errors);

        return {
            profile: profile || currentUser,
            orders: Array.isArray(ordersResult.data) ? ordersResult.data : [],
            quotes: Array.isArray(quotesResult.data) ? quotesResult.data : [],
            wishlist: Array.isArray(wishlistResult.data) ? wishlistResult.data : [],
            addresses: Array.isArray(addressesResult.data) ? addressesResult.data : [],
            notifications: Array.isArray(notificationsResult.data) ? notificationsResult.data : [],
            errors: errors
        };
    } catch (error) {
        console.error("Dashboard data fetch failed:", error);
        return {
            profile: currentUser,
            orders: [],
            quotes: [],
            addresses: [],
            wishlist: [],
            notifications: [],
            errors: [{ table: "dashboard", message: error?.message || "Unknown error" }]
        };
    }
}

function setCurrentUser(user) {
    const safeUser = {
        id: user?.id || user?.user_id || null,
        name: user?.name || "Customer",
        email: user?.email || "",
        phone: user?.phone || "",
        role: user?.role || "customer"
    };

    localStorage.setItem("novaTechUser", JSON.stringify(safeUser));

    if (window.novaSupabase && safeUser.email) {
        try {
            const sessionUser = {
                id: safeUser.id,
                email: safeUser.email,
                user_metadata: {
                    full_name: safeUser.name || safeUser.email.split("@")[0],
                    role: safeUser.role || "customer",
                    phone: safeUser.phone || ""
                }
            };
            localStorage.setItem("novaTechSupabaseSessionUser", JSON.stringify(sessionUser));
        } catch (error) {
            console.error("Could not store fallback user session:", error);
        }
    }
}

window.saveCustomerAddress = saveCustomerAddress;
window.createCustomerNotification = createCustomerNotification;
window.subscribeToCustomerMessages = subscribeToCustomerMessages;

function getCurrentUserRole() {
    const user = getCurrentUser();
    if (!user) {
        return "customer";
    }

    if (user.role === "admin") {
        return "admin";
    }

    if (String(user.email || "").toLowerCase().includes("admin")) {
        return "admin";
    }

    return "customer";
}

function getPageAssetPath(relativePath) {
    return (window.location.pathname.includes("/pages/") ? "../" : "") + relativePath;
}

window.isLoggedIn = isLoggedIn;
window.requireLogin = requireLogin;
window.getCurrentUser = getCurrentUser;
window.setCurrentUser = setCurrentUser;
window.saveProductToWishlist = saveProductToWishlist;
window.removeSavedPhone = removeSavedPhone;
window.ensureCustomerProfile = ensureCustomerProfile;
window.fetchCustomerDashboardData = fetchCustomerDashboardData;

async function renderHomeProducts() {
    const homeGrid = document.querySelector(".product-grid");
    if (!homeGrid) return;

    const catalogResult = await getLiveCatalogProducts();
    if (catalogResult && catalogResult.__error) {
        homeGrid.innerHTML = '<div class="empty-state">We could not load the current NovaTech catalogue. Please refresh the page.</div>';
        return;
    }

    const catalogProducts = Array.isArray(catalogResult) ? catalogResult : [];
    const visible = catalogProducts.filter(p => !p.is_hidden);
    const featured = visible.filter(p => p.featured).sort((a,b) => Number(a.display_order||0)-Number(b.display_order||0));
    const remaining = visible.filter(p => !p.featured).sort((a,b) => Number(a.display_order||0)-Number(b.display_order||0));
    const products = [...featured, ...remaining].slice(0, 8);

    homeGrid.innerHTML = products.length ? products.map(function (product) {
        const imagePath = resolveProductImage(product);
        const stock = Number(product.stock || 0);
        const pricing = getProductPricing(product);
        const badges = [];
        if (product.new_arrival) badges.push('<span class="badge badge-new">New</span>');
        badges.push(renderDiscountBadgeHtml(pricing));
        const stockStatus = getStockStatusBadge(stock);
        badges.push(`<span class="badge ${stockStatus.className}">${stockStatus.label}</span>`);
        return `
            <article class="product-card" data-id="${String(product.id).replace(/"/g,'&quot;')}">
                <div class="product-image"><div class="product-badges">${badges.join("")}</div><img src="${imagePath}" alt="${String(product.name).replace(/"/g,'&quot;')}" loading="lazy"></div>
                <div class="product-details"><p class="brand">${product.brand}</p><h3>${product.name}</h3><p class="product-price">${renderPriceRowHtml(pricing)}</p><p class="product-spec">${formatCardSpecs(product)}</p><a href="pages/product.html?id=${encodeURIComponent(product.id)}" class="product-button">View Details</a></div>
            </article>`;
    }).join("") : '<div class="empty-state">No products are currently listed. Add phones from the Admin Dashboard.</div>';
}

async function resolveCustomerId() {
    const supabase = window.novaSupabase;
    const currentUser = getCurrentUser();
    if (!supabase || !currentUser?.email) return null;
    try {
        const { data } = await supabase.from("profiles").select("id").eq("email", currentUser.email).maybeSingle();
        return data?.id || currentUser.id || null;
    } catch (error) {
        return currentUser.id || null;
    }
}

async function markAlreadySavedButtons(scopeSelector) {
    const supabase = window.novaSupabase;
    if (!supabase || !isLoggedIn()) return;
    const customerId = await resolveCustomerId();
    if (!customerId) return;
    try {
        const { data } = await supabase.from("saved_phones").select("product_id").eq("customer_id", customerId);
        const savedIds = new Set((data || []).map(function (row) { return String(row.product_id); }));
        document.querySelectorAll(scopeSelector).forEach(function (button) {
            const card = button.closest("[data-id]");
            if (card && savedIds.has(String(card.dataset.id))) {
                button.textContent = "Saved ✓";
                button.disabled = true;
            }
        });
    } catch (error) {
        console.warn("Could not check saved phones:", error);
    }
}

async function renderPhonesGrid() {
    const phonesGrid = document.getElementById("phonesGrid");
    const noPhoneResults = document.getElementById("noPhoneResults");
    const phoneSearch = document.getElementById("phoneSearch");
    const brandFilter = document.querySelector(".phone-brand-filters");

    if (!phonesGrid) {
        return;
    }

    const catalogResult = await getLiveCatalogProducts();
    if (catalogResult && catalogResult.__error) {
        phonesGrid.innerHTML = "";
        if (noPhoneResults) {
            noPhoneResults.style.display = "block";
            noPhoneResults.querySelector("h3")?.replaceChildren(document.createTextNode("Catalogue unavailable"));
            noPhoneResults.querySelector("p")?.replaceChildren(document.createTextNode("Please refresh and try again."));
        }
        return;
    }

    const products = Array.isArray(catalogResult) ? catalogResult.filter(p => !p.is_hidden) : [];
    // Build brand filters from the LIVE Supabase catalogue.
    // No old phone names are hardcoded into the page.
    if (brandFilter) {
        const brands = [...new Set(products.map(p => String(p.brand || "").trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));

        brandFilter.innerHTML = `
            <button class="phone-brand-button active" data-brand="all" type="button">All Phones</button>
            ${brands.map(brand => `<button class="phone-brand-button" data-brand="${String(brand).replace(/"/g, "&quot;")}" type="button">${String(brand).replace(/</g, "&lt;")}</button>`).join("")}
        `;
    }

    const brandButtons = document.querySelectorAll(".phone-brand-button");
    let selectedBrand = "all";
    const params = new URLSearchParams(window.location.search);
    const requestedBrand = params.get("brand");
    if (requestedBrand) {
        selectedBrand = requestedBrand;
    }

    function applyFilter() {
        const query = (phoneSearch?.value || "").toLowerCase().trim();
        let visibleCount = 0;

        Array.from(phonesGrid.children).forEach(function (card) {
            const cardBrand = (card.dataset.brand || "").toLowerCase();
            const cardName = (card.dataset.name || "").toLowerCase();
            const matchesBrand = selectedBrand === "all" || cardBrand === selectedBrand.toLowerCase();
            const matchesSearch = !query || cardName.includes(query);

            const isVisible = matchesBrand && matchesSearch;
            card.style.display = isVisible ? "" : "none";
            if (isVisible) visibleCount++;
        });

        if (noPhoneResults) {
            noPhoneResults.style.display = visibleCount === 0 ? "block" : "none";
        }
    }

    phonesGrid.innerHTML = products.map(function (product) {
        const imagePath = resolveProductImage(product);
        const stock = Number(product.stock || 0);
        const pricing = getProductPricing(product);
        const outOfStock = stock <= 0;
        return `
            <article class="phone-card" data-id="${product.id}" data-brand="${product.brand}" data-name="${product.name}" data-storage="${product.storage}" data-price="${pricing.finalPrice}" data-base-price="${pricing.basePrice}" data-image="${imagePath}" data-stock="${stock}">
                <div class="phone-card-image">
                    ${pricing.hasDiscount ? renderDiscountBadgeHtml(pricing) : ""}
                    <img src="${imagePath}" alt="${product.name}">
                </div>
                <div class="phone-card-content">
                    <p class="phone-brand">${product.brand}</p>
                    <h3>${product.name}</h3>
                    <p class="phone-storage">${formatCardSpecs(product)}</p>
                    <p class="phone-availability">${outOfStock ? "Out of Stock" : (product.availability || "In Stock")}</p>
                    <p class="phone-price">${renderPriceRowHtml(pricing)}</p>
                    <div class="phone-card-actions">
                        <a href="product.html?id=${product.id}" class="product-button">View Product</a>
                        <button type="button" class="save-phone-button">Save</button>
                        <button type="button" class="add-cart-button" ${outOfStock ? "disabled" : ""}>${outOfStock ? "Out of Stock" : "Add to Cart"}</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    document.querySelectorAll(".save-phone-button").forEach(function (button) {
        button.addEventListener("click", async function () {
            const card = button.closest(".phone-card");
            const product = {
                id: card?.dataset.id || "",
                name: card?.dataset.name || "NovaTech Phone",
                brand: card?.dataset.brand || "NovaTech",
                storage: card?.dataset.storage || "",
                price: Number(card?.dataset.price || 0),
                image: card?.dataset.image || "../images/hero-phone.png",
                availability: "Available"
            };

            const saved = await saveProductToWishlist(product);
            if (saved) {
                button.textContent = "Saved ✓";
                button.disabled = true;
            }
        });
    });

    markAlreadySavedButtons(".save-phone-button");

    brandButtons.forEach(function (button) {
        const isActive = button.dataset.brand === selectedBrand || (selectedBrand === "all" && button.dataset.brand === "all");
        button.classList.toggle("active", isActive);

        button.addEventListener("click", function () {
            selectedBrand = button.dataset.brand;
            brandButtons.forEach(function (item) {
                item.classList.remove("active");
            });
            button.classList.add("active");

            const url = new URL(window.location.href);
            url.searchParams.set("brand", selectedBrand);
            window.history.replaceState({}, "", url);
            applyFilter();
        });
    });

    if (phoneSearch) {
        phoneSearch.addEventListener("input", applyFilter);
    }

    document.querySelectorAll(".add-cart-button").forEach(function (button) {
        button.addEventListener("click", function () {
            if (button.disabled) return;
            if (!window.requireLogin || !window.requireLogin()) {
                return;
            }

            const card = button.closest(".phone-card");
            const stock = Number(card?.dataset.stock || 0);
            if (stock <= 0) {
                showStockAlert(card?.dataset.name);
                return;
            }

            const product = {
                id: card?.dataset.id || Date.now(),
                name: card?.dataset.name || "NovaTech Phone",
                brand: card?.dataset.brand || "NovaTech",
                storage: card?.dataset.storage || "",
                price: Number(card?.dataset.price || 0),
                image: card?.dataset.image || "../images/hero-phone.png"
            };

            window.addToCart(product);
            button.textContent = "Added ✓";
            button.disabled = true;
        });
    });

    applyFilter();
}
async function renderProductDetail() {
    if (!document.getElementById("productImage") || document.getElementById("productForm")) {
        return;
    }

    const productId = new URLSearchParams(window.location.search).get("id") || "";
    const catalogResult = await getLiveCatalogProducts();
    if (catalogResult && catalogResult.__error) {
        document.getElementById("productLoadingState")?.setAttribute("style", "display:none;");
        document.getElementById("productContent")?.setAttribute("style", "display:grid;");
        document.getElementById("productName")?.replaceChildren(document.createTextNode("Catalogue unavailable"));
        document.getElementById("productDescription")?.replaceChildren(document.createTextNode("Please refresh and try again."));
        return;
    }

    const products = Array.isArray(catalogResult) ? catalogResult.filter(p => !p.is_hidden) : [];
    const product = products.find(function (item) {
        return String(item.id) === String(productId);
    });

    if (!product) {
        // Don't silently substitute a random different phone — that's
        // confusing and was the source of a "wrong phone flashes" bug.
        // Show an honest not-found state instead.
        document.getElementById("productLoadingState")?.setAttribute("style", "display:none;");
        document.getElementById("productContent")?.setAttribute("style", "display:grid;");
        const productNameEl = document.getElementById("productName");
        const productBrandEl = document.getElementById("productBrand");
        const productDescriptionEl = document.getElementById("productDescription");
        if (productNameEl) productNameEl.textContent = "Phone not found";
        if (productBrandEl) productBrandEl.textContent = "";
        if (productDescriptionEl) productDescriptionEl.textContent = "This phone may have been removed or is no longer available. Please browse our current phones.";
        document.getElementById("addToCart")?.setAttribute("disabled", "true");
        document.getElementById("saveProduct")?.setAttribute("disabled", "true");
        return;
    }

    // Real product data is ready — swap the big-dot loading state for
    // the actual page content.
    document.getElementById("productLoadingState")?.setAttribute("style", "display:none;");
    document.getElementById("productContent")?.setAttribute("style", "display:grid;");

    const productImageEl = document.getElementById("productImage");
    const productBrandEl = document.getElementById("productBrand");
    const productNameEl = document.getElementById("productName");
    const productStorageEl = document.getElementById("productStorage");
    const productAvailabilityEl = document.getElementById("productAvailability");
    const productDescriptionEl = document.getElementById("productDescription");
    const productPriceEl = document.getElementById("productPrice");
    const productOldPriceEl = document.getElementById("productOldPrice");
    const productBadgesEl = document.getElementById("productBadges");
    const productShippingEl = document.getElementById("productShippingInfo");

    if (productImageEl) { productImageEl.src = product.image || "../images/hero-phone.png"; productImageEl.alt = product.name; }
    if (productBrandEl) productBrandEl.textContent = product.brand || "NovaTech";
    if (productNameEl) productNameEl.textContent = product.name || "Phone";
    if (productStorageEl) productStorageEl.textContent = formatCardSpecs(product) || product.storage || "";
        if (productAvailabilityEl) {
        const stockStatus = getStockStatusBadge(product.stock);
        productAvailabilityEl.textContent = stockStatus.label;
    }
    if (productDescriptionEl) productDescriptionEl.textContent = product.description || "No description available yet.";
    if (productShippingEl && product.shipping) productShippingEl.textContent = product.shipping;

    const pricing = getProductPricing(product);
    if (productPriceEl) productPriceEl.textContent = formatMoney(pricing.finalPrice);
    if (productOldPriceEl) {
        if (pricing.hasDiscount) {
            productOldPriceEl.textContent = formatMoney(pricing.basePrice);
            productOldPriceEl.style.display = "inline";
        } else {
            productOldPriceEl.style.display = "none";
        }
    }
    const productDiscountTagEl = document.getElementById("productDiscountTag");
    if (productDiscountTagEl) {
        productDiscountTagEl.style.display = pricing.hasDiscount ? "inline-flex" : "none";
        productDiscountTagEl.textContent = pricing.hasDiscount ? `Save ${pricing.discountPercent}%` : "";
    }

    const stock = Number(product.stock || 0);
    if (productBadgesEl) {
        const badges = [];
        if (product.new_arrival) badges.push('<span class="badge badge-new">New</span>');
        badges.push(renderDiscountBadgeHtml(pricing));
        if (stock === 0) badges.push('<span class="badge badge-out">Out of Stock</span>');
        else if (stock <= 5) badges.push('<span class="badge badge-low">Low Stock</span>');
        productBadgesEl.innerHTML = badges.join(" ");
    }

    const specRows = [
        ["Model", product.model],
        ["Category", product.category],
        ["RAM", product.ram],
        ["Colour", product.colour],
        ["Condition", product.condition],
        ["Lock Status", product.lock_status],
        ["Network", product.network],
        ["Region", product.region],
        ["Delivery", product.delivery]
    ].filter(function (row) { return row[1] && String(row[1]).trim(); });
    const productSpecsEl = document.getElementById("productSpecs");
    if (productSpecsEl) {
        productSpecsEl.innerHTML = specRows.map(function (row) {
            return `<div class="spec-row"><span>${escapeHtml(row[0])}</span><strong>${escapeHtml(row[1])}</strong></div>`;
        }).join("");
        productSpecsEl.closest(".product-specs-block")?.classList.toggle("hidden", specRows.length === 0);
    }
    const productSpecificationsEl = document.getElementById("productSpecifications");
    if (productSpecificationsEl) {
        if (product.specifications && product.specifications.trim()) {
            productSpecificationsEl.textContent = product.specifications;
            productSpecificationsEl.closest(".product-specifications-block")?.classList.remove("hidden");
        } else {
            productSpecificationsEl.closest(".product-specifications-block")?.classList.add("hidden");
        }
    }

    const addToCartButton = document.getElementById("addToCart");
    if (addToCartButton) {
        if (stock <= 0) {
            addToCartButton.textContent = "Out of Stock";
            addToCartButton.disabled = true;
        }
        addToCartButton.addEventListener("click", function () {
            if (!window.requireLogin || !window.requireLogin()) return;
            if (Number(product.stock || 0) <= 0) {
                showStockAlert(product.name);
                return;
            }

            window.addToCart({
                id: product.id,
                name: product.name,
                brand: product.brand,
                storage: product.storage,
                price: pricing.finalPrice,
                image: product.image || "../images/hero-phone.png"
            });

            addToCartButton.textContent = "Added to Cart ✓";
            addToCartButton.disabled = true;
        });
    }

    const saveProductButton = document.getElementById("saveProduct");
    if (saveProductButton) {
        saveProductButton.addEventListener("click", async function () {
            if (!window.requireLogin || !window.requireLogin()) return;

            const saved = await saveProductToWishlist(product);
            if (saved) {
                saveProductButton.textContent = "Saved ✓";
                saveProductButton.disabled = true;
            }
        });

        (async function checkAlreadySaved() {
            const currentUser = getCurrentUser();
            const supabase = window.novaSupabase;
            if (!currentUser?.email || !supabase) return;
            try {
                const { data: profileData } = await supabase.from("profiles").select("id").eq("email", currentUser.email).maybeSingle();
                const customerId = profileData?.id || currentUser.id;
                const { data } = await supabase.from("saved_phones").select("id").eq("customer_id", customerId).eq("product_id", String(product.id)).maybeSingle();
                if (data) {
                    saveProductButton.textContent = "Saved ✓";
                    saveProductButton.disabled = true;
                }
            } catch (error) {
                // Not saved yet, or not logged in — leave button as default.
            }
        })();
    }

    const requestQuoteButton = document.getElementById("requestQuote");
    if (requestQuoteButton) {
        requestQuoteButton.addEventListener("click", function () {
            const quoteTarget = `pages/request-quote.html?type=retail&product=${encodeURIComponent(product.id)}`;

            if (!isLoggedIn()) {
                showLoginPrompt(quoteTarget, "Sign in to request a quote for this phone. Your quote details will be saved to your Nova Tech account.");
                return;
            }

            window.location.href = `request-quote.html?type=retail&product=${encodeURIComponent(product.id)}`;
        });
    }
}

document.addEventListener("DOMContentLoaded", async function () {

    console.log("Nova Tech is ready!");
    updateCartCount();
    if (window.novaSupabase) {
        await fetchProductsFromSupabase();
    }
    (function setupMobileNav() {
        const nav = document.querySelector(".navigation, .main-nav, .site-header nav");
        const header = document.querySelector(".header, .site-header");
        if (!nav || !header) return;

        let toggle = document.querySelector(".nav-toggle");
        if (!toggle) {
            toggle = document.createElement("button");
            toggle.className = "nav-toggle";
            toggle.setAttribute("aria-label", "Menu");
            toggle.textContent = "☰";
            nav.parentNode.insertBefore(toggle, nav);
        }

        let overlay = document.querySelector(".nav-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "nav-overlay";
            document.body.appendChild(overlay);
        }

        function closeNav() {
            nav.classList.remove("open");
            overlay.classList.remove("open");
        }

        toggle.addEventListener("click", function () {
            nav.classList.toggle("open");
            overlay.classList.toggle("open");
        });
        overlay.addEventListener("click", closeNav);
        nav.querySelectorAll("a").forEach(function (link) {
            link.addEventListener("click", closeNav);
        });
    })();
    const chatQuery = new URLSearchParams(window.location.search).get("chat");
    if (chatQuery === "1" && isLoggedIn()) {
        const chatWidget = document.getElementById("novatechChat");
        if (chatWidget) {
            chatWidget.classList.add("active");
            const chatInput = document.getElementById("novaChatInput");
            if (chatInput) {
                chatInput.focus();
            }
        }
    }

    renderHomeProducts();
    renderPhonesGrid();
    renderProductDetail();
    updateWholesaleProductCount();
    renderHomeBrands();

    // --------------------------------------
    // 1. CURRENT YEAR IN FOOTER
    // --------------------------------------

    const yearElement = document.querySelector(".copyright p");

    if (yearElement) {
        yearElement.textContent =
            `© ${new Date().getFullYear()} Nova Tech. All rights reserved.`;
    }


    // --------------------------------------
    // 2. PRODUCT BUTTONS
    // --------------------------------------

    const productButtons =
        document.querySelectorAll(".product-button");

    productButtons.forEach(function (button) {

        button.addEventListener("click", function (event) {

            const destination = button.getAttribute("href");

            if (destination && destination !== "#") {
                return;
            }

            event.preventDefault();
            window.location.href = "pages/product.html";

        });

    });


    // --------------------------------------
    // 6. SMOOTH SCROLLING
    // --------------------------------------

    const navigationLinks =
        document.querySelectorAll('a[href^="#"]');

    navigationLinks.forEach(function (link) {

        link.addEventListener("click", function (event) {

            const targetId =
                link.getAttribute("href");

            if (targetId === "#") {
                return;
            }

            const target =
                document.querySelector(targetId);

            if (target) {

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth"
                });

            }

        });

    });


    // --------------------------------------
    // 7. CATEGORY BUTTONS
    // --------------------------------------

    const brandLinks =
        document.querySelectorAll(".brand-list a");

    brandLinks.forEach(function (brand) {

        brand.addEventListener("click", function (event) {

            event.preventDefault();

            const brandName =
                brand.textContent.trim();

            const queryBrand = brandName
                .replace(/\s*\/\s*/g, " ")
                .replace(/\s+/g, " ")
                .replace("Google Pixel", "Google")
                .replace("Xiaomi / Redmi", "Xiaomi")
                .trim();

            window.location.href = `pages/phones.html?brand=${encodeURIComponent(queryBrand)}`;

        });

    });


    // --------------------------------------
    // 8. AUTH FORM HANDLING
    // --------------------------------------

    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");

    if (passwordInput && togglePassword) {
        togglePassword.addEventListener("click", function () {
            const shouldShow = passwordInput.type === "password";
            passwordInput.type = shouldShow ? "text" : "password";
            togglePassword.textContent = shouldShow ? "Hide" : "Show";
            togglePassword.setAttribute(
                "aria-label",
                shouldShow ? "Hide password" : "Show password"
            );
        });
    }

    const loginForm = document.getElementById("loginForm");
    const authMessage = document.getElementById("authMessage");

    function showAuthMessage(message, isError) {
        if (authMessage) {
            authMessage.replaceChildren();
            const messageText = document.createElement("span");
            messageText.textContent = message;
            authMessage.appendChild(messageText);

            if (isError && String(message).toLowerCase().includes("confirm your email")) {
                const resendButton = document.createElement("button");
                resendButton.type = "button";
                resendButton.textContent = "Resend confirmation email";
                resendButton.style.display = "block";
                resendButton.style.marginTop = "10px";
                resendButton.addEventListener("click", async function () {
                    const resendEmail = document.getElementById("email")?.value.trim().toLowerCase();
                    if (!resendEmail) {
                        showAuthMessage("Enter your email address first, then request a new confirmation email.", true);
                        return;
                    }
                    const { error } = await window.novaSupabase.auth.resend({ type: "signup", email: resendEmail });
                    showAuthMessage(error ? error.message : "A new confirmation email has been sent.", Boolean(error));
                });
                authMessage.appendChild(resendButton);
            }

            authMessage.style.marginBottom = "16px";
            authMessage.style.color = isError ? "#b42318" : "#176b45";
            authMessage.style.fontWeight = "600";
        }
    }

    if (loginForm) {

        const pendingAuthMessage = sessionStorage.getItem("novaTechAuthMessage");
        if (pendingAuthMessage) {
            showAuthMessage(pendingAuthMessage, false);
            sessionStorage.removeItem("novaTechAuthMessage");
        }

        loginForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const emailInput = document.getElementById("email");
            const passwordInput = document.getElementById("password");

            const email = (emailInput?.value || "").trim().toLowerCase();
            const password = passwordInput?.value || "";

            if (!email || !password) {
                alert("Please enter both your email and password.");
                return;
            }

            try {
                const supabase = window.novaSupabase;

                if (!supabase) {
                    throw new Error("Supabase is not connected.");
                }

                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) {
                    if (String(error.message || "").toLowerCase().includes("email not confirmed")) {
                        showAuthMessage("Please confirm your email address before signing in.", true);
                    }
                    throw error;
                }

                const profile = data?.user;
                if (profile) {
                    const resolvedUser = {
                        id: profile.id,
                        name: profile.user_metadata?.full_name || profile.email?.split("@")[0] || "Customer",
                        email: profile.email,
                        phone: profile.user_metadata?.phone || "",
                        role: profile.user_metadata?.role || "customer"
                    };
                    setCurrentUser(resolvedUser);
                    await ensureCustomerProfile();
                }

                showAuthMessage("Login successful. Redirecting...", false);
                const returnTarget = getLoginReturnTarget();
                window.location.href = returnTarget;
            } catch (error) {
                console.error(error);
                showAuthMessage(/email not confirmed/i.test(error?.message || "")
                    ? "Please verify your email address using the confirmation link we sent you, then try again."
                    : (error.message || "Login failed. Please check your email and password."), true);
            }

        });

    }


    const signupForm = document.getElementById("signupForm");

    if (signupForm) {

        signupForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const nameInput = document.getElementById("signupName");
            const emailInput = document.getElementById("signupEmail");
            const passwordInput = document.getElementById("signupPassword");
            const confirmInput = document.getElementById("signupConfirmPassword");

            const name = (nameInput?.value || "").trim();
            const email = (emailInput?.value || "").trim().toLowerCase();
            const password = passwordInput?.value || "";
            const confirmPassword = confirmInput?.value || "";

            if (!name || !email || !password || !confirmPassword) {
                alert("Please complete all signup fields.");
                return;
            }

            if (password !== confirmPassword) {
                alert("Passwords do not match.");
                return;
            }

            try {
                const supabase = window.novaSupabase;

                if (!supabase) {
                    throw new Error("Supabase is not connected.");
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: name
                        },
                        emailRedirectTo: `${window.location.origin}${getPageAssetPath("pages/account.html")}`
                    }
                });

                if (error) {
    throw error;
}

if (data?.user && data?.session) {
    const createdUser = {
        id: data.user.id,
        name,
        email,
        phone: "",
        role: "customer"
    };
    setCurrentUser(createdUser);
    await ensureCustomerProfile();

    showAuthMessage("Account created successfully. Please log in with your email and password.", false);

    setTimeout(function () {
        window.location.href = "../pages/account.html";
    }, 1500);
} else {
    localStorage.removeItem("novaTechUser");
    localStorage.removeItem("novaTechSupabaseSessionUser");

    showAuthMessage("Account created successfully. Please check your email and click the verification link before logging in.", false);
}
            } catch (error) {
                console.error(error);
                showAuthMessage(error.message || "Signup failed. Please try again.", true);
            }

        });

    }

    const updatePasswordForm = document.getElementById("updatePasswordForm");
    if (updatePasswordForm) {
        updatePasswordForm.addEventListener("submit", async function (event) {
            event.preventDefault();
            const password = document.getElementById("newPassword")?.value || "";
            const confirmation = document.getElementById("confirmNewPassword")?.value || "";
            const message = document.getElementById("authMessage");

            if (password.length < 6 || password !== confirmation) {
                if (message) {
                    message.textContent = password !== confirmation ? "Passwords do not match." : "Your password must be at least 6 characters.";
                    message.style.color = "#b42318";
                }
                return;
            }

            const { error } = await window.novaSupabase.auth.updateUser({ password });
            if (error) {
                if (message) {
                    message.textContent = error.message;
                    message.style.color = "#b42318";
                }
                return;
            }

            if (message) {
                message.textContent = "Password updated successfully. You can now sign in.";
                message.style.color = "#176b45";
            }
            await window.novaSupabase.auth.signOut();
            setTimeout(function () {
                window.location.href = getPageAssetPath("login.html");
            }, 800);
        });
    }


    const forgotPasswordForm = document.getElementById("forgotPasswordForm");

    if (forgotPasswordForm) {

        forgotPasswordForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const emailInput = document.getElementById("forgotEmail");
            const email = (emailInput?.value || "").trim().toLowerCase();

            if (!email) {
                alert("Please enter your email address.");
                return;
            }

            try {
                const supabase = window.novaSupabase;
                if (!supabase) {
                    throw new Error("Supabase is not connected.");
                }

                const redirectTo = `${window.location.origin}${getPageAssetPath("pages/update-password.html")}`;
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                if (error) {
                    throw error;
                }

                alert(`A password reset link has been sent to ${email}.`);
            } catch (error) {
                console.error("Password reset failed:", error);
                alert(error.message || "Password reset could not be requested.");
            }

        });

    }

    const contactForm = document.getElementById("contactForm");
    if (contactForm) {
        contactForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            if (!window.requireLogin || !window.requireLogin()) {
                return;
            }

            const formData = {
                name: document.getElementById("contactName")?.value.trim() || "",
                email: document.getElementById("contactEmail")?.value.trim() || "",
                phone: document.getElementById("contactPhone")?.value.trim() || "",
                subject: document.getElementById("contactSubject")?.value || "General enquiry",
                message: document.getElementById("contactMessage")?.value.trim() || ""
            };

            if (!formData.name || !formData.email || !formData.message) {
                alert("Please complete your name, email, and message.");
                return;
            }

            const sent = await saveContactMessage(formData);
            if (!sent) {
                alert("Your message could not be sent to NovaTech right now. Please try again.");
                return;
            }
            alert("Your message has been sent. Our team will get back to you soon.");
            contactForm.reset();
        });
    }

    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatMessages = document.getElementById("chatMessages");

    if (chatForm && chatInput && chatMessages) {
        const currentUser = getCurrentUser();
        if (!currentUser || !currentUser.email) {
            showLoginPrompt("pages/chat.html?chat=1", "Sign in to chat securely with the Nova Tech support team.");
            return;
        }

        const chatSendBtn = document.getElementById("chatSendBtn");
        const chatErrorEl = document.getElementById("chatError");
        const attachToggle = document.getElementById("chatAttachToggle");
        const attachMenu = document.getElementById("chatAttachMenu");
        const galleryInput = document.getElementById("chatGalleryInput");
        const videoInput = document.getElementById("chatVideoInput");
        const previewWrap = document.getElementById("chatAttachmentPreview");
        const previewRemoveBtn = document.getElementById("chatAttachmentRemove");
        let pendingFile = null;

        function showChatError(text) {
            if (!chatErrorEl) return;
            chatErrorEl.textContent = text || "";
            chatErrorEl.hidden = !text;
        }

        function closeAttachMenu() {
            if (attachMenu) attachMenu.hidden = true;
        }

        function clearPendingAttachment() {
            pendingFile = null;
            if (galleryInput) galleryInput.value = "";
            if (videoInput) videoInput.value = "";
            if (previewWrap) {
                previewWrap.hidden = true;
                previewWrap.innerHTML = "";
            }
        }

        function setPendingAttachment(file) {
            const validation = validateChatAttachment(file);
            if (!validation.ok) {
                showChatError(validation.error);
                return;
            }
            showChatError("");
            pendingFile = file;
            if (previewWrap) {
                const objectUrl = URL.createObjectURL(file);
                previewWrap.innerHTML = validation.kind === "video"
                    ? `<video src="${objectUrl}" muted></video>`
                    : `<img src="${objectUrl}" alt="Selected image">`;
                const removeBtn = document.createElement("button");
                removeBtn.type = "button";
                removeBtn.id = "chatAttachmentRemove";
                removeBtn.className = "chat-attachment-remove";
                removeBtn.setAttribute("aria-label", "Remove attachment");
                removeBtn.textContent = "×";
                removeBtn.addEventListener("click", clearPendingAttachment);
                previewWrap.appendChild(removeBtn);
                previewWrap.hidden = false;
            }
        }

        if (attachToggle && attachMenu) {
            attachToggle.addEventListener("click", function (event) {
                event.stopPropagation();
                attachMenu.hidden = !attachMenu.hidden;
            });
            document.addEventListener("click", function (event) {
                if (!attachMenu.hidden && !attachMenu.contains(event.target) && event.target !== attachToggle) {
                    closeAttachMenu();
                }
            });
        }

        [galleryInput, videoInput].forEach(function (input) {
            if (!input) return;
            input.addEventListener("change", function () {
                closeAttachMenu();
                const file = input.files && input.files[0];
                if (file) setPendingAttachment(file);
            });
        });

        if (attachMenu) {
            attachMenu.querySelectorAll("[data-trigger]").forEach(function (menuBtn) {
                menuBtn.addEventListener("click", function () {
                    const target = document.getElementById(menuBtn.dataset.trigger);
                    if (target) target.click();
                });
            });
        }

        function renderChatBubble(message) {
            const messageClass = message.sender_role === "support" ? "support" : "customer";
            const senderLabel = message.sender_role === "support" ? "NovaTech Support" : (message.sender || currentUser.name || "You");
            const verifiedTag = message.sender_role === "support" ? '<span class="chat-verified-tag" title="Verified NovaTech team member">✓ Verified</span>' : "";
            const time = new Date(message.created_at || Date.now()).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit"
            });
            const ticks = message.sender_role === "customer" ? `<span class="message-status ${message.read_by_admin ? "is-read" : ""}" title="${message.read_by_admin ? "Read" : "Sent"}">${message.read_by_admin ? "✓✓" : "✓"}</span>` : "";
            let media = "";
            if (message.attachment_url) {
                media = String(message.attachment_type || "").startsWith("video/")
                    ? `<video class="chat-attachment-media" src="${escapeHtml(message.attachment_url)}" controls preload="metadata"></video>`
                    : `<img class="chat-attachment-media" src="${escapeHtml(message.attachment_url)}" alt="${escapeHtml(message.attachment_name || "Shared image")}" loading="lazy">`;
            }
            const caption = message.text ? `<p>${escapeHtml(message.text)}</p>` : "";
            return `
                <div class="chat-message ${messageClass}" data-message-id="${escapeHtml(message.id)}">
                    <div class="chat-message-meta"><strong>${escapeHtml(senderLabel)}</strong>${verifiedTag}<span>${time} ${ticks}</span></div>
                    ${media}
                    ${caption}
                </div>
            `;
        }

        await loadCustomerChatFromSupabase(currentUser.id);
        const conversation = ensureCustomerChatConversation();
        if (conversation) {
            const unreadBadge = document.getElementById("unreadChatBadge");
            if (unreadBadge) {
                unreadBadge.textContent = String(conversation.unread_by_customer || 0);
                unreadBadge.hidden = !conversation.unread_by_customer;
            }

            chatMessages.innerHTML = (conversation.messages || []).map(renderChatBubble).join("") || `
                <div class="chat-message support">
                    <p>Hello 👋 Welcome to NovaTech. Our support team is here to help.</p>
                </div>
            `;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            markCustomerConversationRead(conversation.id);
            await markSupportMessagesRead(currentUser.id);
        }

        chatMessages.addEventListener("click", function (event) {
            const img = event.target.closest("img.chat-attachment-media");
            if (img && !img.classList.contains("broken")) {
                openNovaLightbox(img.src, img.alt);
            }
        });

        chatMessages.addEventListener("error", function (event) {
            const img = event.target;
            if (img.tagName === "IMG" && img.classList.contains("chat-attachment-media")) {
                img.classList.add("broken");
                img.alt = "Image unavailable";
                img.removeAttribute("src");
                img.textContent = "🖼️ Image unavailable";
            }
        }, true);

        subscribeToCustomerMessages(currentUser.id, function (messageEntry) {
            if (messageEntry.sender_role !== "support") return;
            const bubble = document.createElement("div");
            bubble.innerHTML = renderChatBubble(messageEntry).trim();
            chatMessages.appendChild(bubble.firstElementChild);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            markSupportMessagesRead(currentUser.id);
            const unreadBadge = document.getElementById("unreadChatBadge");
            if (unreadBadge) unreadBadge.hidden = true;
        });

        chatForm.addEventListener("submit", async function (event) {
            event.preventDefault();

            const message = chatInput.value.trim();
            if (!message && !pendingFile) {
                showChatError("Type a message or attach a photo/video first.");
                return;
            }

            const customerName = currentUser.name || currentUser.email.split("@")[0] || "Customer";
            const nextConversation = ensureCustomerChatConversation();
            if (!nextConversation) {
                return;
            }

            showChatError("");
            if (chatSendBtn) {
                chatSendBtn.disabled = true;
                chatSendBtn.dataset.originalText = chatSendBtn.dataset.originalText || chatSendBtn.textContent;
                chatSendBtn.textContent = pendingFile ? "Uploading…" : "Sending…";
            }

            let attachment = null;
            try {
                if (pendingFile) {
                    attachment = await uploadChatAttachment(pendingFile, currentUser.id);
                }
            } catch (error) {
                showChatError("That file could not be uploaded. Please try again.");
                if (chatSendBtn) {
                    chatSendBtn.disabled = false;
                    chatSendBtn.textContent = chatSendBtn.dataset.originalText;
                }
                return;
            }

            const messagePayload = {
                sender: customerName,
                sender_role: "customer",
                text: message,
                created_at: new Date().toISOString(),
                read_by_customer: true,
                read_by_admin: false,
                attachment_url: attachment?.attachment_url || null,
                attachment_name: attachment?.attachment_name || null,
                attachment_type: attachment?.attachment_type || null
            };
            const persistedMessage = await saveChatMessageToSupabase(messagePayload);
            if (!persistedMessage) {
                showChatError("Your message could not be sent. Please try again.");
                if (chatSendBtn) {
                    chatSendBtn.disabled = false;
                    chatSendBtn.textContent = chatSendBtn.dataset.originalText;
                }
                return;
            }
            const updated = appendConversationMessage(nextConversation.id, persistedMessage);

            const bubble = document.createElement("div");
            bubble.innerHTML = renderChatBubble(persistedMessage).trim();
            chatMessages.appendChild(bubble.firstElementChild);
            chatInput.value = "";
            clearPendingAttachment();
            chatMessages.scrollTop = chatMessages.scrollHeight;

            if (chatSendBtn) {
                chatSendBtn.disabled = false;
                chatSendBtn.textContent = chatSendBtn.dataset.originalText;
            }

            if (updated) {
                const unreadBadge = document.getElementById("unreadChatBadge");
                if (unreadBadge) {
                    unreadBadge.textContent = String(updated.unread_by_customer || 0);
                    unreadBadge.hidden = !updated.unread_by_customer;
                }
            }
        });
    }

    const accountButtons = document.querySelectorAll(".account-button");
    let currentUser = getCurrentUser();

    // Resolve the real Supabase session before rendering the account control,
    // so a customer who is already signed in never gets shown a misleading LOGIN button.
    if (!currentUser && window.novaSupabase) {
        try {
            const authState = await window.novaSupabase.auth.getUser();
            const authUser = authState.data?.user;
            if (authUser) {
                let profile = null;
                const byId = await window.novaSupabase.from("profiles")
                    .select("id,full_name,email,phone,role,account_status")
                    .eq("id", authUser.id).maybeSingle();
                profile = byId.error ? null : byId.data;
                currentUser = {
                    id: authUser.id,
                    name: profile?.full_name || authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "Customer",
                    email: profile?.email || authUser.email || "",
                    phone: profile?.phone || authUser.user_metadata?.phone || "",
                    role: profile?.role || "customer",
                    account_status: profile?.account_status || "active"
                };
                setCurrentUser(currentUser);
            }
        } catch (error) {
            console.warn("Could not resolve Supabase account state:", error);
        }
    }

    accountButtons.forEach(function (button) {
        if (!currentUser) {
            button.textContent = "LOGIN";
            button.setAttribute("href", getPageAssetPath("login.html"));
            button.onclick = null;
            return;
        }

        const firstName = String(currentUser.name || currentUser.email || "Customer").split(" ")[0];
        const initials = firstName.slice(0, 2).toUpperCase();
        const accountHref = getPageAssetPath("pages/account.html");
        const chatHref = getPageAssetPath("pages/chat.html");
        const ordersHref = getPageAssetPath("pages/account.html#orders");

        const profileWrapper = document.createElement("div");
        profileWrapper.className = "profile-menu-wrapper";

        const profileTrigger = document.createElement("button");
        profileTrigger.type = "button";
        profileTrigger.className = "profile-trigger";
        profileTrigger.title = `Logged in as ${currentUser.name || currentUser.email}`;
        profileTrigger.innerHTML = `
            <span class="profile-trigger-avatar">${initials}</span>
            <span class="profile-trigger-label">${firstName}</span>
        `;

        const profileDropdown = document.createElement("div");
        profileDropdown.className = "profile-dropdown";
        profileDropdown.innerHTML = `
            <a href="${accountHref}">My Account</a>
            <a href="${ordersHref}">Orders</a>
            <a href="${chatHref}">Chat</a>
            <button type="button" class="profile-logout-btn">Log out</button>
        `;

        profileTrigger.addEventListener("click", function () {
            profileWrapper.classList.toggle("open");
        });

       const logoutButton = profileDropdown.querySelector(".profile-logout-btn");
        if (logoutButton) {
            logoutButton.addEventListener("click", async function () {
                localStorage.removeItem("novaTechUser");
                if (window.novaSupabase) {
                    await window.novaSupabase.auth.signOut();
                }
                window.location.href = getPageAssetPath("index.html");
            });
        }

        profileWrapper.appendChild(profileTrigger);
        profileWrapper.appendChild(profileDropdown);
        button.replaceWith(profileWrapper);
    });

    // Any action link that changes into a protected customer workflow should
    // ask the visitor to sign in at the moment they press it.
    document.querySelectorAll('a[href*="request-quote.html"], a[href*="chat.html"]').forEach(function (link) {
        if (link.dataset.loginGuardBound) return;
        link.dataset.loginGuardBound = "1";
        link.addEventListener("click", function (event) {
            if (!window.requireLogin || window.requireLogin()) return;
            event.preventDefault();
        });
    });

});
/* =================================
   NOVATECH SHOPPING CART
================================= */

const cartButton = document.getElementById("cartButton");
const cartDrawer = document.getElementById("cartDrawer");
const cartOverlay = document.getElementById("cartOverlay");
const closeCart = document.getElementById("closeCart");

function getCart() {
    try {
        return JSON.parse(localStorage.getItem(getCartStorageKey()) || "[]");
    } catch (error) {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem(getCartStorageKey(), JSON.stringify(cart));
}

function getCartTotal() {
    return getCart().reduce(function (sum, item) {
        return sum + (Number(item.price || 0) * Number(item.quantity || 1));
    }, 0);
}

function getCartItemCount() {
    return getCart().reduce(function (sum, item) {
        return sum + Number(item.quantity || 1);
    }, 0);
}
function updateCartCount() {
    const count = isLoggedIn() ? getCartItemCount() : 0;
    document.querySelectorAll("#cartCount").forEach(function (element) {
        element.textContent = count;
    });
}


function addToCart(product) {
    if (!window.requireLogin || !window.requireLogin()) {
        return;
    }

    const cart = getCart();
    const existing = cart.find(function (item) {
        return String(item.id) === String(product.id);
    });

    if (existing) {
        existing.quantity = Number(existing.quantity || 1) + 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            brand: product.brand,
            storage: product.storage,
            price: Number(product.price || 0),
            image: product.image || "images/hero-phone.png",
            quantity: 1
        });
    }

    saveCart(cart);
    updateCartCount();
    if (typeof renderCartDrawer === "function") renderCartDrawer();
    if (typeof renderCartPage === "function") renderCartPage();
}

function changeCartItemQuantity(id, delta) {
    const cart = getCart();
    const item = cart.find(function (product) {
        return String(product.id) === String(id);
    });
    if (!item) return;

    item.quantity = Number(item.quantity || 1) + delta;

    const updatedCart = item.quantity <= 0
        ? cart.filter(function (product) { return String(product.id) !== String(id); })
        : cart;

    saveCart(updatedCart);
    updateCartCount();
    if (typeof renderCartPage === "function") renderCartPage();
    if (typeof renderCartDrawer === "function") renderCartDrawer();
}

function removeCartItem(id) {
    const cart = getCart().filter(function (item) {
        return String(item.id) !== String(id);
    });
    saveCart(cart);
    updateCartCount();
    if (typeof renderCartPage === "function") renderCartPage();
    if (typeof renderCartDrawer === "function") renderCartDrawer();
}

function clearCart() {
    saveCart([]);
    updateCartCount();
    if (typeof renderCartPage === "function") renderCartPage();
    if (typeof renderCartDrawer === "function") renderCartDrawer();
}

function renderCartDrawer() {
    const cart = getCart();
    const cartItemsContainer = document.getElementById("cartItems");
    const cartTotalEl = document.getElementById("cartTotal");
    if (!cartItemsContainer) return;

    if (document.getElementById("cartTotalItems")) {
        renderCartPage();
        return;
    }

    cartItemsContainer.innerHTML = "";

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-message">
                <div class="empty-cart-icon">🛒</div>
                <h3>Your cart is empty</h3>
                <p>Add phones to your cart and they will appear here.</p>
            </div>
        `;
    } else {
        cart.forEach(function (item) {
            const row = document.createElement("div");
            row.className = "cart-item";
            row.innerHTML = `
                <div class="cart-item-image">
                    <img src="${item.image || "images/hero-phone.png"}" alt="${item.name}">
                </div>
                <div class="cart-item-info">
                    <h3>${item.name}</h3>
                    <p>${item.brand}</p>
                    <p>${item.storage || ""}</p>
                    <strong>$${Number(item.price || 0).toFixed(2)} × ${item.quantity || 1}</strong>
                </div>
                <button type="button" class="remove-cart-item" data-id="${item.id}">Remove</button>
            `;
            cartItemsContainer.appendChild(row);
        });

        cartItemsContainer.querySelectorAll(".remove-cart-item").forEach(function (button) {
            button.addEventListener("click", function () {
                removeCartItem(button.getAttribute("data-id"));
            });
        });
    }

    if (cartTotalEl) {
        const total = getCartTotal();
        cartTotalEl.textContent = total > 0 ? `Total: $${total.toFixed(2)}` : "Request Quote";
    }
}

function renderCartPage() {
    const cart = getCart();
    const container = document.getElementById("cartItems");
    const empty = document.getElementById("emptyCart");
    const summary = document.getElementById("cartSummary");
    const totalItemsEl = document.getElementById("cartTotalItems");
    const totalValueEl = document.getElementById("cartTotalValue");

    if (!container || !document.getElementById("cartTotalItems")) return;

    container.innerHTML = "";

    if (cart.length === 0) {
        if (empty) empty.style.display = "block";
        if (summary) summary.style.display = "none";
        if (totalItemsEl) totalItemsEl.textContent = "0";
        if (totalValueEl) totalValueEl.textContent = "$0.00";
        return;
    }

    if (empty) empty.style.display = "none";
    if (summary) summary.style.display = "block";
    if (totalItemsEl) totalItemsEl.textContent = String(getCartItemCount());
    if (totalValueEl) totalValueEl.textContent = `$${getCartTotal().toFixed(2)}`;

    cart.forEach(function (product) {
        const item = document.createElement("div");
        item.className = "cart-item";
        item.innerHTML = `
            <div class="cart-item-image">
                <img src="${product.image || "../images/hero-phone.png"}" alt="${product.name}">
            </div>
            <div class="cart-item-info">
                <h3>${product.name}</h3>
                <p>${product.brand || ""} ${product.storage ? "· " + product.storage : ""}</p>
                <strong>$${Number(product.price || 0).toFixed(2)}</strong>
            </div>
            <div class="cart-qty-controls">
                <button type="button" class="qty-btn" data-action="dec" data-id="${product.id}">−</button>
                <span class="qty-value">${product.quantity || 1}</span>
                <button type="button" class="qty-btn" data-action="inc" data-id="${product.id}">+</button>
            </div>
            <p class="cart-item-subtotal">$${(Number(product.price || 0) * Number(product.quantity || 1)).toFixed(2)}</p>
            <button type="button" class="remove-cart-item" data-id="${product.id}">Remove</button>
        `;
        container.appendChild(item);
    });

    container.querySelectorAll(".qty-btn").forEach(function (button) {
        button.addEventListener("click", function () {
            const delta = button.dataset.action === "inc" ? 1 : -1;
            changeCartItemQuantity(button.dataset.id, delta);
        });
    });

    container.querySelectorAll(".remove-cart-item").forEach(function (button) {
        button.addEventListener("click", function () {
            removeCartItem(button.getAttribute("data-id"));
        });
    });
}

document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("cartTotalItems")) {
        if (!window.requireLogin || !window.requireLogin()) {
            return;
        }
        renderCartPage();
        updateCartCount();

        const clearCartButton = document.getElementById("clearCartButton");
        if (clearCartButton) {
            clearCartButton.addEventListener("click", function () {
                showNovaConfirm("Remove all items from your cart?", function () {
                    clearCart();
                    renderCartPage();
                    updateCartCount();
                });
            });
        }

        const requestQuoteFromCart = document.getElementById("requestQuoteFromCart");
        if (requestQuoteFromCart) {
            requestQuoteFromCart.addEventListener("click", function () {
                const cart = getCart();
                const firstItem = cart[0];
                const target = firstItem
                    ? `pages/request-quote.html?product=${encodeURIComponent(firstItem.id)}`
                    : "pages/request-quote.html";
                window.location.href = window.location.pathname.includes("/pages/") ? target.replace("pages/", "") : target;
            });
        }
    }
});

window.getCart = getCart;
window.addToCart = addToCart;
window.saveCart = saveCart;
window.removeCartItem = removeCartItem;
window.changeCartItemQuantity = changeCartItemQuantity;
window.clearCart = clearCart;
window.saveCart = saveCart;

/* OPEN CART */

if (cartButton) {

    cartButton.addEventListener("click", function(event) {

        event.preventDefault();

        cartDrawer.classList.add("active");

        cartOverlay.classList.add("active");

        document.body.style.overflow = "hidden";

    });

}


/* CLOSE CART */

function closeShoppingCart() {

    if (cartDrawer) {
        cartDrawer.classList.remove("active");
    }

    if (cartOverlay) {
        cartOverlay.classList.remove("active");
    }

    document.body.style.overflow = "";

}


if (closeCart) {

    closeCart.addEventListener(
        "click",
        closeShoppingCart
    );

}


if (cartOverlay) {

    cartOverlay.addEventListener(
        "click",
        closeShoppingCart
    );

}

if (document.readyState !== "loading") {
    updateCartCount();
    renderCartDrawer();
}
/* =================================
   NOVATECH REQUEST QUOTE FORM
================================= */

const quoteForm = document.getElementById("quoteForm");
const quoteSuccess = document.getElementById("quoteSuccess");

if (quoteForm && quoteSuccess) {

    quoteForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!window.requireLogin || !window.requireLogin()) return;

            const productId = new URLSearchParams(window.location.search).get("product") || "";
        const liveCatalog = await getLiveCatalogProducts();
        const productFromUrl = productId && Array.isArray(liveCatalog)
            ? liveCatalog.find(function (item) { return String(item.id) === String(productId); })
            : null;

        const formData = {
            name: document.getElementById("quoteName")?.value.trim() || "",
            email: document.getElementById("quoteEmail")?.value.trim() || "",
            phone: document.getElementById("quotePhone")?.value.trim() || "",
            phoneModel: document.getElementById("phoneModel")?.value.trim() || (productFromUrl ? productFromUrl.name : ""),
            quantity: document.getElementById("quantity")?.value || 1,
            condition: document.getElementById("condition")?.value || "",
            lockStatusRequested: document.getElementById("lockStatusRequested")?.value || "",
            networkRequested: document.getElementById("networkRequested")?.value || "",
            country: document.getElementById("country")?.value.trim() || "",
            city: document.getElementById("city")?.value.trim() || "",
            shippingMethod: document.getElementById("shippingMethod")?.value || "standard",
            message: document.getElementById("quoteMessage")?.value.trim() || "",
            productId: productFromUrl ? productFromUrl.id : "",
            productImage: productFromUrl ? productFromUrl.image : "",
            quoteType: window.__novaQuoteMode || new URLSearchParams(window.location.search).get("type") || "retail",
            businessName: document.getElementById("businessName")?.value.trim() || "",
            businessType: document.getElementById("businessType")?.value || "",
            monthlyVolume: document.getElementById("monthlyVolume")?.value || "",
            moqAcknowledged: document.getElementById("moqAcknowledged")?.checked || false
        };

        if (!formData.name || !formData.email || !formData.phone || !formData.phoneModel || !formData.quantity) {
            alert("Please complete the required quote details.");
            return;
        }
        if (String(formData.quoteType).toLowerCase()==="wholesale") {
            if (Number(formData.quantity) < 10) { alert("Wholesale requests normally start at 10 units. If you need fewer units, please use the normal phone quote."); return; }
            if (!formData.moqAcknowledged) { alert("Please confirm that you understand the wholesale MOQ and pricing terms."); return; }
        }

        try {
            await saveQuoteRequest(formData);
            quoteForm.style.display = "none";
            quoteSuccess.classList.add("active");
        } catch (error) {
            console.error("Quote submission failed:", error);
            alert(error?.message && !/^\{|row-level security|permission denied/i.test(error.message)
                ? error.message
                : "Your quote could not be submitted right now. Please try again in a moment, or reach us via chat.");
        }

    });

}
/* =================================
   NOVATECH CHAT FUNCTION
================================= */


    function renderNovaBubble(text, senderRole) {
        if (!novaChatMessages) return;
        const bubble = document.createElement("div");
        bubble.className = `nova-message ${senderRole === "support" ? "nova-message-admin" : "nova-message-customer"}`;
        bubble.textContent = text;
        novaChatMessages.appendChild(bubble);
    }

    async function loadNovaChatHistory() {
        const currentUser = getCurrentUser();
        if (!novaChatMessages || !currentUser?.id) return;

        novaChatMessages.innerHTML = "";
        const conversation = await loadCustomerChatFromSupabase(currentUser.id);
        const messages = conversation?.messages || [];

        if (!messages.length) {
            renderNovaBubble("Hi! Send us a message and our team will reply here.", "support");
            return;
        }

        messages.forEach(function (message) {
            renderNovaBubble(message.text, message.sender_role);
        });

        novaChatMessages.scrollTop = novaChatMessages.scrollHeight;
    }

    async function openNovaChat(event) {
        if (event) event.preventDefault();

        if (!isLoggedIn()) {
            redirectToLoginForChat();
            return;
        }

        if (!novaChat) return;

        novaChat.classList.add("active");
        await loadNovaChatHistory();

        if (novaChatInput) novaChatInput.focus();
    }

    async function sendNovaChatMessage() {
        if (!novaChatInput || !novaChatMessages) return;

        const message = novaChatInput.value.trim();
        if (message === "") return;

        if (!window.requireLogin || !window.requireLogin()) return;

        renderNovaBubble(message, "customer");
        novaChatInput.value = "";
        novaChatMessages.scrollTop = novaChatMessages.scrollHeight;

        const saved = await saveChatMessageToSupabase({ text: message, sender_role: "customer" });

        if (!saved) {
            renderNovaBubble("Sorry, your message could not be sent. Please try again.", "support");
            novaChatMessages.scrollTop = novaChatMessages.scrollHeight;
        }
    }

    if (sideMessageButton) sideMessageButton.addEventListener("click", openNovaChat);
    if (chatWithUsButton) chatWithUsButton.addEventListener("click", openNovaChat);

    if (closeNovaChat) {
        closeNovaChat.addEventListener("click", function () {
            if (novaChat) novaChat.classList.remove("active");
        });
    }

    if (sendNovaMessage) sendNovaMessage.addEventListener("click", sendNovaChatMessage);

    if (novaChatInput) {
        novaChatInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                sendNovaChatMessage();
            }
        });
    }




