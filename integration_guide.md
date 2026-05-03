# Integration Guide: Psychoacoustic Runner Web Component

The Psychoacoustic Lab runner can be easily integrated into any website as a portable Web Component. This allows you to maintain the experiment logic in this repository while embedding the runner into multiple external sites.

## 1. Build the Library
To generate the portable component, run the following command in the `web-app` directory:

```bash
npm run build -- --mode library
```

This will create a `dist/` folder containing `psychoacoustic-runner.js`.

## 2. Choose Your Component
The library provides two components depending on your needs:

- `<psychoacoustic-runner>`: **The Researcher's Choice.** A logic-only runner that is fully controllable via JavaScript. It provides the UI for the experiment itself but leaves the selection and configuration logic to you. Ideal for building custom experiment portals.
- `<psychoacoustic-app>`: **Turnkey Lab & Demo.** A complete "all-in-one" application with the premium selection UI and built-in standard examples. Perfect for demonstrations, teaching, or quickly testing custom configurations via the built-in "Upload JSON" feature.

## 3. Embed in Your Website
Copy the generated `.js` file to your target website and include it using a script tag. 

### All-in-One Example (Recommended)
This uses the `<psychoacoustic-app>` which matches the look and feel of the official lab.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Psychoacoustic Study</title>
  <!-- Optional: Customize the look using CSS variables -->
  <style>
    psychoacoustic-app {
      --psycho-accent: #3b82f6; /* Change brand color */
      --psycho-radius: 12px;    /* Change corner rounding */
    }
  </style>
</head>
<body>
  <psychoacoustic-app></psychoacoustic-app>
  
  <script type="module" src="path/to/psychoacoustic-runner.js"></script>
</body>
</html>
```

## 4. Theming & Customization
The components are encapsulated using Shadow DOM, but you can easily "theme" them from your parent website using **CSS Custom Properties (Variables)**.

| Variable | Default | Description |
|----------|---------|-------------|
| `--psycho-accent` | `#38bdf8` | The primary brand/action color |
| `--psycho-bg` | `#0f172a` | Main background color |
| `--psycho-panel-bg` | `#1e293b` | Background for the experiment card |
| `--psycho-text` | `#f8fafc` | Primary text color |
| `--psycho-text-muted` | `#94a3b8` | Subtitles and labels |
| `--psycho-radius` | `8px` | Global border radius |

Simply apply these variables to the component tag in your site's CSS:

```css
psychoacoustic-app {
  --psycho-accent: #ff4757;
  --psycho-bg: #ffffff;
  --psycho-text: #2f3542;
}
```

### Minimal Example (Custom Config)
```html
<!DOCTYPE html>
<html>
<head>
    <title>My Experiment Site</title>
    <!-- 1. Load the component -->
    <script type="module" src="./psychoacoustic-runner.js"></script>
</head>
<body>
    <h1>Listening Test</h1>
    
    <!-- 2. Place the runner -->
    <psychoacoustic-runner id="listener"></psychoacoustic-runner>

    <script>
        const runner = document.getElementById('listener');
        
        // 3. Provide your experiment configuration
        const myConfig = {
            meta: { 
                name: "Tone Detection", 
                version: "1.0", 
                // seed: 123, // Omit for a random session every time
                summary: "Select the tone." 
            },
            blocks: [
                {
                    id: "block1",
                    paradigm: {
                        type: "2AFC",
                        intervals: [
                            { condition: "reference" },
                            { condition: "target" }
                        ],
                        randomizeOrder: true,
                        timing: { isiMs: 500, itiMs: 1000 }
                    },
                    stimuli: [ /* ... stimulus generators ... */ ],
                    adaptive: { /* ... adaptive rules ... */ }
                }
            ]
        };
        
        runner.setConfig(myConfig);

        // 4. Handle results
        runner.addEventListener('experiment-complete', (e) => {
            console.log("Experiment Finished!", e.detail);
            const { threshold, results, actualSeed } = e.detail;
            
            console.log("Reproducible Seed:", actualSeed);
            console.log("Full Session Data:", results);
            
            // Send data to your server here
        });
    </script>
</body>
</html>
```

