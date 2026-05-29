const socket = io();

let currentChatId = null;
let selectedMessages = new Set();
let isSelectMode = false;

const chatList = document.getElementById('chat-list');
const chatBox = document.getElementById('chat-box');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const currentChatTitle = document.getElementById('current-chat-title');
const contextMenu = document.getElementById('context-menu');
const multiSelectBar = document.getElementById('multi-select-bar');
const selectCount = document.getElementById('select-count');
const cancelSelectBtn = document.getElementById('cancel-select-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const attachBtn = document.getElementById('attach-btn');
const attachMenu = document.getElementById('attach-menu');
const hiddenFileInput = document.getElementById('hidden-file-input');
let currentFileType = '';

// --- UTILITIES ---
function formatBytes(bytes) {
    if (!+bytes) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// (Theme logic was removed from here because base.html handles it globally now!)

// --- SIDEBAR & CHAT LOGIC ---
socket.on('load_sidebar', function(chats) {
    chatList.innerHTML = '';
    chats.forEach(chat => addChatToSidebar(chat.id, chat.name));
});

socket.on('chat_created', function(chat) {
    addChatToSidebar(chat.id, chat.name);
    selectChat(chat.id, chat.name);
});

socket.on('chat_renamed', function(data) {
    const chatEl = document.getElementById(`chat-${data.chat_id}`);
    if (chatEl && !chatEl.isContentEditable) chatEl.innerText = data.new_name;
    if (currentChatId === data.chat_id) currentChatTitle.innerText = data.new_name;
});

socket.on('chat_deleted', function(chat_id) {
    const chatEl = document.getElementById(`chat-${chat_id}`);
    if (chatEl) {
        chatEl.classList.add('deleting');
        setTimeout(() => chatEl.remove(), 400);
    }
    if (currentChatId === chat_id) {
        currentChatId = null;
        currentChatTitle.innerText = 'Select a chat';
        chatBox.innerHTML = '';
        msgInput.disabled = true;
        attachBtn.disabled = true;
    }
});

newChatBtn.addEventListener('click', () => socket.emit('create_chat'));

chatList.addEventListener('dblclick', (e) => {
    if (e.target === chatList) {
        socket.emit('create_chat');
    }
});

function addChatToSidebar(id, name) {
    const div = document.createElement('div');
    div.classList.add('chat-list-item');
    div.id = `chat-${id}`;
    div.innerText = name;
    
    div.onclick = (e) => {
        if (div.isContentEditable) return; 
        selectChat(id, div.innerText);
    };

    div.ondblclick = (e) => {
        e.stopPropagation(); 
        startInlineRename(div, id);
    };

    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, [
            { label: 'Rename', action: () => startInlineRename(div, id) },
            { label: 'Delete Thread', class: 'danger', action: () => socket.emit('delete_chat', id) }
        ]);
    };
    chatList.appendChild(div);
}

function startInlineRename(element, id) {
    const originalName = element.innerText;
    element.contentEditable = "true";
    element.focus();

    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function finishRename() {
        element.contentEditable = "false";
        const newName = element.innerText.trim();
        
        if (newName !== '' && newName !== originalName) {
            socket.emit('rename_chat', { chat_id: id, new_name: newName });
            if (currentChatId === id) currentChatTitle.innerText = newName;
        } else {
            element.innerText = originalName; 
        }
        
        element.removeEventListener('blur', finishRename);
        element.removeEventListener('keydown', handleKey);
    }

    function handleKey(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            element.blur();     
        } else if (e.key === 'Escape') {
            element.innerText = originalName; 
            element.blur();
        }
    }

    element.addEventListener('blur', finishRename);
    element.addEventListener('keydown', handleKey);
}

