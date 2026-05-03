import { ExperimentRunner } from "./logic/runner.js";
import styles from "../style.css?inline";
import {
  pitchDiscriminationConfig,
  intensityDiscriminationConfig,
  toneInNoiseConfig,
  amDetectionConfig,
  itdDiscriminationConfig,
  profileAnalysisConfig
} from "../../examples/examples.js";

const EXAMPLES = {
  pitchDiscrimination: pitchDiscriminationConfig,
  intensityDiscrimination: intensityDiscriminationConfig,
  toneInNoise: toneInNoiseConfig,
  amDetection: amDetectionConfig,
  itdDiscrimination: itdDiscriminationConfig,
  profileAnalysis: profileAnalysisConfig
};

/**
 * Shared Header Template to ensure consistent branding
 */
const getHeaderTemplate = () => `
  <header>
    <h1><span>Psychoacoustic</span> Lab</h1>
  </header>
`;

/**
 * Component: psychoacoustic-runner
 * Raw experiment runner with its own UI
 */
class PsychoacousticRunner extends HTMLElement {
  public runner: ExperimentRunner | null = null;
  public container: HTMLElement | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.container = this.shadowRoot!.querySelector(".psycho-runner-container") as HTMLElement;
    const disableAutoSave = this.hasAttribute("disable-autosave");
    this.runner = new ExperimentRunner(this.container, { disableAutoSave });

    const configName = this.getAttribute("config");
    if (configName) {
      this.loadRemoteConfig(configName);
    }

    // Add local listeners for the results buttons
    this.shadowRoot!.getElementById("download-results-btn")?.addEventListener("click", () => this.handleDownload());
    this.shadowRoot!.getElementById("finish-btn")?.addEventListener("click", () => this.cancel());
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <style>
        ${styles}
        :host { display: block; width: 100%; }
        .psycho-runner-container { 
          all: initial; 
          font-family: var(--psycho-font-family, 'Inter', sans-serif); 
          display: block; 
          color: var(--psycho-text);
          background: var(--psycho-bg);
          min-height: inherit;
        }
      </style>
      <div class="psycho-runner-container">
        <div class="container">
          ${getHeaderTemplate()}

          <div id="experiment-screen" class="experiment-area">
            <div class="experiment-info">
              <div class="status-container">
                <div id="status-badge" class="status-badge hidden"></div>
              </div>
              <div id="instruction-text" class="instruction-text">Select the target.</div>
            </div>
            
            <div class="experiment-main">
              <div id="play-btn-container" class="play-btn-container">
                <button id="play-btn" class="btn">Start Experiment</button>
              </div>

              <div id="response-buttons" class="response-buttons">
                <!-- Dynamic buttons generated here -->
              </div>
            </div>

            <div id="results-area" class="results-area hidden">
              <h2>Experiment Complete</h2>
              <p id="results-text"></p>
              <div class="results-actions">
                <button id="download-results-btn" class="btn">Download JSON</button>
                <button id="finish-btn" class="btn">New Experiment</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async loadRemoteConfig(name: string) {
    console.log(`Loading config: ${name}`);
  }

  public setConfig(config: any) {
    if (this.runner) {
      this.runner.loadConfig(config);
    }
  }

  public cancel() {
    if (this.runner) {
      this.runner.cancel();
    }
  }

  private async handleDownload() {
    if (!this.runner) return;
    
    // We need to access results from the runner instance
    // Note: The runner instance has sessionResults and currentConfig
    const runnerAny = this.runner as any;
    const data = {
      timestamp: new Date().toISOString(),
      experimentName: runnerAny.currentConfig?.meta?.name || "Experiment",
      actualSeed: runnerAny.activeSeed,
      results: runnerAny.sessionResults
    };

    const content = JSON.stringify(data, null, 2);
    const fileName = `results_${(runnerAny.currentConfig?.meta?.name || "experiment").replace(/\s+/g, "_")}_${Date.now()}.json`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error("Save Picker failed, falling back", err);
      }
    }

    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}