## 4. Customizing the Design
The component uses Shadow DOM for style encapsulation, but you can easily customize its appearance using **CSS Variables**. Simply define these variables in your site's CSS on the component tag itself (e.g., `psychoacoustic-app { --psycho-accent: #... }`). 

### Common Customizations
```css
psychoacoustic-runner {
  /* Core Brand Tokens */
  --psycho-accent: #6366f1;
  --psycho-bg: #0f172a;
  --psycho-panel-bg: #1e293b;
  --psycho-text: #f8fafc;
  --psycho-text-muted: #94a3b8;
  --psycho-border: rgba(148, 163, 184, 0.1);
  --psycho-radius: 8px;
  --psycho-font-family: 'Inter', sans-serif;

  /* Hover State */
  --psycho-accent-hover: #4f46e5;

  /* Semantic State Overrides */
  --psycho-stop-btn: #ef4444;       /* Custom background for 'Stop' button */
  --psycho-keep-going-btn: #38bdf8;  /* Custom background for 'Keep Going' button */
  --psycho-interval-bg: #1e293b;    /* Custom background for interval buttons */
  --psycho-interval-text: #ffffff;  /* Custom text color for interval buttons */
  --psycho-badge-bg: rgba(99, 102, 241, 0.15); /* Custom Trials Remaining badge */
}
```

## 5. Advanced Lifecycle & Data Integrity

For professional research, the runner provides lifecycle events to enable server-side persistence and automatic crash recovery.

### Automatic Backups (Crash Recovery)
You can enable automatic `localStorage` backups by setting `autoSave: true` in the experiment metadata. If the browser crashes or the user accidentally closes the tab, the runner will offer to resume the session upon reload.

```javascript
const config = {
  meta: {
    name: "My Study",
    autoSave: true, // Enables incremental backup to localStorage
    ...
  },
  blocks: [...]
};
```

### Programmatic Data Saving (Events)
Listen for lifecycle events to send data to your own backend as it happens.

| Event | Trigger | Detail Payload |
|-------|---------|----------------|
| `block-complete` | After each block finishes | `{ experiment, blockResult, sessionResults, actualSeed }` |
| `experiment-complete` | After the entire session finishes | `{ experiment, threshold, results, actualSeed, config }` |
| `experiment-cancelled` | If the user terminates the session | `null` |

#### Example: Progressive Saving
```javascript
const runner = document.getElementById('my-runner');

// Save data progressively to your server after every block
runner.addEventListener('block-complete', (e) => {
    const { experiment, blockResult } = e.detail;
    
    fetch('/api/results/incremental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            study: experiment,
            block: blockResult
        })
    });
});
```



## 5. Automation & Synchronization
The modular architecture ensures that the portable components stay in sync with the core experiment logic. The repository includes a GitHub Actions workflow (`deploy.yml`) that automatically builds and deploys the library on every push to the `main` branch.

### Single Source of Truth
All core audio synthesis and experiment orchestration logic live in `web-app/src`. Any improvements or bug fixes made there are automatically propagated to both the standalone laboratory and the portable Web Components.

### Permanent Live Links
By leveraging GitHub Pages, you can use a "permanent" link to ensure your embedded experiments always run the latest stable version:

```html
<!-- This script always stays up-to-date with the latest deployment -->
<script type="module" src="https://nick-ian-hill.github.io/psychoacoustic-lab/psychoacoustic-runner.js"></script>
```

**Workflow for updates:**
1. Modify code in `web-app/src` or `shared/schema.ts`.
2. Push changes to GitHub.
3. The automated deployment finishes in ~2 minutes.
4. **All embedded instances** are now running the latest version automatically.

## 6. Seeding & Reproducibility
The `seed` property in the configuration is **optional**.
- **Omitted**: The runner generates a random session seed.
- **Provided**: The runner uses your seed for a deterministic, reproducible session.

In both cases, the final `experiment-complete` event includes the `actualSeed` used:

```javascript
runner.addEventListener('experiment-complete', (e) => {
    // This is the seed you can use to re-run the exact same session
    const seedUsed = e.detail.actualSeed; 
    console.log("Session Seed:", seedUsed);
});
```