function selectChat(id, name) {
    if (isSelectMode) cancelSelectMode();
    currentChatId = id;
    currentChatTitle.innerText = name;
    msgInput.disabled = false;
    attachBtn.disabled = false;
    document.querySelectorAll('.chat-list-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`chat-${id}`).classList.add('active');
    socket.emit('request_chat_history', id);
}

// --- MESSAGING LOGIC ---
socket.on('load_history', async function(data) {
    if (data.chat_id === currentChatId) {
        chatBox.innerHTML = '';
        for (let msg of data.history) {
            if (msg.text) msg.text = await decryptText(msg.text);
            if (msg.file_name) msg.file_name = await decryptText(msg.file_name);
            displayMessage(msg);
        }
    }
});

socket.on('receive_message', async function(msg) {
    if (msg.chat_id === currentChatId) {
        if (msg.text) msg.text = await decryptText(msg.text);
        if (msg.file_name) msg.file_name = await decryptText(msg.file_name);
        displayMessage(msg);
    }
});

function displayMessage(msgData) {
    const id = msgData.id;
    const wrapper = document.createElement('div');
    wrapper.classList.add('message-wrapper');
    wrapper.id = `msg-${id}`;

    let content;
    
    if (msgData.file_url) {
        content = document.createElement('div');
        content.classList.add('file-block');
        
        const downloadUrl = msgData.file_url.replace('/upload/', '/upload/fl_attachment/');
        const iconMap = { 'image': '🖼️', 'pdf': '📄', 'video': '🎥', 'other': '📁' };
        const icon = iconMap[msgData.file_type] || '📁';
        
        const sizeText = msgData.file_size ? `(${formatBytes(msgData.file_size)})` : '';

        content.innerHTML = `
            <div class="file-content-default">
                <div class="file-logo">${icon}</div>
                <div class="file-info-area">
                    <div class="file-type-label">${msgData.file_type} File</div>
                    <div class="file-name-row">
                        ${msgData.file_name} 
                        <span class="file-size-label">${sizeText}</span>
                    </div>
                </div>
            </div>
            
            <div class="file-content-hover">
                <a href="${downloadUrl}" class="file-download-btn" onclick="event.stopPropagation();">
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </a>
                <div class="file-open-area" onclick="window.open('${msgData.file_url}', '_blank')">
                    Open File ↗
                </div>
            </div>
        `;
    } else {
        content = document.createElement('div');
        content.classList.add('message');
        content.innerText = msgData.text;
    }

    wrapper.appendChild(content);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;

    wrapper.onclick = (e) => {
        if (isSelectMode) { e.preventDefault(); toggleSelection(id, wrapper); }
    };

    wrapper.oncontextmenu = (e) => {
        e.preventDefault();
        if (isSelectMode) { toggleSelection(id, wrapper); return; }
        showContextMenu(e.pageX, e.pageY, [
            { label: msgData.file_url ? 'Copy Link' : 'Copy Text', action: () => copyText(msgData.file_url || msgData.text) },
            { label: 'Select', action: () => { isSelectMode = true; toggleSelection(id, wrapper); }},
            { label: 'Delete', class: 'danger', action: () => socket.emit('delete_messages', { chat_id: currentChatId, msg_ids: [id] }) }
        ]);
    };
}

// --- MULTI-SELECT LOGIC ---
function toggleSelection(id, element) {
    if (selectedMessages.has(id)) {
        selectedMessages.delete(id);
        element.classList.remove('selected');
    } else {
        selectedMessages.add(id);
        element.classList.add('selected');
    }
    
    if (selectedMessages.size > 0) {
        multiSelectBar.style.display = 'flex';
        selectCount.innerText = `${selectedMessages.size} Selected`;
    } else {
        cancelSelectMode();
    }
}

function cancelSelectMode() {
    isSelectMode = false;
    selectedMessages.clear();
    multiSelectBar.style.display = 'none';
    document.querySelectorAll('.message-wrapper').forEach(el => el.classList.remove('selected'));
}

cancelSelectBtn.onclick = cancelSelectMode;

deleteSelectedBtn.onclick = () => {
    if (selectedMessages.size > 0) {
        socket.emit('delete_messages', { chat_id: currentChatId, msg_ids: Array.from(selectedMessages) });
        cancelSelectMode();
    }
};

socket.on('messages_deleted', function(data) {
    if (data.chat_id === currentChatId) {
        data.msg_ids.forEach(id => {
            const el = document.getElementById(`msg-${id}`);
            if (el) {
                el.classList.add('deleting');
                setTimeout(() => el.remove(), 400);
            }
        });
    }
});

// --- SENDING LOGIC ---
async function sendMessage() {
    const text = msgInput.value.trim();
    if (text !== '' && currentChatId !== null) {
        const encryptedText = await encryptText(text); 
        socket.emit('send_message', { chat_id: currentChatId, text: encryptedText });
        msgInput.value = '';
    }
}

sendBtn.addEventListener('click', async () => await sendMessage());
msgInput.addEventListener('keypress', async (e) => { if (e.key === 'Enter') await sendMessage(); });

// --- ATTACHMENT UPLOAD LOGIC ---
attachBtn.addEventListener('click', () => {
    attachMenu.style.display = attachMenu.style.display === 'flex' ? 'none' : 'flex';
});

document.addEventListener('click', (e) => {
    if (!attachBtn.contains(e.target) && !attachMenu.contains(e.target)) {
        attachMenu.style.display = 'none';
    }
});

document.querySelectorAll('.attach-option').forEach(option => {
    option.addEventListener('click', () => {
        currentFileType = option.getAttribute('data-type');
        hiddenFileInput.setAttribute('accept', option.getAttribute('data-accept'));
        hiddenFileInput.click(); 
        attachMenu.style.display = 'none';
    });
});

hiddenFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || currentChatId === null) return;

    msgInput.placeholder = "Uploading securely...";
    msgInput.disabled = true;
    attachBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', currentFileType);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (data.url) {
            const encryptedFileName = await encryptText(data.name);
            
            socket.emit('send_message', { 
                chat_id: currentChatId, 
                file_url: data.url,
                file_name: encryptedFileName,
                file_type: data.type,       
                public_id: data.public_id,  
                cloudinary_resource_type: data.resource_type,
                file_size: data.size        
            });
        }
    } catch (error) {
        console.error("Upload failed", error);
        alert("Upload failed. Check the console.");
    } finally {
        hiddenFileInput.value = ''; 
        msgInput.placeholder = "Type a message...";
        msgInput.disabled = false;
        attachBtn.disabled = false;
        msgInput.focus();
    }
});
// --- SEND BUTTON ANIMATION ---
msgInput.addEventListener('input', () => {
    if (msgInput.value.trim() !== '') {
        sendBtn.classList.add('typing');
    } else {
        sendBtn.classList.remove('typing');
    }
});

// --- CONTEXT MENU & UTILITIES ---
function showContextMenu(x, y, options) {
    contextMenu.innerHTML = '';
    options.forEach(opt => {
        const item = document.createElement('div');
        item.classList.add('context-menu-item');
        if (opt.class) item.classList.add(opt.class);
        item.innerText = opt.label;
        item.onclick = () => { opt.action(); hideContextMenu(); };
        contextMenu.appendChild(item);
    });

    contextMenu.style.display = 'block';
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    contextMenu.style.left = (x + menuWidth > window.innerWidth ? x - menuWidth : x) + 'px';
    contextMenu.style.top = (y + menuHeight > window.innerHeight ? y - menuHeight : y) + 'px';
}

function hideContextMenu() { contextMenu.style.display = 'none'; }
document.addEventListener('click', hideContextMenu); 

async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
    }
}