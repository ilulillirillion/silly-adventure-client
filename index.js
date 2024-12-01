import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, generateQuietPrompt } from "../../../../script.js";

const extensionName = "response-refinement";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// Add debug logging
console.log('Response Refinement extension loading...');
console.log('Extension path:', extensionFolderPath);

// Default instruction blocks and steps remain the same...
const defaultInstructionBlocks = {
    'review_response': {
        label: 'Review Response',
        content: 'Review the previous response against these instructions and return either a modified version that is compliant or return the initial response if already compliant.',
        enabled: true
    },
    'enhance_response': {
        label: 'Enhance Response',
        content: 'Enhance the initial response while maintaining all original elements, incorporating the requested additions and enhancements.',
        enabled: true
    },
    'ensure_coherency': {
        label: 'Ensure Coherency',
        content: 'Review the response to ensure it is realistic within the story context and aligns with likely actions of referenced characters or entities.',
        enabled: true
    },
    'ensure_compliance': {
        label: 'Ensure Compliance',
        content: 'Adhere to any instructions provided in the immediately previous user response.',
        enabled: true
    },
    'ensure_user_autonomy': {
        label: 'Ensure User Autonomy',
        content: 'Do not alter or dictate the user character\'s behavior in any way.',
        enabled: false
    },
    'enhance_detail': {
        label: 'Enhance Detail',
        content: 'Provide more vivid and descriptive detail throughout the response.',
        enabled: true
    },
    'enhance_disgust': {
        label: 'Enhance Disgust',
        content: 'Enhance disgusting content to a more revolting level of descriptive detail and horror.',
        enabled: true
    }
};

const defaultRefinementSteps = {
    'cohesion_check': {
        label: 'Cohesion Check',
        enabled: true,
        instructions: [
            { id: 'review_response', enabled: true },
            { id: 'ensure_coherency', enabled: true },
            { id: 'ensure_compliance', enabled: true },
            { id: 'ensure_user_autonomy', enabled: false }
        ]
    },
    'improve_detail': {
        label: 'Improve Detail',
        enabled: true,
        instructions: [
            { id: 'enhance_response', enabled: true },
            { id: 'enhance_detail', enabled: true },
            { id: 'enhance_disgust', enabled: true }
        ]
    }
};

const defaultSettings = {
    enabled: true,
    instructionBlocks: defaultInstructionBlocks,
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
    
    // Populate instruction blocks
    renderInstructionBlocks();
    
    // Populate refinement steps
    renderRefinementSteps();
}

function renderInstructionBlocks() {
    console.log('Rendering instruction blocks...');
    const container = $("#instruction_blocks_list");
    container.empty();
    
    Object.entries(extensionSettings.instructionBlocks).forEach(([id, block]) => {
        const template = document.querySelector("#instruction_block_template");
        const clone = document.importNode(template.content, true);
        
        const item = $(clone.querySelector(".instruction-block-item"));
        item.attr("data-id", id);
        
        item.find(".instruction-enabled").prop("checked", block.enabled);
        item.find(".instruction-label").val(block.label);
        item.find(".instruction-content").val(block.content);
        
        container.append(item);
    });
}

