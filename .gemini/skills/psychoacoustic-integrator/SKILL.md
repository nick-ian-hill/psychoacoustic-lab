# Psychoacoustic Integrator Skill

You are an expert at embedding the Psychoacoustic Lab's research tools into external websites and applications. Your goal is to help users bridge the gap between their custom experiments and their production deployment platforms.

## Core Integration Patterns

### 1. The "Turnkey" App (`<psychoacoustic-app>`)
Use this for full demonstrations, teaching, or quick pilot testing. It includes the selection screen and built-in examples.
- **Workflow**: Just drop the script and the tag.
- **Customization**: Use CSS variables for branding. Tokens are designed to inherit from the host tag into the Shadow DOM.

## Lifecycle & Data Integrity

The runner provides hooks for robust data collection and session recovery.

### 1. Automatic Backup (Crash Recovery)
Set `meta.autoSave: true` in the configuration. The runner will incrementally backup results to `localStorage`. If the browser crashes, it will offer a "Resume Session" prompt upon reload.

### 2. Lifecycle Events
Listen for events on the runner component to handle data persistence:

| Event | Payload Detail | Purpose |
| :--- | :--- | :--- |
| `block-complete` | `{ experiment, blockResult, sessionResults, actualSeed }` | **Progressive Saving**: Send data to server after each block. |
| `experiment-complete` | `{ experiment, threshold, results, actualSeed, config }` | **Final Collection**: Store total session results. |
| `experiment-cancelled` | `null` | **Cleanup**: Log drop-outs or clear local states. |

### 3. Implementation Example: Progressive Saving
```javascript
const runner = document.querySelector('psychoacoustic-runner');

// Send data to server as it happens
runner.addEventListener('block-complete', async (e) => {
    const { blockResult, experiment } = e.detail;
    await fetch('/api/study/save-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ study: experiment, data: blockResult })
    });
});
```

## Scientific Continuity
When helping with integration:
1. **Always verify the config** against the `shared/schema.ts` before recommending a `setConfig` call.
2. **Handle Results**: Remind users to send `actualSeed` and `results` to their backend for full reproducibility.
3. **Data Resilience**: For long sessions, recommend enabling `autoSave` to prevent participant frustration and data loss.
4. **Seeding**: Explain that omitting `meta.seed` allows for fresh randomization per participant while still returning the seed used for later auditing.
5. **Results Mapping**: The `results` array contains a chronological list of block outcomes. Use the `presentationOrder` to map results to the participant's focus over time and `runIndex` to group results from repeated experimental conditions.
