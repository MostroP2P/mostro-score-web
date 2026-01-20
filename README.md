# Mostro Score Web

A web-based reputation analysis tool for Mostro P2P Lightning nodes. This application fetches public Nostr events and computes objective metrics to help users assess the reliability and operational health of Mostro nodes before trading.

## Features

- **Client-side computation**: All metric calculations run in the browser using JavaScript
- **Nostr integration**: Connects directly to Nostr relays via WebSocket
- **Comprehensive metrics**: Implements the full [Mostro Reputation System Specification v1.1](specs/reputation_system_v1.md)

### Metrics Computed

| Section | Metrics |
|---------|---------|
| **Longevity** | First activity date, days active |
| **Liveness** | Last trade timestamp, days since last trade, activity status |
| **Recent Activity** | Trades in last 7/30/90 days |
| **Activity Consistency** | Active days (last 30d), max inactive gap |
| **Cumulative Performance** | Total successful trades, total volume (sats/BTC) |
| **Trade Statistics** | Min/max/mean/median trade amounts |
| **Trust Score** | Composite score (0-100) based on age, volume, and trade count |

## Requirements

- Rust (for building the server)
- A modern web browser with JavaScript enabled

## Installation

```bash
git clone https://github.com/MostroP2P/mostro-score-web.git
cd mostro-score-web
cargo build --release
```

## Usage

Start the server:

```bash
cargo run --release
```

Open your browser to [http://localhost:3000](http://localhost:3000)

Enter a Mostro node's public key (npub or hex format) and optionally specify custom relays, then click "Analyze".

## Architecture

```
mostro-score-web/
├── Cargo.toml           # Rust dependencies
├── src/
│   └── main.rs          # Axum static file server
└── web/                 # Static assets served to browser
    ├── index.html       # Single-page application
    ├── css/
    │   └── styles.css   # Dark theme styling
    └── js/
        ├── app.js       # Main entry point
        ├── nostr.js     # Relay connection & event fetching
        ├── metrics.js   # Metrics computation
        └── ui.js        # DOM rendering
```

- **Server (Rust/Axum)**: Serves static files only
- **Client (JavaScript)**: Connects to Nostr relays, fetches events, computes metrics, displays results

## Data Sources

The tool analyzes two types of Nostr events published by Mostro nodes:

1. **Development Fee Events** (kind 8383)
   - Tags: `z=dev-fee-payment`, `y=mostro`
   - Used to determine when the node started trading

2. **Order Events** (kind 38383)
   - Tags: `z=order`, `s=success`
   - Used to calculate trade metrics and activity

## Trust Score Calculation

The trust score (0-100) is computed as:

- **Age** (max 30 points): Scales linearly up to 1 year of activity
- **Volume** (max 40 points): Scales linearly up to 1 BTC total volume
- **Trade Count** (max 30 points): Scales linearly up to 100 successful trades

## Related Projects

- [mostro](https://github.com/MostroP2P/mostro) - The Mostro P2P Lightning exchange daemon
- [mostro-score](https://github.com/MostroP2P/mostro-score) - CLI version of this tool

## License

MIT
