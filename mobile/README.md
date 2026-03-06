# SparkFlow Mobile

Expo/React Native mobile app for SparkFlow.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start Expo:

```bash
npx expo start
```

## Project Structure

- `app/`: expo-router pages
- `features/`: feature APIs and hooks
- `components/`: reusable UI components
- `providers/`: app-level providers and bootstrap logic
- `types/`: shared TypeScript types
- `utils/`: utilities (network config, date helpers)
- `constants/`: config constants and endpoints

## Development Notes

- Backend URL is managed by `utils/networkConfig.ts`.
- Authentication token is managed by `features/core/api/client.ts`.
- For type checks:

```bash
npx tsc --noEmit
```
