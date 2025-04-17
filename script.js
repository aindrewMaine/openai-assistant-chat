// Elements
const setupPanel = document.getElementById('setupPanel');
const chatContainer = document.getElementById('chatContainer');
const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const assistantForm = document.getElementById('assistantForm');
const assistantStatus = document.getElementById('assistantStatus');
const newAssistantBtn = document.getElementById('newAssistantBtn');
const setupStatus = document.getElementById('setupStatus');
const createAssistantBtn = document.getElementById('createAssistantBtn');

// API Constants
const API_KEY = 'YOUR_OPENAI_API_KEY'; // Replace with your API key
const API_HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'OpenAI-Beta': 'assistants=v2'  // This header is required for the Assistants API
};

// State variables
let assistant_id = null;
let assistant_name = '';
let thread_id = null;
let uploadedFiles = [];

// Message handling
function appendMessage(role, content) {
    const message = document.createElement('div');
    message.className = `${role}-message`;
    
    if (role === 'system') {
        message.textContent = content;
    } else {
        message.innerHTML = content;
    }
    
    chatWindow.appendChild(message);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// UI Feedback Functions
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';
}

function showLoading(element, message) {
    element.innerHTML = `<span class="spinner"></span> ${message}`;
    element.className = 'status-message loading';
    element.style.display = 'block';
}

function hideStatus(element) {
    element.style.display = 'none';
}

function disableButton(button) {
    button.disabled = true;
    button.classList.add('disabled');
}

function enableButton(button) {
    button.disabled = false;
    button.classList.remove('disabled');
}

function handleAPIError(error, action) {
    console.error(`Error ${action}:`, error);
    
    // Log the complete error for debugging
    console.log('Full error object:', JSON.stringify(error));
    
    let errorMessage = 'An error occurred. Please try again.';
    
    if (error.error && error.error.message) {
        errorMessage = `Error: ${error.error.message}`;
    }
    
    if (setupPanel.style.display !== 'none') {
        showStatus(setupStatus, errorMessage, 'error');
        enableButton(createAssistantBtn);
    } else {
        appendMessage('system', errorMessage);
    }
    
    return null;
}

// File handling
async function uploadFile(file) {
    // Create file item placeholder
    const fileItemPlaceholder = document.createElement('div');
    fileItemPlaceholder.className = 'file-item';
    fileItemPlaceholder.innerHTML = `
        <span>${file.name}</span>
        <span><span class="spinner"></span> Uploading...</span>
    `;
    fileList.appendChild(fileItemPlaceholder);
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', 'assistants');

        const uploadRes = await fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'OpenAI-Beta': 'assistants=v2'
            },
            body: formData
        });

        if (!uploadRes.ok) {
            const errorData = await uploadRes.json();
            // Remove placeholder on error
            fileList.removeChild(fileItemPlaceholder);
            throw errorData;
        }

        const fileData = await uploadRes.json();
        appendMessage('system', `Uploaded file: ${file.name}`);
        
        // Add to uploaded files
        uploadedFiles.push({
            id: fileData.id,
            name: file.name
        });
        
        // Remove placeholder
        fileList.removeChild(fileItemPlaceholder);
        updateFileList();
        
        return fileData.id;
    } catch (error) {
        return handleAPIError(error, 'uploading file');
    }
}

