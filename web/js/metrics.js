// Metrics computation module (ported from Rust CLI)
import { getTagValue } from './nostr.js';

const SECONDS_PER_DAY = 86400;

/**
 * Compute all metrics from events
 * @param {Array} devFeeEvents - Dev fee payment events
 * @param {Array} orderEvents - Order events
 * @returns {Object} - Computed metrics
 */
export function computeMetrics(devFeeEvents, orderEvents) {
    const now = Math.floor(Date.now() / 1000);

    // Process dev fee events to get first activity timestamp
    let firstDevFeeTs = null;
    if (devFeeEvents.length > 0) {
        // Sort by created_at to get the earliest one
        const sorted = [...devFeeEvents].sort((a, b) => a.created_at - b.created_at);
        firstDevFeeTs = sorted[0].created_at;
    }

    // Deduplicate orders by 'd' tag (order ID), keeping the latest event
    const ordersMap = new Map();
    let firstOrderTs = Infinity;
    let lastOrderTs = 0;

    for (const event of orderEvents) {
        const eventTs = event.created_at;

        // Track order time range
        if (eventTs < firstOrderTs) {
            firstOrderTs = eventTs;
        }
        if (eventTs > lastOrderTs) {
            lastOrderTs = eventTs;
        }

        // Deduplicate by 'd' tag
        const orderId = getTagValue(event, 'd');
        if (orderId) {
            const existing = ordersMap.get(orderId);
            if (!existing || event.created_at > existing.created_at) {
                ordersMap.set(orderId, event);
            }
        }
    }

    // Process final state of unique orders
    let successfulOrders = 0;
    let totalVolumeSats = 0;
    const tradeAmounts = [];
    const successfulTradeTimestamps = [];

    for (const event of ordersMap.values()) {
        const status = getTagValue(event, 's');

        // Only count successful orders
        if (status === 'success') {
            successfulOrders++;
            successfulTradeTimestamps.push(event.created_at);

            // Get amount from 'amt' tag
            const amtStr = getTagValue(event, 'amt');
            if (amtStr) {
                const amount = parseInt(amtStr, 10);
                if (!isNaN(amount) && amount > 0) {
                    totalVolumeSats += amount;
                    tradeAmounts.push(amount);
                }
            }
        }
    }

    // Calculate days_active
    let daysActive;
    let instanceStarted = null;

    if (firstDevFeeTs !== null) {
        daysActive = (now - firstDevFeeTs) / SECONDS_PER_DAY;
        instanceStarted = firstDevFeeTs;
    } else if (lastOrderTs > 0) {
        // Fallback to order timestamps
        daysActive = (lastOrderTs - firstOrderTs) / SECONDS_PER_DAY;
    } else {
        daysActive = 0;
    }

    // Compute derived metrics
    const tradeStats = computeTradeStats(tradeAmounts);
    const rollingWindows = computeRollingWindows(successfulTradeTimestamps, now);
    const activityConsistency = computeActivityConsistency(successfulTradeTimestamps, now);

    const daysSinceLast = lastOrderTs > 0
        ? Math.floor((now - lastOrderTs) / SECONDS_PER_DAY)
        : 0;

    const score = calculateScore(daysActive, totalVolumeSats, successfulOrders);

    return {
        // Longevity
        firstActivity: instanceStarted,
        daysActive: daysActive,
        hasDevFeeEvents: firstDevFeeTs !== null,

        // Liveness
        lastTrade: lastOrderTs > 0 ? lastOrderTs : null,
        daysSinceLast: daysSinceLast,

        // Rolling windows
        trades7d: rollingWindows.last7d,
        trades30d: rollingWindows.last30d,
        trades90d: rollingWindows.last90d,

        // Activity consistency
        activeDays30d: activityConsistency.activeDays,
        maxInactiveGap: activityConsistency.maxGap,

        // Cumulative performance
        successfulTrades: successfulOrders,
        totalVolumeSats: totalVolumeSats,

        // Trade statistics
        minTrade: tradeStats.min,
        maxTrade: tradeStats.max,
        meanTrade: tradeStats.mean,
        medianTrade: tradeStats.median,
        hasTradeStats: tradeAmounts.length > 0,

        // Trust score
        trustScore: score,

        // Debug info
        totalOrderEvents: orderEvents.length,
        uniqueOrders: ordersMap.size,
        devFeeCount: devFeeEvents.length
    };
}

