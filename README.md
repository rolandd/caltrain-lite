# Offline-First Caltrain PWA

A high-performance, offline-first transit app for Caltrain
commuters. Built with SvelteKit, Cloudflare Workers and KV. Designed
to work reliably even with spotty connectivity.

## Overview

The system is built on an **"Offline-First, Real-Time Second"**
philosophy. It downloads the full schedule to your device for instant
access, and layers real-time data on top when connectivity is
available.

### Key Features

- **Offline-First**: Full schedule stored in IndexedDB. Instant load times.
- **Real-Time**: Live train positions and delays via GTFS-RT (protobuf) from [511.org](https://511.org/).
- **Privacy-Focused**: No tracking, no cookies, no user accounts.
- **Open Source**: MIT Licensed. Deploy your own instance easily.
- **Optimized for Mobile**: Installable PWA with platform-native feel.

## Documentation

- **[System Architecture](docs/ARCHITECTURE.md)**: Detailed design,
  data flow diagrams, and schema definitions.
- **[Security](docs/SECURITY.md)**: Security model, headers, and API protection.
- **[Deployment Guide](docs/DEPLOYMENT.md)**: Step-by-step guide to deploying on Cloudflare.
- **[Secrets Management](docs/SECRETS.md)**: How to manage API keys and secrets.
- **[Contributing](CONTRIBUTING.md)**: Development setup, testing, and contribution guidelines.

## Quick Start

### For Users

Visit the [live site](https://transit.rolandd.dev) (or deploy your own instance).

### For Developers

1.  Clone the repo.
2.  Run `npm install`.
3.  See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development instructions.

## Project Structure

```
Transit.git/
├── apps/
│   └── pwa/                        # SvelteKit 5 SPA (Frontend)
├── worker/                         # Cloudflare Worker (Backend API)
├── scripts/                        # Data processing scripts (GTFS parsing)
├── packages/
│   └── types/                      # Shared TypeScript definitions
├── infra/                          # Terraform infrastructure as code
├── docs/                           # Documentation
└── .github/workflows/              # CI/CD pipelines
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
