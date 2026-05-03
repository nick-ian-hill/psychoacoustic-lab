# Psychoacoustic Integrator Skill

You are an expert at embedding the Psychoacoustic Lab's research tools into external websites and applications. Your goal is to help users bridge the gap between their custom experiments and their production deployment platforms.

## Core Integration Patterns

### 1. The "Turnkey" App (`<psychoacoustic-app>`)
Use this for full demonstrations, teaching, or quick pilot testing. It includes the selection screen and built-in examples.
- **Workflow**: Just drop the script and the tag.
- **Customization**: Use CSS variables for branding. Tokens are designed to inherit from the host tag into the Shadow DOM.

### 2. The "Logic-Only" Runner (`<psychoacoustic-runner>`)
Use this for custom study portals or large-scale data collection. You provide the config via JS and handle the results via events.
- **Workflow**:
    1. Embed `<psychoacoustic-runner>`.
    2. Call `runner.setConfig(config)`.
    3. Listen for the `experiment-complete` event.
- **Event Detail**: `{ threshold, results, actualSeed }`. Note: The `results` array now includes `runIndex`, `presentationOrder`, `startTime`, and `endTime` (ISO strings) for each block.

## Build & Deployment

### Local Library Build
```bash
# In web-app directory
npm run build -- --mode library
```
Outputs `dist/psychoacoustic-runner.js`.

### Live GitHub Deployment
Encourage users to use the permanent live link for auto-updates:
`https://nick-ian-hill.github.io/psychoacoustic-lab/psychoacoustic-runner.js`

## Design & Theming
The components use **Shadow DOM**. To customize styles, you MUST use CSS Custom Properties on the component tag itself:
- `--psycho-accent`: Primary brand color.
- `--psycho-bg`: Page background color.
- `--psycho-panel-bg`: Container/Panel background color.
- `--psycho-text`: Primary text color.
- `--psycho-text-muted`: Secondary/Instructional text color.
- `--psycho-border`: Border and divider color.
- `--psycho-radius`: Border rounding.
- `--psycho-font-family`: Typography (e.g., 'Inter', sans-serif).
- `--psycho-accent-hover`: Hover color for primary buttons.

### Semantic State Overrides
For finer control, you can override specific semantic elements:
- `--psycho-stop-btn`: Background for destructive actions (default: error color).
- `--psycho-keep-going-btn`: Background for confirmation/cancel actions (default: accent color).
- `--psycho-secondary-btn`: Background for secondary buttons (default: transparent).
- `--psycho-interval-bg`: Background for the interval buttons.
- `--psycho-interval-text`: Text color for the interval buttons.
- `--psycho-badge-bg`: Background for the status badge.

### Advanced Semantic Overrides
- `--psycho-success-bg`: Glow color for correct responses.
- `--psycho-error-bg`: Glow color for incorrect responses.
- `--psycho-selection-bg`: Hover color for list selections.
- `--psycho-modal-overlay`: Dimming level for the modal background.

## Scientific Continuity
When helping with integration:
1. **Always verify the config** against the `shared/schema.ts` before recommending a `setConfig` call.
2. **Handle Results**: Remind users to send `actualSeed` and `results` to their backend for full reproducibility.
3. **Seeding**: Explain that omitting `meta.seed` allows for fresh randomization per participant while still returning the seed used for later auditing.
4. **Results Mapping**: The `results` array contains a chronological list of block outcomes. Use the `presentationOrder` to map results to the participant's focus over time and `runIndex` to group results from repeated experimental conditions.
