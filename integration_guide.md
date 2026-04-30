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

- `<psychoacoustic-runner>`: A raw runner. You provide the JSON config via JavaScript. Best for custom-built experiment portals.
- `<psychoacoustic-app>`: A complete lab. Includes the experiment selection dropdown and all built-in examples. Best for quick deployment or "all-in-one" pages.

## 3. Embed in Your Website
Copy the generated `.js` file to your target website and include it using a script tag. 

### All-in-One Example (with Selection UI)
```html
<!DOCTYPE html>
<html>
<head>
    <title>My Experiment Lab</title>
    <script type="module" src="./psychoacoustic-runner.js"></script>
</head>
<body>
    <!-- This tag includes the dropdown and all standard examples -->
    <psychoacoustic-app></psychoacoustic-app>
</body>
</html>
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
                seed: 123, 
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
            const { threshold, results } = e.detail;
            
            // 'results' is an array of data for each block
            console.log("Full Session Data:", results);
            
            // Send data to your server here
        });
    </script>
</body>
</html>
```

## 4. Customizing the Design
The component uses Shadow DOM for style encapsulation, but you can easily customize its appearance using **CSS Variables**. Simply define these variables in your site's CSS (e.g., on the `body` or the component itself).

### Common Customizations
```css
psychoacoustic-runner {
  /* Change the primary accent color */
  --psycho-accent: #6366f1;
  --psycho-accent-hover: #4f46e5;
  
  /* Adjust typography */
  --psycho-font-family: 'Outfit', sans-serif;
  
  /* Modify corners and spacing */
  --psycho-radius: 12px;
  
  /* Dark mode / Light mode adjustments */
  --psycho-bg: #ffffff;
  --psycho-text: #1f2937;
  --psycho-card-bg: #f3f4f6;
  --psycho-border: #e5e7eb;
}
```

## 5. Automation & Synchronization
The modular approach is designed for ease of maintenance. Because I have updated your GitHub Actions workflow (`deploy.yml`), the build and deployment process is fully automated.

### Single Source of Truth
All core audio logic and experiment orchestration live in `web-app/src`. When you fix a bug or add a feature there, it is automatically updated in both the standalone site and the portable component.

### Zero-Maintenance Automation
By utilizing your GitHub Actions workflow (`deploy.yml`), both the standalone site and the portable library are updated on every push.

This means you can use the **Permanent Live Link** in your external websites:

```html
<!-- This script always stays up-to-date with your latest push to main -->
<script type="module" src="https://nick-ian-hill.github.io/psychoacoustic-lab/psychoacoustic-runner.js"></script>
```

**Workflow for making changes:**
1. Edit code in `web-app/src` or `shared/schema.ts`.
2. Push to GitHub.
3. Wait 2 minutes for the "Deploy to GitHub Pages" action to finish.
4. **Done!** Every website using the link above is now running the updated code.