function updateFileList() {
    fileList.innerHTML = '';
    
    if (uploadedFiles.length === 0) {
        return;
    }
    
    uploadedFiles.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <span>${file.name}</span>
            <span class="file-id">${file.id}</span>
        `;
        fileList.appendChild(fileItem);
    });
}

// Assistant creation
async function createAssistant(name, model, instructions, tools) {
    try {
        // Fix issue 1: Make sure model is a valid OpenAI model
        if (!model) {
            model = "gpt-4"; // Fallback to GPT-4
        }
        
        // Create minimal payload to reduce possible issues
        const payload = {
            model: model,
            name: name || "Assistant",
            instructions: instructions || "You are a helpful assistant"
        };
        
        // Fix issue 2: Only add tools if they are specified
        if (tools && tools.length > 0) {
            payload.tools = tools;
        }
        
        // Fix issue 3: Only add file_ids if there are files
        if (uploadedFiles && uploadedFiles.length > 0) {
            payload.file_ids = uploadedFiles.map(file => file.id);
        }
        
        console.log('Creating assistant with payload:', JSON.stringify(payload));
        
        const response = await fetch('https://api.openai.com/v1/assistants', {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(payload)
        });
        
        // Get the complete response text for debugging
        const responseText = await response.text();
        console.log('Raw API response:', responseText);
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (e) {
                errorData = { error: { message: `Invalid response: ${responseText}` } };
            }
            throw errorData;
        }
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            throw { error: { message: "Failed to parse response from OpenAI" } };
        }
        
        return data;
    } catch (error) {
        return handleAPIError(error, 'creating assistant');
    }
}

// Thread handling
async function createThread() {
    try {
        const response = await fetch('https://api.openai.com/v1/threads', {
            method: 'POST',
            headers: API_HEADERS
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw errorData;
        }
        
        const data = await response.json();
        return data.id;
    } catch (error) {
        return handleAPIError(error, 'creating thread');
    }
}

async function addMessage(threadId, content, fileIds = []) {
    try {
        const payload = {
            role: 'user',
            content: content
        };
        
        if (fileIds.length > 0) {
            payload.file_ids = fileIds;
        }
        
        const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw errorData;
        }
        
        return true;
    } catch (error) {
        return handleAPIError(error, 'adding message');
    }
}

async function runAssistant(threadId, assistantId) {
    try {
        const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: 'POST',
            headers: API_HEADERS,
            body: JSON.stringify({
                assistant_id: assistantId
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw errorData;
        }
        
        const data = await response.json();
        return data.id;
    } catch (error) {
        return handleAPIError(error, 'running assistant');
    }
}

async function checkRunStatus(threadId, runId) {
    try {
        let delay = 1000;
        const maxDelay = 3000;
        
        while (true) {
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 1.5, maxDelay);
            
            const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
                method: 'GET',
                headers: API_HEADERS
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw errorData;
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return 'completed';
            } else if (data.status === 'failed' || data.status === 'cancelled' || data.status === 'expired') {
                appendMessage('system', `Run ${data.status}: ${data.last_error?.message || 'Unknown error'}`);
                return data.status;
            }
            
            // Still in progress
        }
    } catch (error) {
        return handleAPIError(error, 'checking run status');
    }
}

async function getLatestMessage(threadId) {
    try {
        const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'GET',
            headers: API_HEADERS
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw errorData;
        }
        
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const lastMessage = data.data[0];
            
            // Process message content
            let formattedContent = '';
            
            for (const contentItem of lastMessage.content) {
                if (contentItem.type === 'text') {
                    formattedContent += contentItem.text.value;
                } else if (contentItem.type === 'image_file') {
                    formattedContent += `[Image: ${contentItem.image_file.file_id}]`;
                }
            }
            
            return formattedContent;
        }
        
        return null;
    } catch (error) {
        return handleAPIError(error, 'getting messages');
    }
}

// Event Listeners
assistantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Disable button and show loading status
    disableButton(createAssistantBtn);
    showLoading(setupStatus, 'Creating your assistant...');
    
    const name = document.getElementById('assistantName').value;
    const model = document.getElementById('modelSelect').value;
    const instructions = document.getElementById('assistantInstructions').value;
    
    const tools = [];
    if (document.getElementById('codeInterpreter').checked) {
        tools.push({ type: 'code_interpreter' });
    }
    if (document.getElementById('fileSearch').checked) {
        tools.push({ type: 'retrieval' });  // Changed from 'file_search' to 'retrieval'
    }
    
    const assistant = await createAssistant(name, model, instructions, tools);
    
    if (assistant) {
        assistant_id = assistant.id;
        assistant_name = assistant.name;
        
        // Update status
        showLoading(setupStatus, 'Assistant created! Setting up conversation thread...');
        
        // Create a thread
        thread_id = await createThread();
        
        if (thread_id) {
            showStatus(setupStatus, 'Success! Redirecting to chat...', 'success');
            
            // Wait 1.5 seconds to show success message before switching screens
            setTimeout(() => {
                setupPanel.style.display = 'none';
                chatContainer.style.display = 'block';
                assistantStatus.textContent = `Active Assistant: ${assistant_name}`;
                
                appendMessage('system', `Assistant "${assistant_name}" created and ready!`);
                appendMessage('system', 'You can now start chatting and uploading files.');
                
                // Reset status
                enableButton(createAssistantBtn);
                hideStatus(setupStatus);
            }, 1500);
        } else {
            // Thread creation failed
            enableButton(createAssistantBtn);
            showStatus(setupStatus, 'Failed to create conversation thread. Please try again.', 'error');
        }
    } else {
        // Assistant creation failed - handleAPIError already displays the error
        enableButton(createAssistantBtn);
    }
});

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!assistant_id || !thread_id) {
        appendMessage('system', 'Please create an assistant first.');
        return;
    }
    
    const input = userInput.value.trim();
    if (!input) return;
    
    // Disable the input and button while processing
    userInput.disabled = true;
    const submitBtn = chatForm.querySelector('button');
    disableButton(submitBtn);
    
    appendMessage('user', input);
    userInput.value = '';
    
    // Add message to thread
    const messageAdded = await addMessage(thread_id, input);
    if (!messageAdded) {
        userInput.disabled = false;
        enableButton(submitBtn);
        return;
    }
    
    // Run the assistant
    appendMessage('system', '<span class="spinner"></span> Assistant is thinking...');
    const thinkingMsg = chatWindow.lastChild;
    
    const runId = await runAssistant(thread_id, assistant_id);
    if (!runId) {
        chatWindow.removeChild(thinkingMsg);
        userInput.disabled = false;
        enableButton(submitBtn);
        return;
    }
    
    // Check run status
    const status = await checkRunStatus(thread_id, runId);
    
    // Remove the "thinking" message
    chatWindow.removeChild(thinkingMsg);
    
    if (status !== 'completed') {
        userInput.disabled = false;
        enableButton(submitBtn);
        return;
    }
    
    // Get the latest message
    const latestMessage = await getLatestMessage(thread_id);
    if (latestMessage) {
        appendMessage('assistant', latestMessage);
    }
    
    // Re-enable the input and button
    userInput.disabled = false;
    enableButton(submitBtn);
    userInput.focus();
});

fileInput.addEventListener('change', async () => {
    const files = fileInput.files;
    if (files.length === 0) return;
    
    appendMessage('system', 'Uploading file(s)...');
    const uploadMsg = chatWindow.lastChild;
    
    let successCount = 0;
    
    for (const file of files) {
        const fileId = await uploadFile(file);
        if (fileId) successCount++;
    }
    
    // Update the upload message
    if (successCount > 0) {
        uploadMsg.textContent = `Successfully uploaded ${successCount} file(s).`;
    } else {
        uploadMsg.textContent = 'Failed to upload files.';
    }
    
    // Clear the file input
    fileInput.value = '';
});

newAssistantBtn.addEventListener('click', () => {
    // Reset state
    assistant_id = null;
    assistant_name = '';
    thread_id = null;
    uploadedFiles = [];
    
    // Clear UI
    fileList.innerHTML = '';
    chatWindow.innerHTML = '';
    
    // Reset and show setup panel
    document.getElementById('assistantName').value = '';
    document.getElementById('assistantInstructions').value = '';
    enableButton(createAssistantBtn);
    hideStatus(setupStatus);
    
    // Show setup panel
    chatContainer.style.display = 'none';
    setupPanel.style.display = 'block';
    
    // Provide feedback
    appendMessage('system', 'Starting over with a new assistant.');
});

// Add tooltips to buttons
document.querySelectorAll('button').forEach(button => {
    button.title = button.textContent.trim();
});

// Add tooltip to file input label
document.querySelector('.file-label').title = 'Upload files to use with your assistant';

// Initialize
hideStatus(setupStatus);