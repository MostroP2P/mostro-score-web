// Nostr connection and event fetching module
import { SimplePool } from 'https://esm.sh/nostr-tools@2.10.4/pool';
import { nip19 } from 'https://esm.sh/nostr-tools@2.10.4';

const DEV_FEE_EVENT_KIND = 8383;
const ORDER_EVENT_KIND = 38383;

/**
 * Parse pubkey from npub or hex format
 * @param {string} input - npub or hex pubkey
 * @returns {string} - hex pubkey
 */
export function parsePubkey(input) {
    const trimmed = input.trim();

    // Check if it's npub format
    if (trimmed.startsWith('npub1')) {
        try {
            const decoded = nip19.decode(trimmed);
            if (decoded.type === 'npub') {
                return decoded.data;
            }
        } catch (e) {
            throw new Error('Invalid npub format');
        }
    }

    // Validate hex format (64 characters, hex only)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return trimmed.toLowerCase();
    }

    throw new Error('Invalid pubkey format. Use npub1... or 64 character hex.');
}

/**
 * Convert hex pubkey to npub format
 * @param {string} hex - hex pubkey
 * @returns {string} - npub
 */
export function hexToNpub(hex) {
    return nip19.npubEncode(hex);
}

/**
 * Fetch Mostro events from relays
 * @param {string} pubkey - hex pubkey
 * @param {string[]} relays - array of relay URLs
 * @param {function} onStatus - status callback
 * @returns {Promise<{devFeeEvents: Array, orderEvents: Array}>}
 */
export async function fetchMostroEvents(pubkey, relays, onStatus = () => {}) {
    const pool = new SimplePool();

    try {
        onStatus('Connecting to relays...');

        // Filter for dev fee events (kind 8383, z=dev-fee-payment, y=mostro)
        const devFeeFilter = {
            kinds: [DEV_FEE_EVENT_KIND],
            authors: [pubkey],
            '#z': ['dev-fee-payment'],
            '#y': ['mostro']
        };

        // Filter for order events (kind 38383, z=order)
        const orderFilter = {
            kinds: [ORDER_EVENT_KIND],
            authors: [pubkey],
            '#z': ['order']
        };

        onStatus('Fetching dev fee events...');
        const devFeeEvents = await pool.querySync(relays, devFeeFilter);

        onStatus('Fetching order events...');
        const orderEvents = await pool.querySync(relays, orderFilter);

        onStatus(`Found ${devFeeEvents.length} dev fee events and ${orderEvents.length} order events`);

        return {
            devFeeEvents: devFeeEvents,
            orderEvents: orderEvents
        };
    } finally {
        pool.close(relays);
    }
}

/**
 * Subscribe to Mostro events in real-time
 * @param {string} pubkey - hex pubkey
 * @param {string[]} relays - array of relay URLs
 * @param {function} onEvent - callback when new event arrives (event, type)
 * @param {function} onEose - callback when initial sync complete
 * @returns {{pool: SimplePool, sub: object, close: function}}
 */
export function subscribeMostroEvents(pubkey, relays, onEvent, onEose = () => {}) {
    const pool = new SimplePool();

    const filters = [
        {
            kinds: [DEV_FEE_EVENT_KIND],
            authors: [pubkey],
            '#z': ['dev-fee-payment'],
            '#y': ['mostro']
        },
        {
            kinds: [ORDER_EVENT_KIND],
            authors: [pubkey],
            '#z': ['order']
        }
    ];

    const sub = pool.subscribeMany(relays, filters, {
        onevent(event) {
            const type = event.kind === DEV_FEE_EVENT_KIND ? 'devFee' : 'order';
            onEvent(event, type);
        },
        oneose() {
            onEose();
        }
    });

    return {
        pool,
        sub,
        close() {
            sub.close();
            pool.close(relays);
        }
    };
}

/**
 * Get tag value from event
 * @param {Object} event - Nostr event
 * @param {string} tagName - Tag name (e.g., 'z', 's', 'd', 'amt')
 * @returns {string|null}
 */
export function getTagValue(event, tagName) {
    const tag = event.tags.find(t => t[0] === tagName);
    return tag ? tag[1] : null;
}
