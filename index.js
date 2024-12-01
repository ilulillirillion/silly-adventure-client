import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, generateQuietPrompt } from "../../../../script.js";

const extensionName = "response-refinement";

// Add debug logging
console.log('Response Refinement extension loading...');

// Include HTML content directly
const settingsHtml = `
<div class="response-refinement-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Response Refinement</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <!-- Refinement Steps Section -->
            <div class="refinement-section">
                <h3>Refinement Steps</h3>
                <div id="refinement_steps_list" class="list-container"></div>
                <div class="flex-container">
                    <input id="add_refinement_step" class="menu_button" type="submit" value="Add Refinement Step" />
                </div>
            </div>

            <hr class="sysHR" />

            <!-- Global Settings -->
            <div class="refinement-section">
                <div class="flex-container">
                    <input id="enable_refinement" type="checkbox" />
                    <label for="enable_refinement">Enable Response Refinement</label>
                </div>
            </div>
        </div>
    </div>
</div>

<template id="refinement_step_template">
    <div class="refinement-step-item">
        <div class="flex-container">
            <input type="checkbox" class="step-enabled" />
            <input type="text" class="step-label text_pole" placeholder="Step Label" />
            <div class="menu_button step-delete"><i class="fa-solid fa-trash"></i></div>
        </div>
        <div class="step-content">
            <textarea class="step-instructions text_pole wide" rows="4" placeholder="Enter instructions for this refinement step..."></textarea>
        </div>
    </div>
</template>
`;

// Default refinement steps
const defaultRefinementSteps = [
    {
        label: 'Cohesion Check',
        enabled: true,
        instructions: `Review the response to ensure it:
1. Is realistic within the story context
2. Aligns with likely actions of referenced characters
3. Adheres to any instructions in the previous user message
4. Maintains consistency with established facts`
    },
    {
        label: 'Improve Detail',
        enabled: true,
        instructions: `Enhance the response by:
1. Adding more vivid and descriptive detail
2. Expanding on important elements
3. Improving the level of descriptive horror and disgust where present
4. Maintaining all original elements while adding enhancements`
    }
];

const defaultSettings = {
    enabled: true,
    refinementSteps: defaultRefinementSteps
};

let extensionSettings = extension_settings[extensionName];

// Load or initialize settings
async function loadSettings() {
    console.log('Loading Response Refinement settings...');
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        console.log('Initializing default settings...');
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    extensionSettings = extension_settings[extensionName];
    console.log('Current settings:', extensionSettings);
    
    $("#enable_refinement").prop("checked", extensionSettings.enabled);
    
    // Populate refinement steps
    renderRefinementSteps();
}

function renderRefinementSteps() {
    console.log('Rendering refinement steps...');
    const container = $("#refinement_steps_list");
    container.empty();
    
    extensionSettings.refinementSteps.forEach((step, index) => {
        const template = document.querySelector("#refinement_step_template");
        if (!template) {
            console.error('Refinement step template not found');
            return;
        }
        const clone = document.importNode(template.content, true);
        
        const item = $(clone.querySelector(".refinement-step-item"));
        item.attr("data-index", index);
        
        item.find(".step-enabled").prop("checked", step.enabled);
        item.find(".step-label").val(step.label);
        item.find(".step-instructions").val(step.instructions);
        
        container.append(item);
    });
}

// Create status indicator
function createStatusIndicator() {
    console.log('Creating status indicator...');
    const indicator = $('<div id="refinement_status" style="display: none; position: fixed; bottom: 10px; right: 10px; background-color: var(--accent-color); color: var(--text-color); padding: 10px; border-radius: 5px; z-index: 1000;"></div>');
    $('body').append(indicator);
    return indicator;
}

