// Main entry point
console.log('app.js module loading...');
import { parsePubkey, hexToNpub, subscribeMostroEvents } from './nostr.js';
import { computeMetrics } from './metrics.js';
import { showStatus, showError, showListening, renderReport, setButtonEnabled } from './ui.js';

// Global state
let currentSubscription = null;
let currentEvents = {
    devFeeEvents: [],
    orderEvents: []
};
let currentPubkey = null;
let currentNpub = null;

/**
 * Parse relays string into array
 * @param {string} relaysStr
 * @returns {string[]}
 */
function parseRelays(relaysStr) {
    return relaysStr
        .split(',')
        .map(r => r.trim())
        .filter(r => r.length > 0 && r.startsWith('wss://'));
}

/**
 * Recompute and render metrics
 */
function updateMetrics() {
    if (currentEvents.devFeeEvents.length === 0 && currentEvents.orderEvents.length === 0) {
        return; // No data yet
    }

    const metrics = computeMetrics(currentEvents.devFeeEvents, currentEvents.orderEvents);
    renderReport(metrics, currentNpub);

    console.log('Metrics updated:', {
        devFeeEvents: currentEvents.devFeeEvents.length,
        orderEvents: currentEvents.orderEvents.length,
        uniqueOrders: metrics.uniqueOrders,
        successfulTrades: metrics.successfulTrades
    });
}

/**
 * Start real-time analysis for a pubkey
 * @param {string} pubkeyInput
 * @param {string} relaysStr
 */
async function startAnalysis(pubkeyInput, relaysStr) {
    console.log('startAnalysis called with:', { pubkeyInput, relaysStr });

    // Close previous subscription if exists
    if (currentSubscription) {
        currentSubscription.close();
        currentSubscription = null;
    }

    // Reset state
    currentEvents = { devFeeEvents: [], orderEvents: [] };

    setButtonEnabled(false);

    try {
        // Parse pubkey
        const pubkey = parsePubkey(pubkeyInput);
        const npub = hexToNpub(pubkey);
        currentPubkey = pubkey;
        currentNpub = npub;
        console.log('Parsed pubkey:', pubkey);

        // Parse relays
        const relays = parseRelays(relaysStr);
        console.log('Parsed relays:', relays);
        if (relays.length === 0) {
            throw new Error('No valid relays specified. Use wss:// URLs.');
        }

        showStatus('Connecting and subscribing to relays...');
        console.log('Calling subscribeMostroEvents...');

        currentSubscription = subscribeMostroEvents(
            pubkey,
            relays,
            // onEvent - when a new event arrives
            (event, type) => {
                console.log('Event received:', type, event.id?.substring(0, 8));
                if (type === 'devFee') {
                    currentEvents.devFeeEvents.push(event);
                } else {
                    currentEvents.orderEvents.push(event);
                }
                // Recompute metrics with each new event
                updateMetrics();
            },
            // onEose - when initial sync is complete
            () => {
                console.log('EOSE received - initial sync complete');
                showListening('Listening for new orders...');
                setButtonEnabled(true);
            }
        );
        console.log('Subscription created');

    } catch (error) {
        console.error('Analysis error:', error);
        showError(error.message || 'An error occurred during analysis.');
        setButtonEnabled(true);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired - starting auto-analysis');

    const form = document.getElementById('analyze-form');
    const pubkeyInput = document.getElementById('pubkey');
    const relaysInput = document.getElementById('relays');

    console.log('Pubkey value:', pubkeyInput.value);
    console.log('Relays value:', relaysInput.value);

    // Handle manual pubkey change
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await startAnalysis(pubkeyInput.value, relaysInput.value);
    });

    // Auto-start with default values
    startAnalysis(pubkeyInput.value, relaysInput.value);
});
