'use strict';
// Keycloak / OIDC bearer-token verification for the fleet portal (proposal §6.5:
// "ONGC AD/SSO federates on top in production"). DEFAULT OFF: when
// OIDC_ENABLED !== 'true' verifyOidc() always returns null and "jose" is NEVER
// require()'d, so the docker-compose MVP keeps using local JWTs unchanged.
//
// Lazy: the JWKS remote key set is built on first use, from OIDC_JWKS_URI.
const ENABLED = process.env.OIDC_ENABLED === 'true';
const JWKS_URI = process.env.OIDC_JWKS_URI || '';
const ISSUER = process.env.OIDC_ISSUER || '';
const AUDIENCE = process.env.OIDC_AUDIENCE || '';
// Only this client's roles count from resource_access. Roles a user holds in
// other clients of the same realm (e.g. realm-management's "realm-admin") say
// nothing about CRMF and must never grant a CRMF role.
const CLIENT_ID = process.env.OIDC_CLIENT_ID || AUDIENCE;

const list = (s, def) => String(s == null || s === '' ? def : s)
    .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
// Exact role / group names (case-insensitive). No suffix or substring matching.
const ROLE_NAMES = {
    admin: list(process.env.OIDC_ROLE_ADMIN, 'crmf-admin,crmf-admins'),
    operator: list(process.env.OIDC_ROLE_OPERATOR, 'crmf-operator,crmf-operators'),
};

const ROLE_RANK = { viewer: 1, operator: 2, admin: 3 };

let jose = null;       // lazily-required module
let jwks = null;       // lazily-built remote key set
let buildFailed = false;
let misconfigLogged = false;

// Build the remote JWKS once. Any failure (bad URI, missing dep) disables OIDC
// verification for the process lifetime rather than throwing per-request.
function getJwks() {
    if (jwks || buildFailed) return jwks;
    if (!JWKS_URI) { buildFailed = true; return null; }
    try {
        if (!jose) jose = require('jose'); // only required when enabled
        jwks = jose.createRemoteJWKSet(new URL(JWKS_URI));
    } catch (e) {
        buildFailed = true;
        jwks = null;
        console.error('[oidc] failed to build JWKS from', JWKS_URI, '-', e.message);
    }
    return jwks;
}

// Map Keycloak realm roles, this client's roles and group claims to an app
// role. Highest privilege wins. Returns 'admin' | 'operator' | 'viewer'.
function mapRole(claims) {
    const names = new Set();
    const push = (v) => {
        if (!v) return;
        for (const x of Array.isArray(v) ? v : [v]) {
            if (!x) continue;
            // Group paths ("/Parent/CRMF-Operators") match on their last segment only.
            const s = String(x).toLowerCase();
            names.add(s.includes('/') ? s.split('/').filter(Boolean).pop() || '' : s);
        }
    };
    push(claims?.realm_access?.roles);
    if (CLIENT_ID) push(claims?.resource_access?.[CLIENT_ID]?.roles);
    push(claims?.groups);
    push(claims?.roles);

    let best = 'viewer';
    for (const candidate of ['operator', 'admin']) {
        if (ROLE_NAMES[candidate].some((n) => names.has(n)) && ROLE_RANK[candidate] > ROLE_RANK[best]) best = candidate;
    }
    return best;
}

// Verify a Keycloak bearer token. Returns the app user
// { username, display, role, source:'ad' } on success, or null on any failure or
// when OIDC is disabled. Never throws. Fails closed without an issuer and
// audience: otherwise a token minted for any other client in the realm passes.
async function verifyOidc(token) {
    if (!ENABLED || !token) return null;
    if (!ISSUER || !AUDIENCE) {
        if (!misconfigLogged) {
            misconfigLogged = true;
            console.error('[oidc] OIDC_ENABLED=true requires OIDC_ISSUER and OIDC_AUDIENCE; rejecting OIDC tokens.');
        }
        return null;
    }
    const keyset = getJwks();
    if (!keyset) return null;
    try {
        if (!jose) jose = require('jose');
        const { payload } = await jose.jwtVerify(token, keyset, { issuer: ISSUER, audience: AUDIENCE });

        const username = payload.preferred_username || payload.email || payload.sub;
        if (!username) return null;
        const display = payload.name || payload.preferred_username || username;
        const role = mapRole(payload);
        return { username, display, role, source: 'ad' };
    } catch {
        return null;
    }
}

module.exports = {
    verifyOidc,
    mapRole, // exported for testability
    get enabled() { return ENABLED; },
};
