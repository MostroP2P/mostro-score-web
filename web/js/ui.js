// UI rendering module

/**
 * Format timestamp to human-readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp * 1000);
    return date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}

/**
 * Format relative time for human readability (Section 6.1)
 * Ported from Rust: format_relative_time (lines 452-480)
 * @param {number} timestamp - Unix timestamp
 * @param {number} now - Current timestamp
 * @returns {string}
 */
export function formatRelativeTime(timestamp, now) {
    const diffSecs = now - timestamp;

    if (diffSecs < 0) {
        return 'in the future';
    }

    const days = Math.floor(diffSecs / 86400);
    const hours = Math.floor((diffSecs % 86400) / 3600);

    if (days === 0) {
        if (hours === 0) {
            return 'less than an hour ago';
        } else if (hours === 1) {
            return '1 hour ago';
        } else {
            return `${hours} hours ago`;
        }
    } else if (days === 1) {
        return '1 day ago';
    } else if (days >= 2 && days <= 6) {
        return `${days} days ago`;
    } else if (days >= 7 && days <= 13) {
        return '1 week ago';
    } else if (days >= 14 && days <= 29) {
        return `${Math.floor(days / 7)} weeks ago`;
    } else if (days >= 30 && days <= 59) {
        return '1 month ago';
    } else if (days >= 60 && days <= 364) {
        return `${Math.floor(days / 30)} months ago`;
    } else {
        return `${Math.floor(days / 365)} years ago`;
    }
}

/**
 * Format sats with thousand separators
 * @param {number} sats
 * @returns {string}
 */
export function formatSats(sats) {
    return sats.toLocaleString() + ' sats';
}

/**
 * Format BTC value
 * @param {number} sats
 * @returns {string}
 */
export function formatBtc(sats) {
    return (sats / 100_000_000).toFixed(4) + ' BTC';
}

/**
 * Get activity status based on days since last trade
 * @param {number} daysSinceLast
 * @returns {{label: string, class: string}}
 */
export function getActivityStatus(daysSinceLast) {
    if (daysSinceLast > 30) {
        return { label: 'INACTIVE', class: 'badge-red' };
    } else if (daysSinceLast > 7) {
        return { label: 'LOW ACTIVITY', class: 'badge-yellow' };
    } else {
        return { label: 'ACTIVE', class: 'badge-green' };
    }
}

/**
 * Get score color class
 * @param {number} score
 * @returns {string}
 */
export function getScoreClass(score) {
    if (score >= 70) return 'score-green';
    if (score >= 40) return 'score-yellow';
    return 'score-red';
}

/**
 * Show/hide element
 * @param {string} id
 * @param {boolean} show
 */
function setVisible(id, show) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('hidden', !show);
    }
}

/**
 * Set element text
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

/**
 * Show status message
 * @param {string} message
 */
export function showStatus(message) {
    setVisible('status-section', true);
    setVisible('error-section', false);
    setVisible('report-section', false);
    setText('status-text', message);
}

/**
 * Show listening indicator (keeps report visible)
 * @param {string} message
 */
export function showListening(message = 'Listening for new orders...') {
    setVisible('status-section', true);
    setVisible('error-section', false);
    // Keep report visible
    setText('status-text', message);
}

/**
 * Show error message
 * @param {string} message
 */
export function showError(message) {
    setVisible('status-section', false);
    setVisible('error-section', true);
    setVisible('report-section', false);
    setText('error-message', message);
}

/**
 * Hide all status/error sections
 */
export function hideMessages() {
    setVisible('status-section', false);
    setVisible('error-section', false);
}

/**
 * Render the full report
 * @param {Object} metrics
 * @param {string} npub - Node pubkey in npub format
 */
export function renderReport(metrics, npub) {
    const now = Math.floor(Date.now() / 1000);

    hideMessages();
    setVisible('report-section', true);

    // Node info
    setText('node-pubkey', npub);

    // Longevity
    if (metrics.hasDevFeeEvents && metrics.firstActivity) {
        setText('first-activity', formatDate(metrics.firstActivity));
        setText('days-active', `${metrics.daysActive.toFixed(1)} days`);
    } else {
        setText('first-activity', 'N/A (no dev fee events)');
        setText('days-active', `${metrics.daysActive.toFixed(1)} days (estimated from orders)`);
    }

    // Liveness
    if (metrics.lastTrade) {
        const lastTradeEl = document.getElementById('last-trade');
        const relativeTime = formatRelativeTime(metrics.lastTrade, now);
        lastTradeEl.textContent = `${formatDate(metrics.lastTrade)} (${relativeTime})`;

        // Apply color based on activity status
        const status = getActivityStatus(metrics.daysSinceLast);
        lastTradeEl.className = `value liveness-${status.class.replace('badge-', '')}`;

        setText('days-since-last', metrics.daysSinceLast);

        const badgeEl = document.getElementById('activity-badge');
        badgeEl.textContent = status.label;
        badgeEl.className = `badge ${status.class}`;
    } else {
        setText('last-trade', 'No successful trades recorded');
        setText('days-since-last', 'N/A');
        const badgeEl = document.getElementById('activity-badge');
        badgeEl.textContent = '';
        badgeEl.className = 'badge';
    }

    // Recent Activity
    setText('trades-7d', `${metrics.trades7d} trades`);
    setText('trades-30d', `${metrics.trades30d} trades`);
    setText('trades-90d', `${metrics.trades90d} trades`);

    // Activity Consistency
    setText('active-days', `${metrics.activeDays30d}/30`);
    const maxGapText = metrics.maxInactiveGap > 7
        ? `${metrics.maxInactiveGap} days (warning)`
        : `${metrics.maxInactiveGap} days`;
    setText('max-gap', maxGapText);

    // Cumulative Performance
    setText('successful-trades', metrics.successfulTrades);
    setText('total-volume', `${formatSats(metrics.totalVolumeSats)} (${formatBtc(metrics.totalVolumeSats)})`);

    // Trade Statistics
    if (metrics.hasTradeStats) {
        setVisible('trade-stats-card', true);
        setText('min-trade', formatSats(metrics.minTrade));
        setText('max-trade', formatSats(metrics.maxTrade));
        setText('mean-trade', formatSats(Math.round(metrics.meanTrade)));
        setText('median-trade', formatSats(metrics.medianTrade));
    } else {
        setVisible('trade-stats-card', false);
    }

    // Trust Score
    const scoreEl = document.getElementById('trust-score');
    scoreEl.textContent = `${metrics.trustScore}/100`;
    scoreEl.className = `trust-score ${getScoreClass(metrics.trustScore)}`;
}

/**
 * Enable/disable the analyze button
 * @param {boolean} enabled
 */
export function setButtonEnabled(enabled) {
    const btn = document.getElementById('analyze-btn');
    if (btn) {
        btn.disabled = !enabled;
        btn.textContent = enabled ? 'Analyze' : 'Analyzing...';
    }
}
