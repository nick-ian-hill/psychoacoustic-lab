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

const examples = {
  pitchDiscrimination: pitchDiscriminationConfig,
  intensityDiscrimination: intensityDiscriminationConfig,
  toneInNoise: toneInNoiseConfig,
  amDetection: amDetectionConfig,
  itdDiscrimination: itdDiscriminationConfig,
  profileAnalysis: profileAnalysisConfig
};

class PsychoacousticRunner extends HTMLElement {
  private runner: ExperimentRunner | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
    const container = this.shadowRoot!.querySelector(".psycho-runner-container") as HTMLElement;
    this.runner = new ExperimentRunner(container);

    // Auto-load config if provided via attribute
    const configName = this.getAttribute("config");
    if (configName) {
      this.loadRemoteConfig(configName);
    }
  }

  private render() {
    this.shadowRoot!.innerHTML = `
      <style>
        ${styles}
        :host {
          display: block;
          width: 100%;
        }
        .psycho-runner-container {
          all: initial; /* Reset inherited styles */
          font-family: 'Inter', sans-serif;
          display: block;
        }
      </style>
      <div class="psycho-runner-container">
        <div class="container">
          <header>
            <h1>Psychoacoustic<span>Lab</span></h1>
            <p class="subtitle">Research Edition</p>
          </header>

          <div id="status-badge" class="status-badge hidden"></div>

          <div class="main-content">
            <div id="instruction-text" class="instruction-text">Select the target.</div>
            
            <div id="play-btn-container" class="play-btn-container">
              <button id="play-btn" class="btn">Start Experiment</button>
            </div>

            <div id="response-buttons" class="response-buttons">
              <!-- Dynamic buttons generated here -->
            </div>

            <div id="results-area" class="results-area hidden">
              <h2>Success!</h2>
              <p id="results-text"></p>
              <div class="results-actions">
                <button id="download-results-btn" class="btn">Download Results (JSON)</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async loadRemoteConfig(name: string) {
    // This could fetch from a URL or use a global registry
    console.log(`Loading config: ${name}`);
    // For now, users can call runner.loadConfig(json) directly
  }

  // Public API
  public setConfig(config: any) {
    if (this.runner) {
      this.runner.loadConfig(config);
    }
  }
}

customElements.define("psychoacoustic-runner", PsychoacousticRunner);

class PsychoacousticApp extends HTMLElement {
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
        :host { display: block; }
        .app-container { all: initial; font-family: 'Inter', sans-serif; display: block; }
        .hidden { display: none !important; }
      </style>
      <div class="app-container">
        <div id="selection-screen" class="container">
          <header>
            <h1>Psychoacoustic<span>Lab</span></h1>
            <p class="subtitle">Select an experiment to begin</p>
          </header>
          
          <div class="control-group">
            <label>Experiment Configuration</label>
            <select id="experiment-select" class="btn" style="width: 100%; text-align: left; background: var(--psycho-card-bg); border: 1px solid var(--psycho-border); padding: 1rem; color: var(--psycho-text); cursor: pointer;">
              <option value="pitchDiscrimination">Pitch Discrimination</option>
              <option value="intensityDiscrimination">Intensity Discrimination</option>
              <option value="toneInNoise">Tone in Noise</option>
              <option value="amDetection">AM Detection</option>
              <option value="itdDiscrimination">ITD Discrimination</option>
              <option value="profileAnalysis">Profile Analysis</option>
            </select>
          </div>

          <div id="selection-description" class="selection-description" style="margin-top: 1.5rem; padding: 1rem; background: var(--psycho-card-bg); font-size: 0.9rem; line-height: 1.5; color: var(--psycho-text-muted); border-left: 3px solid var(--psycho-accent); border-radius: 0;">
            Pick an experiment from the list above.
          </div>

          <div style="display: flex; justify-content: center; margin-top: 1.5rem;">
            <button id="load-btn" class="btn">Start Selected Experiment</button>
          </div>
        </div>

        <div id="runner-screen" class="hidden">
           <psychoacoustic-runner id="the-runner"></psychoacoustic-runner>
           <div style="display: flex; justify-content: center; margin-top: 1rem;">
             <button id="back-btn" class="btn secondary" style="font-size: 0.8rem; padding: 0.5rem 1rem;">Back to Selection</button>
           </div>
        </div>
      </div>
    `;
  }

  private setupListeners() {
    const select = this.shadowRoot!.getElementById("experiment-select") as HTMLSelectElement;
    const loadBtn = this.shadowRoot!.getElementById("load-btn") as HTMLButtonElement;
    const backBtn = this.shadowRoot!.getElementById("back-btn") as HTMLButtonElement;
    const selectionScreen = this.shadowRoot!.getElementById("selection-screen") as HTMLElement;
    const runnerScreen = this.shadowRoot!.getElementById("runner-screen") as HTMLElement;
    const runner = this.shadowRoot!.getElementById("the-runner") as any;
    const description = this.shadowRoot!.getElementById("selection-description") as HTMLElement;

    select.addEventListener("change", () => {
      const config = (examples as any)[select.value];
      description.textContent = config?.meta?.description || "No description available.";
    });

    runner.container.addEventListener("experiment-cancelled", () => {
      selectionScreen.classList.remove("hidden");
      runnerScreen.classList.remove("hidden"); // Wait, runnerScreen is the container for the runner UI
      // In entry-component, runnerScreen and selectionScreen are siblings.
      selectionScreen.classList.remove("hidden");
      runnerScreen.classList.add("hidden");
    });

    loadBtn.addEventListener("click", () => {
      const config = (examples as any)[select.value];
      if (config) {
        selectionScreen.classList.add("hidden");
        runnerScreen.classList.remove("hidden");
        runner.setConfig(config);
      }
    });

    // Initialize description for default selection
    const initialConfig = (examples as any)[select.value];
    if (initialConfig?.meta?.description) {
      description.textContent = initialConfig.meta.description;
    }

    backBtn.addEventListener("click", () => {
      // Instead of reloading the page (which is bad for an embedded component),
      // we just toggle the views back. The runner will re-initialize when
      // a new config is loaded.
      selectionScreen.classList.remove("hidden");
      runnerScreen.classList.add("hidden");
    });
  }
}

customElements.define("psychoacoustic-app", PsychoacousticApp);