async function refineResponse(response, context) {
    console.log('Starting response refinement...');
    console.log('Initial response:', response);
    
    if (!extensionSettings.enabled) {
        console.log('Refinement disabled, returning original response');
        return response;
    }
    
    const statusIndicator = $('#refinement_status');
    let currentResponse = response;
    let enabledSteps = extensionSettings.refinementSteps.filter(step => step.enabled);
    let stepCount = enabledSteps.length;
    let currentStep = 0;
    
    console.log(`Processing ${stepCount} enabled refinement steps...`);
    
    for (const step of enabledSteps) {
        currentStep++;
        console.log(`Processing step ${currentStep}/${stepCount}: ${step.label}`);
        statusIndicator.text(`Refining response: Step ${currentStep}/${stepCount} (${step.label})`).show();
        
        if (!step.instructions) {
            console.log('No instructions for this step, skipping');
            continue;
        }
        
        console.log('Step instructions:', step.instructions);
        
        // Create system message for refinement
        const systemMessage = `You are a response refinement agent. Your task is to refine the following response according to these instructions:\n\n${step.instructions}\n\nProvide your refined version of the response, or return the original if it already meets all requirements.`;
        
        try {
            console.log('Generating refined response...');
            // Generate refined response
            const refinedResponse = await generateQuietPrompt(
                systemMessage + '\n\nOriginal response:\n' + currentResponse
            );
            
            if (refinedResponse && refinedResponse.trim()) {
                console.log('Response refined successfully');
                currentResponse = refinedResponse.trim();
            } else {
                console.log('No changes needed for this step');
            }
        } catch (error) {
            console.error(`Error in refinement step ${step.label}:`, error);
            toastr.error(`Failed to refine response in step: ${step.label}`);
        }
    }
    
    statusIndicator.hide();
    if (currentResponse !== response) {
        console.log('Response was modified during refinement');
        toastr.success('Response has been refined');
    } else {
        console.log('Response remained unchanged after refinement');
    }
    
    return currentResponse;
}

// Event Handlers
function onEnableChange() {
    console.log('Enable/disable changed');
    extensionSettings.enabled = $("#enable_refinement").prop("checked");
    saveSettingsDebounced();
}

function onRefinementStepChange(event) {
    const step = $(event.target).closest(".refinement-step-item");
    const index = parseInt(step.attr("data-index"));
    
    console.log(`Refinement step ${index} changed`);
    
    extensionSettings.refinementSteps[index] = {
        enabled: step.find(".step-enabled").prop("checked"),
        label: step.find(".step-label").val(),
        instructions: step.find(".step-instructions").val()
    };
    
    saveSettingsDebounced();
}

function addNewRefinementStep() {
    console.log('Adding new refinement step');
    extensionSettings.refinementSteps.push({
        label: 'New Step',
        enabled: true,
        instructions: ''
    });
    
    renderRefinementSteps();
    saveSettingsDebounced();
}

function deleteRefinementStep(event) {
    const step = $(event.target).closest(".refinement-step-item");
    const index = parseInt(step.attr("data-index"));
    
    console.log(`Deleting refinement step ${index}`);
    
    extensionSettings.refinementSteps.splice(index, 1);
    
    renderRefinementSteps();
    saveSettingsDebounced();
}

// Initialize
jQuery(async () => {
    console.log('Initializing Response Refinement extension...');
    
    try {
        console.log('Adding settings HTML to UI...');
        $("#extensions_settings2").append(settingsHtml);
        
        // Wait for templates to be in DOM
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('Creating status indicator...');
        createStatusIndicator();
        
        console.log('Setting up event listeners...');
        // Event listeners
        $("#enable_refinement").on("change", onEnableChange);
        $("#add_refinement_step").on("click", addNewRefinementStep);
        
        $(document).on("change", ".refinement-step-item input, .refinement-step-item textarea", onRefinementStepChange);
        $(document).on("click", ".step-delete", deleteRefinementStep);
        
        console.log('Setting up message event handler...');
        // Hook into message events
        eventSource.on(event_types.MESSAGE_RECEIVED, async (data) => {
            console.log('Message received event triggered');
            if (!extensionSettings.enabled) {
                console.log('Extension disabled, skipping refinement');
                return;
            }
            
            console.log('Processing message for refinement...');
            const refinedResponse = await refineResponse(data.message);
            if (refinedResponse !== data.message) {
                console.log('Message was refined, updating...');
                data.message = refinedResponse;
            } else {
                console.log('No refinement needed');
            }
        });
        
        console.log('Loading settings...');
        await loadSettings();
        
        console.log('Showing setup message...');
        toastr.success('Response Refinement extension loaded! Configure settings in the Extensions tab.');
        
        console.log('Extension initialization complete');
    } catch (error) {
        console.error('Error initializing Response Refinement extension:', error);
        toastr.error('Failed to initialize Response Refinement extension');
    }
});