customElements.define("psychoacoustic-runner", PsychoacousticRunner);

/**
 * Component: psychoacoustic-app
 * Complete lab with selection UI and built-in examples
 */
class PsychoacousticApp extends HTMLElement {
  private selectedValue: string = "pitchDiscrimination";
  private customConfig: any = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <style>
        ${styles}
        :host { display: block; width: 100%; }
        .app-container { 
          all: initial; 
          font-family: var(--psycho-font-family, 'Inter', sans-serif); 
          display: block; 
          color: var(--psycho-text);
          background: var(--psycho-bg);
          min-height: inherit;
        }
        .hidden { display: none !important; }
        
        /* Dropdown specific fixes */
        .custom-select { position: relative; width: 100%; }
        .select-options { width: 100%; z-index: 1000; }
        .option { color: var(--psycho-text); } /* Ensure contrast */
      </style>
      <div class="app-container">
        <div id="selection-screen" class="container">
          ${getHeaderTemplate()}
          
          <div class="control-group">
            <label>Select Experiment</label>
            <div class="custom-select" id="custom-dropdown">
              <div class="select-trigger" id="dropdown-trigger" tabindex="0" role="button" aria-haspopup="listbox">
                <span id="selected-text">Pitch Discrimination</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 1.25rem; height: 1.25rem;">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div class="select-options hidden" id="dropdown-options">
                <div class="option selected" data-value="pitchDiscrimination">Pitch Discrimination</div>
                <div class="option" data-value="intensityDiscrimination">Intensity Discrimination</div>
                <div class="option" data-value="toneInNoise">Tone in Noise</div>
                <div class="option" data-value="amDetection">AM Detection</div>
                <div class="option" data-value="itdDiscrimination">ITD Discrimination</div>
                <div class="option" data-value="profileAnalysis">Profile Analysis</div>
                <div class="option" data-value="custom">Upload Custom JSON Configuration</div>
              </div>
            </div>
          </div>

          <div id="custom-json-group" class="control-group hidden">
            <label>Select Experiment JSON File</label>
            <input type="file" id="custom-file" accept=".json" 
              style="background: var(--psycho-bg); color: var(--psycho-text); padding: 0.75rem; border: 1px solid var(--psycho-border); border-radius: var(--psycho-radius); width: 100%;">
          </div>

          <div id="selection-description" class="selection-description">
            <!-- Initialized in setupListeners -->
          </div>

          <div style="display: flex; justify-content: center; margin-top: 1.5rem;">
            <button id="load-btn" class="btn">Confirm Selection</button>
          </div>
        </div>

