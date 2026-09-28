/* NovaTech session timeout
   Signs the user out after 30 minutes of inactivity, with a warning
   2 minutes beforehand. Works for both customer pages (uses
   getCurrentUser()/window.novaSupabase from script.js) and the admin
   dashboard (uses window.supabase from admin.js). Include this file
   AFTER script.js or admin.js on any page that should enforce it.
*/
(function () {
    const style = document.createElement("style");
    style.textContent = `
        .nova-session-warning { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; pointer-events: none; transition: opacity .2s ease; }
        .nova-session-warning.show { opacity: 1; pointer-events: auto; }
        .nova-session-warning-card { background: #fff; border-radius: 18px; padding: 26px 28px; max-width: 360px; text-align: center; box-shadow: 0 30px 70px rgba(15,23,42,0.35); }
        .nova-session-warning-card p { margin: 0 0 16px; font-size: 15px; color: #182d50; font-weight: 600; }
        .nova-session-warning-actions button { border: 0; background: linear-gradient(135deg, #182d50 0%, #24427b 100%); color: #fff; padding: 10px 22px; border-radius: 999px; font-weight: 700; cursor: pointer; }
    `;
    document.head.appendChild(style);

    const TIMEOUT_MS = 30 * 60 * 1000;
    const WARNING_MS = 2 * 60 * 1000;
    const ACTIVITY_KEY = "novaTechLastActivity";
    const isAdminPage = !!document.getElementById("adminLoginForm");

    function getSupabaseClient() {
        return window.novaSupabase || window.supabase || null;
    }

    function isSignedIn() {
        if (isAdminPage) {
            // Admin dashboard shows #dashboard (not .hidden) only once signed in.
            const dashboard = document.getElementById("dashboard");
            return !!dashboard && !dashboard.classList.contains("hidden");
        }
        try {
            const stored = localStorage.getItem("novaTechUser");
            return !!stored;
        } catch (error) {
            return false;
        }
    }

    function recordActivity() {
        try {
            sessionStorage.setItem(ACTIVITY_KEY, String(Date.now()));
        } catch (error) {
            // Ignore storage errors (private browsing, quota, etc.)
        }
        hideWarning();
    }

    function getLastActivity() {
        const stored = Number(sessionStorage.getItem(ACTIVITY_KEY) || 0);
        return stored || Date.now();
    }

    let warningEl = null;
    function showWarning(secondsLeft) {
        if (!warningEl) {
            warningEl = document.createElement("div");
            warningEl.className = "nova-session-warning";
            warningEl.innerHTML = `
                <div class="nova-session-warning-card">
                    <p>You'll be signed out soon due to inactivity.</p>
                    <div class="nova-session-warning-actions">
                        <button type="button" data-action="stay">Stay signed in</button>
                    </div>
                </div>
            `;
            document.body.appendChild(warningEl);
            warningEl.querySelector('[data-action="stay"]').addEventListener("click", function () {
                recordActivity();
            });
        }
        const countdownEl = warningEl.querySelector(".nova-session-countdown");
        warningEl.classList.add("show");
        warningEl.querySelector("p").textContent = `You'll be signed out in ${secondsLeft}s due to inactivity.`;
    }

    function hideWarning() {
        if (warningEl) {
            warningEl.classList.remove("show");
        }
    }

    async function signOutForInactivity() {
        const supabase = getSupabaseClient();
        try {
            if (supabase) await supabase.auth.signOut();
        } catch (error) {
            console.warn("Sign-out during timeout failed:", error);
        }

        if (isAdminPage) {
            window.location.reload();
            return;
        }

        try {
            localStorage.removeItem("novaTechUser");
            localStorage.removeItem("novaTechSupabaseSessionUser");
        } catch (error) {
            // Ignore
        }
        const onPagesPath = window.location.pathname.includes("/pages/");
        const loginPage = onPagesPath ? "../login.html" : "login.html";
        window.location.href = `${loginPage}?timeout=1`;
    }

    function tick() {
        if (!isSignedIn()) return;
        const elapsed = Date.now() - getLastActivity();
        const remaining = TIMEOUT_MS - elapsed;

        if (remaining <= 0) {
            signOutForInactivity();
            return;
        }

        if (remaining <= WARNING_MS) {
            showWarning(Math.ceil(remaining / 1000));
        } else {
            hideWarning();
        }
    }

    ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"].forEach(function (eventName) {
        document.addEventListener(eventName, recordActivity, { passive: true });
    });

    // Don't wipe out activity recorded just before a refresh.
    if (!sessionStorage.getItem(ACTIVITY_KEY)) {
        recordActivity();
    }

    setInterval(tick, 15000);
})();
