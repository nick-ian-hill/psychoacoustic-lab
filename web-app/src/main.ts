import { ExperimentRunner } from "./logic/runner.js";
import { 
  practiceTestConfig, 
  intensityDiscrimConfig, 
  toneInNoiseConfig, 
  amDetectionConfig,
  itdDiscrimConfig,
  profileAnalysisConfig 
} from "../../examples/examples.js";

const examples = {
  practiceTest: practiceTestConfig,
  intensityDiscrim: intensityDiscrimConfig,
  toneInNoise: toneInNoiseConfig,
  amDetection: amDetectionConfig,
  itdDiscrim: itdDiscrimConfig,
  profileAnalysis: profileAnalysisConfig
};

// UI Elements for Selection
const experimentSelect = document.getElementById('experiment-select') as HTMLSelectElement;
const loadBtn = document.getElementById('load-experiment-btn') as HTMLButtonElement;
const selectionScreen = document.getElementById('selection-screen') as HTMLDivElement;
const experimentScreen = document.getElementById('experiment-screen') as HTMLDivElement;
const dropdownTrigger = document.getElementById('dropdown-trigger') as HTMLElement;
const dropdownOptions = document.getElementById('dropdown-options') as HTMLElement;
const selectedText = document.getElementById('selected-text') as HTMLElement;
const selectionDescription = document.getElementById('selection-description') as HTMLElement;
const customJsonGroup = document.getElementById('custom-json-group') as HTMLElement;
const customFileInput = document.getElementById('custom-file') as HTMLInputElement;

// Custom Dropdown Logic
dropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdownOptions.classList.toggle('hidden');
  dropdownTrigger.classList.toggle('active');
});

document.addEventListener('click', () => {
  dropdownOptions.classList.add('hidden');
  dropdownTrigger.classList.remove('active');
});

dropdownOptions.querySelectorAll('.option').forEach(option => {
  option.addEventListener('click', () => {
    const value = option.getAttribute('data-value') || '';
    const text = option.textContent || '';
    
    // Update hidden select
    experimentSelect.value = value;
    selectedText.textContent = text;
    
    // Update active state
    dropdownOptions.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    option.classList.add('selected');
    
    // Handle custom JSON visibility
    customJsonGroup.classList.toggle('hidden', value !== 'custom');
    
    // Show description if available
    const config = (examples as any)[value];
    if (config?.meta?.description) {
      selectionDescription.textContent = config.meta.description;
      selectionDescription.classList.remove('hidden');
    } else {
      selectionDescription.classList.add('hidden');
    }
  });
});

let customConfig: any = null;
customFileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      customConfig = JSON.parse(event.target?.result as string);
    } catch (err) {
      alert("Invalid JSON file");
    }
  };
  reader.readAsText(file);
});

// Initialize the runner on the main document
const runner = new ExperimentRunner(document.body);

// Initial UI update for default selection
const initialValue = experimentSelect.value;
const initialConfig = (examples as any)[initialValue];
if (initialConfig?.meta?.description) {
  selectionDescription.textContent = initialConfig.meta.description;
  selectionDescription.classList.remove('hidden');
}

document.body.addEventListener('experiment-cancelled', () => {
  selectionScreen.classList.remove('hidden');
  experimentScreen.classList.add('hidden');
});

loadBtn.addEventListener('click', async () => {
  let config = (examples as any)[experimentSelect.value];
  if (experimentSelect.value === 'custom') {
    config = customConfig;
  }
  
  if (!config) {
    alert("Please select an experiment.");
    return;
  }

  try {
    selectionScreen.classList.add('hidden');
    experimentScreen.classList.remove('hidden');
    
    // Load and start the experiment via the modular runner
    await runner.loadConfig(config);
  } catch (e: any) {
    alert("Error loading experiment: " + e.message);
  }
});

// Restart button
const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
restartBtn.addEventListener('click', () => {
  window.location.reload();
});

// Auto-resume AudioContext on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Note: The runner's internal engine handles its own resumption logic
  }
});