        <div id="runner-screen" class="hidden">
           <psychoacoustic-runner id="the-runner" disable-autosave></psychoacoustic-runner>
        </div>
      </div>
    `;
  }

  private setupListeners() {
    const trigger = this.shadowRoot!.getElementById("dropdown-trigger") as HTMLElement;
    const optionsList = this.shadowRoot!.getElementById("dropdown-options") as HTMLElement;
    const dropdown = this.shadowRoot!.getElementById("custom-dropdown") as HTMLElement;
    const selectedText = this.shadowRoot!.getElementById("selected-text") as HTMLElement;
    const loadBtn = this.shadowRoot!.getElementById("load-btn") as HTMLButtonElement;
    const selectionScreen = this.shadowRoot!.getElementById("selection-screen") as HTMLElement;
    const runnerScreen = this.shadowRoot!.getElementById("runner-screen") as HTMLElement;
    const runner = this.shadowRoot!.getElementById("the-runner") as any;
    const description = this.shadowRoot!.getElementById("selection-description") as HTMLElement;
    const customGroup = this.shadowRoot!.getElementById("custom-json-group") as HTMLElement;
    const customFile = this.shadowRoot!.getElementById("custom-file") as HTMLInputElement;

    // Keyboard Navigation State
    let highlightedIndex = -1;
    const options = Array.from(optionsList.querySelectorAll(".option"));

    const updateHighlight = (index: number) => {
      options.forEach((opt, i) => {
        opt.classList.toggle("highlighted", i === index);
      });
      if (index >= 0) {
        options[index].scrollIntoView({ block: "nearest" });
      }
    };

    // Toggle Dropdown
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = !optionsList.classList.contains("hidden");
      if (isOpen) {
        optionsList.classList.add("hidden");
        dropdown.classList.remove("open");
      } else {
        optionsList.classList.remove("hidden");
        dropdown.classList.add("open");
        // Reset highlight to current selection
        highlightedIndex = options.findIndex(opt => opt.classList.contains("selected"));
        updateHighlight(highlightedIndex);
      }
    });

    // Global keydown for accessibility
    document.addEventListener("keydown", (e) => {
      const isTriggerFocused = this.shadowRoot!.activeElement === trigger;
      const isHidden = optionsList.classList.contains("hidden");

      // Handle opening when focused
      if (isHidden && isTriggerFocused && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        trigger.click();
        return;
      }

      if (isHidden) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
        updateHighlight(highlightedIndex);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        updateHighlight(highlightedIndex);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (highlightedIndex >= 0) {
          (options[highlightedIndex] as HTMLElement).click();
        }
      } else if (e.key === "Escape") {
        optionsList.classList.add("hidden");
        dropdown.classList.remove("open");
      }
    });

    // Global click to close dropdown
    document.addEventListener("click", () => {
      optionsList.classList.add("hidden");
      dropdown.classList.remove("open");
    });

    // Handle Option Selection
    options.forEach(option => {
      // Prevent long-press context menu which blocks the click event on some mobile browsers
      option.addEventListener("contextmenu", (e) => e.preventDefault());

      const onSelect = (e: Event) => {
        // If the dropdown is already hidden, ignore (prevents double-triggering from click+pointerup)
        if (optionsList.classList.contains("hidden")) return;

        e.stopPropagation();
        const value = option.getAttribute("data-value") || "";
        const text = option.textContent || "";
        this.selectedValue = value;
        selectedText.textContent = text;

        options.forEach(opt => opt.classList.remove("selected"));
        option.classList.add("selected");

        // Close dropdown
        optionsList.classList.add("hidden");
        dropdown.classList.remove("open");

        // Update UI state
        customGroup.classList.toggle("hidden", value !== "custom");
        
        const config = (EXAMPLES as any)[value];
        description.textContent = config?.meta?.description || (value === "custom" ? "Upload a valid ExperimentConfig JSON file to begin." : "No description available.");
      };

      option.addEventListener("click", onSelect);
      
      // Fallback for mobile devices where long-press cancels the click event
      option.addEventListener("pointerup", (e: Event) => {
        const pe = e as PointerEvent;
        if (pe.pointerType !== 'mouse') {
          onSelect(e);
        }
      });
    });

    // Handle File Upload
    customFile.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          this.customConfig = JSON.parse(event.target?.result as string);
        } catch (err) {
          alert("Invalid JSON file");
        }
      };
      reader.readAsText(file);
    });

    // Listen for cancellation/finish from runner
    runner.addEventListener("experiment-cancelled", () => {
      selectionScreen.classList.remove("hidden");
      runnerScreen.classList.add("hidden");
    });

    // Load Experiment
    loadBtn.addEventListener("click", () => {
      let config = (EXAMPLES as any)[this.selectedValue];
      if (this.selectedValue === "custom") {
        config = this.customConfig;
      }

      if (config) {
        selectionScreen.classList.add("hidden");
        runnerScreen.classList.remove("hidden");
        runner.setConfig(config);
      } else {
        alert("Please select a valid experiment.");
      }
    });

    // Initialize description
    const initialConfig = (EXAMPLES as any)[this.selectedValue];
    if (initialConfig?.meta?.description) {
      description.textContent = initialConfig.meta.description;
    }
  }
}

customElements.define("psychoacoustic-app", PsychoacousticApp);