function renderRefinementSteps() {
    console.log('Rendering refinement steps...');
    const container = $("#refinement_steps_list");
    container.empty();
    
    Object.entries(extensionSettings.refinementSteps).forEach(([id, step]) => {
        const template = document.querySelector("#refinement_step_template");
        const clone = document.importNode(template.content, true);
        
        const item = $(clone.querySelector(".refinement-step-item"));
        item.attr("data-id", id);
        
        item.find(".step-enabled").prop("checked", step.enabled);
        item.find(".step-label").val(step.label);
        
        const instructionList = item.find(".step-instruction-list");
        step.instructions.forEach(instruction => {
            const block = extensionSettings.instructionBlocks[instruction.id];
            if (block) {
                const instructionItem = $('<div class="step-instruction-item"></div>');
                instructionItem.attr("data-instruction-id", instruction.id);
                
                const checkbox = $('<input type="checkbox" class="instruction-enabled">');
                checkbox.prop("checked", instruction.enabled);
                
                const label = $('<span class="instruction-label"></span>').text(block.label);
                
                instructionItem.append(checkbox, label);
                instructionList.append(instructionItem);
            }
        });
        
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
    let stepCount = Object.values(extensionSettings.refinementSteps).filter(step => step.enabled).length;
    let currentStep = 0;
    
    console.log(`Processing ${stepCount} enabled refinement steps...`);
    
    for (const [stepId, step] of Object.entries(extensionSettings.refinementSteps)) {
        if (!step.enabled) {
            console.log(`Skipping disabled step: ${step.label}`);
            continue;
        }
        
        currentStep++;
        console.log(`Processing step ${currentStep}/${stepCount}: ${step.label}`);
        statusIndicator.text(`Refining response: Step ${currentStep}/${stepCount} (${step.label})`).show();
        
        // Combine enabled instructions for this step
        const instructions = step.instructions
            .filter(inst => inst.enabled && extensionSettings.instructionBlocks[inst.id]?.enabled)
            .map(inst => extensionSettings.instructionBlocks[inst.id].content)
            .join('\n\n');
            
        if (!instructions) {
            console.log('No enabled instructions for this step, skipping');
            continue;
        }
        
        console.log('Combined instructions:', instructions);
        
        // Create system message for refinement
        const systemMessage = `You are a response refinement agent. Your task is to refine the following response according to these instructions:\n\n${instructions}\n\nProvide your refined version of the response, or return the original if it already meets all requirements.`;
        
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

function onInstructionBlockChange(event) {
    const block = $(event.target).closest(".instruction-block-item");
    const id = block.attr("data-id");
    
    console.log(`Instruction block ${id} changed`);
    
    extensionSettings.instructionBlocks[id] = {
        enabled: block.find(".instruction-enabled").prop("checked"),
        label: block.find(".instruction-label").val(),
        content: block.find(".instruction-content").val()
    };
    
    saveSettingsDebounced();
}

function onRefinementStepChange(event) {
    const step = $(event.target).closest(".refinement-step-item");
    const id = step.attr("data-id");
    
    console.log(`Refinement step ${id} changed`);
    
    const instructions = [];
    step.find(".step-instruction-item").each(function() {
        instructions.push({
            id: $(this).attr("data-instruction-id"),
            enabled: $(this).find(".instruction-enabled").prop("checked")
        });
    });
    
    extensionSettings.refinementSteps[id] = {
        enabled: step.find(".step-enabled").prop("checked"),
        label: step.find(".step-label").val(),
        instructions: instructions
    };
    
    saveSettingsDebounced();
}

function addNewInstructionBlock() {
    console.log('Adding new instruction block');
    const id = 'custom_' + Date.now();
    extensionSettings.instructionBlocks[id] = {
        label: 'New Instruction Block',
        content: '',
        enabled: true
    };
    
    renderInstructionBlocks();
    saveSettingsDebounced();
}

function addNewRefinementStep() {
    console.log('Adding new refinement step');
    const id = 'custom_' + Date.now();
    extensionSettings.refinementSteps[id] = {
        label: 'New Step',
        enabled: true,
        instructions: []
    };
    
    renderRefinementSteps();
    saveSettingsDebounced();
}

function deleteInstructionBlock(event) {
    const block = $(event.target).closest(".instruction-block-item");
    const id = block.attr("data-id");
    
    console.log(`Deleting instruction block ${id}`);
    
    delete extensionSettings.instructionBlocks[id];
    
    // Remove this instruction from any steps using it
    Object.values(extensionSettings.refinementSteps).forEach(step => {
        step.instructions = step.instructions.filter(inst => inst.id !== id);
    });
    
    renderInstructionBlocks();
    renderRefinementSteps();
    saveSettingsDebounced();
}

function deleteRefinementStep(event) {
    const step = $(event.target).closest(".refinement-step-item");
    const id = step.attr("data-id");
    
    console.log(`Deleting refinement step ${id}`);
    
    delete extensionSettings.refinementSteps[id];
    
    renderRefinementSteps();
    saveSettingsDebounced();
}

function addInstructionToStep(event) {
    const step = $(event.target).closest(".refinement-step-item");
    const stepId = step.attr("data-id");
    
    console.log(`Adding instruction to step ${stepId}`);
    
    // Create dropdown with available instruction blocks
    const select = $('<select></select>');
    Object.entries(extensionSettings.instructionBlocks).forEach(([id, block]) => {
        if (!extensionSettings.refinementSteps[stepId].instructions.some(i => i.id === id)) {
            select.append($('<option></option>').attr('value', id).text(block.label));
        }
    });
    
    if (select.children().length === 0) {
        toastr.info('No more instruction blocks available to add');
        return;
    }
    
    // Show popup for selection
    const popup = $('<div class="popup"></div>')
        .append('<h4>Select Instruction Block</h4>')
        .append(select)
        .append(
            $('<div class="flex-container"></div>')
                .append($('<div class="menu_button">Add</div>').on('click', () => {
                    const selectedId = select.val();
                    extensionSettings.refinementSteps[stepId].instructions.push({
                        id: selectedId,
                        enabled: true
                    });
                    renderRefinementSteps();
                    saveSettingsDebounced();
                    popup.remove();
                }))
                .append($('<div class="menu_button">Cancel</div>').on('click', () => {
                    popup.remove();
                }))
        );
    
    $('body').append(popup);
    popup.css({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'var(--background-color)',
        padding: '20px',
        borderRadius: '5px',
        zIndex: 1000
    });
}

// Initialize
jQuery(async () => {
    console.log('Initializing Response Refinement extension...');
    
    try {
        console.log('Loading settings HTML...');
        const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
        console.log('Settings HTML loaded, appending to UI...');
        $("#extensions_settings2").append(settingsHtml);
        
        console.log('Creating status indicator...');
        createStatusIndicator();
        
        console.log('Setting up event listeners...');
        // Event listeners
        $("#enable_refinement").on("change", onEnableChange);
        $("#add_instruction_block").on("click", addNewInstructionBlock);
        $("#add_refinement_step").on("click", addNewRefinementStep);
        
        $(document).on("change", ".instruction-block-item input, .instruction-block-item textarea", onInstructionBlockChange);
        $(document).on("change", ".refinement-step-item input", onRefinementStepChange);
        $(document).on("click", ".instruction-delete", deleteInstructionBlock);
        $(document).on("click", ".step-delete", deleteRefinementStep);
        $(document).on("click", ".add-step-instruction", addInstructionToStep);
        
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