/**
 * Compute trade amount statistics (Section 4.1.3)
 * Ported from Rust: compute_trade_stats (lines 375-396)
 * @param {number[]} amounts
 * @returns {{min: number, max: number, mean: number, median: number}}
 */
export function computeTradeStats(amounts) {
    if (amounts.length === 0) {
        return { min: 0, max: 0, mean: 0, median: 0 };
    }

    const sorted = [...amounts].sort((a, b) => a - b);

    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const sum = amounts.reduce((acc, val) => acc + val, 0);
    const mean = sum / amounts.length;

    // Median calculation
    let median;
    const len = sorted.length;
    if (len % 2 === 0) {
        median = Math.floor((sorted[len / 2 - 1] + sorted[len / 2]) / 2);
    } else {
        median = sorted[Math.floor(len / 2)];
    }

    return { min, max, mean, median };
}

/**
 * Compute rolling window metrics (Section 4.2.2)
 * Ported from Rust: compute_rolling_windows (lines 399-409)
 * @param {number[]} timestamps
 * @param {number} now - Current timestamp
 * @returns {{last7d: number, last30d: number, last90d: number}}
 */
export function computeRollingWindows(timestamps, now) {
    const day7 = now - (7 * SECONDS_PER_DAY);
    const day30 = now - (30 * SECONDS_PER_DAY);
    const day90 = now - (90 * SECONDS_PER_DAY);

    const last7d = timestamps.filter(ts => ts >= day7).length;
    const last30d = timestamps.filter(ts => ts >= day30).length;
    const last90d = timestamps.filter(ts => ts >= day90).length;

    return { last7d, last30d, last90d };
}

/**
 * Compute activity consistency (Section 4.2.3)
 * Ported from Rust: compute_activity_consistency (lines 412-449)
 * @param {number[]} timestamps
 * @param {number} now - Current timestamp
 * @returns {{activeDays: number, maxGap: number}}
 */
export function computeActivityConsistency(timestamps, now) {
    const day30Ago = now - (30 * SECONDS_PER_DAY);

    // Get unique days with trades in last 30 days
    const activeDaysSet = new Set(
        timestamps
            .filter(ts => ts >= day30Ago)
            .map(ts => Math.floor(ts / SECONDS_PER_DAY))
    );

    const activeDaysCount = activeDaysSet.size;

    // Calculate max consecutive inactive days
    if (activeDaysSet.size === 0) {
        return { activeDays: 0, maxGap: 30 };
    }

    const days = Array.from(activeDaysSet).sort((a, b) => a - b);

    const today = Math.floor(now / SECONDS_PER_DAY);
    const day30Start = Math.floor(day30Ago / SECONDS_PER_DAY);

    let maxGap = 0;
    let prevDay = day30Start;

    for (const day of days) {
        const gap = Math.max(0, day - prevDay - 1);
        maxGap = Math.max(maxGap, gap);
        prevDay = day;
    }

    // Check gap from last active day to today
    const finalGap = Math.max(0, today - prevDay);
    maxGap = Math.max(maxGap, finalGap);

    return { activeDays: activeDaysCount, maxGap };
}

/**
 * Calculate trust score
 * Ported from Rust: calculate_score (lines 482-496)
 * @param {number} daysActive
 * @param {number} volumeSats
 * @param {number} successfulOrders
 * @returns {number}
 */
export function calculateScore(daysActive, volumeSats, successfulOrders) {
    let score = 0;

    // 1. Age (Max 30 pts for > 1 year)
    score += Math.min(1, daysActive / 365) * 30;

    // 2. Volume (Max 40 pts for > 1 BTC volume)
    const btcVol = volumeSats / 100_000_000;
    score += Math.min(1, btcVol / 1) * 40;

    // 3. Success Count (Max 30 pts for > 100 orders)
    score += Math.min(1, successfulOrders / 100) * 30;

    return Math.floor(score);
}
