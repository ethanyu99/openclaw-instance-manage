# Contributing to Lobster Squad

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

- Node.js >= 24
- PostgreSQL
- Redis

### Getting Started

```bash
# Clone the repo
git clone https://github.com/ethanyu99/Lobster-Squad.git
cd Lobster-Squad

# Install all dependencies
npm run install:all

# Copy environment config
cp .env.example .env
# Edit .env with your local database credentials

# Start development servers
npm run dev
```

Frontend runs at `http://localhost:5174`, backend at `http://localhost:3002`.

## How to Contribute

### Reporting Bugs

Open an [issue](https://github.com/ethanyu99/Lobster-Squad/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- Environment info (OS, Node version, browser)

### Suggesting Features

Open an issue with the `enhancement` label describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Pull Requests

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   # or
   git checkout -b fix/your-bugfix
   ```
2. Make your changes
3. Ensure linting and type checks pass:
   ```bash
   cd client && npm run lint && npx tsc -b --noEmit
   cd ../server && npx tsc --noEmit
   ```
4. Run tests:
   ```bash
   cd server && npm test
   cd ../client && npm test -- --run
   ```
5. Commit with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add team export functionality
   fix: resolve WebSocket reconnection issue
   docs: update API reference
   ```
6. Push and open a PR against `main`

### Branch Naming

- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation
- `refactor/` — code refactoring
- `chore/` — maintenance tasks

## Code Style

- TypeScript strict mode
- ESLint for the client (run `npm run lint` in `client/`)
- Prefer functional components with hooks (React)
- Use Zustand for state management on the frontend

## Project Structure

- `client/` — React frontend (Vite + TypeScript)
- `server/` — Express backend (TypeScript)
- `shared/` — Shared type definitions
- `skills/` — Local skill definitions
- `docs/` — Architecture and planning documents

## Questions?

Open an issue or start a discussion. We're happy to help!
