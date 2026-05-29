const socket = io();

// --- STATE ---
let currentListId = 'today';
let allReminders = [];
let activeReminderId = null;
const deleteQueue = {}; 
let draggedReminderId = null; 

// --- DOM ELEMENTS ---
const nlpInput = document.getElementById('nlp-input');
const submitBtn = document.getElementById('submit-reminder-btn');
const reminderList = document.getElementById('reminder-list');
const customListsContainer = document.getElementById('custom-lists-container');
const currentViewTitle = document.getElementById('current-view-title');
const undoToast = document.getElementById('undo-toast');
const undoBtn = document.getElementById('undo-btn');

// Details Pane
const detailPane = document.getElementById('detail-pane');
const closeDetailBtn = document.getElementById('close-detail-btn');
const detailNotes = document.getElementById('detail-notes');
const detailDatePicker = document.getElementById('detail-date-picker');
const toggleCalBtn = document.getElementById('toggle-cal-btn');
const detailContent = document.getElementById('detail-content');
const miniCalContent = document.getElementById('mini-cal-content');
const miniCalGrid = document.getElementById('mini-cal-grid');

// --- INIT & SUBMISSION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    socket.emit('request_reminder_lists');
    selectFilter('today');

    // Visual NLP Highlighting
    nlpInput.addEventListener('input', () => {
        try {
            if (typeof chrono !== 'undefined' && chrono.parse(nlpInput.innerText).length > 0) {
                nlpInput.style.color = 'var(--primary)'; 
            } else {
                nlpInput.style.color = 'var(--foreground)';
            }
        } catch (e) { /* Ignore parsing errors mid-type */ }
    });

    // The shared submission function (Bulletproofed)
    async function handleReminderSubmit() {
        const text = nlpInput.innerText.trim();
        if (text === '') return;

        let parsedDate = null;
        let cleanText = text;

        // Try to parse the date, but don't crash if it fails
        try {
            if (typeof chrono !== 'undefined') {
                const parsed = chrono.parse(text);
                if (parsed.length > 0) {
                    parsedDate = parsed[0].start.date().toISOString();
                    cleanText = text.replace(parsed[0].text, '').trim(); 
                    if (cleanText === '') cleanText = text; // Fallback if they ONLY type a date
                }
            }
        } catch (err) {
            console.warn("NLP parsing skipped.", err);
        }

        const encText = await encryptText(cleanText);
        const targetListId = ['today', 'scheduled', 'flagged', 'all'].includes(currentListId) ? null : currentListId;

        socket.emit('add_reminder', {
            list_id: targetListId,
            text: encText,
            parsed_date: parsedDate
        });

        nlpInput.innerText = '';
        nlpInput.style.color = 'var(--foreground)';
        nlpInput.focus(); // Keep focus after clicking button
    }

    // Trigger on Enter Key
    nlpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Stop it from making a new line
            handleReminderSubmit();
        }
    });

    // FIX: Trigger on mousedown so it fires BEFORE the div loses focus!
    submitBtn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevents input from blurring
        handleReminderSubmit();
    });
});

// --- LIST & FILTER ROUTING ---
const contextMenu = document.getElementById('context-menu');

document.querySelectorAll('.filter-box').forEach(box => {
    box.addEventListener('click', () => selectFilter(box.dataset.filter));
});

function selectFilter(filterId) {
    currentListId = filterId;
    // Set title (handle 'all', 'scheduled', etc.)
    const titleText = document.querySelector(`.filter-box[data-filter="${filterId}"]`)?.innerText.replace(/[\u1000-\uFFFF⭐📅📁🚩]/g, '').trim() || filterId;
    currentViewTitle.innerText = titleText.charAt(0).toUpperCase() + titleText.slice(1);
    
    document.querySelectorAll('.filter-box').forEach(b => b.classList.remove('active'));
    document.querySelector(`.filter-box[data-filter="${filterId}"]`)?.classList.add('active');
    document.querySelectorAll('.custom-list-item').forEach(b => b.classList.remove('active'));
    socket.emit('request_reminders', filterId);
    closeDetails();
}

// 1. Initial Load
socket.on('load_reminder_lists', (lists) => {
    customListsContainer.innerHTML = '';
    lists.forEach(list => addReminderListToDOM(list));
});

// 2. Creation Logic (Triggered by + button or double-clicking empty space)
function triggerCreateList() {
    socket.emit('create_reminder_list', { name: 'New List' });
}
document.getElementById('new-r-list-btn').onclick = triggerCreateList;
customListsContainer.addEventListener('dblclick', (e) => {
    if (e.target === customListsContainer) triggerCreateList();
});

socket.on('reminder_list_created', (list) => {
    addReminderListToDOM(list);
    // Automatically select the new list and trigger inline rename!
    selectList(list.id, list.name);
    const newListEl = document.getElementById(`r-list-${list.id}`);
    if (newListEl) startInlineRename(newListEl, list.id);
});

// 3. Socket Responses for Rename/Delete
socket.on('reminder_list_renamed', (data) => {
    const listEl = document.getElementById(`r-list-${data.list_id}`);
    if (listEl && !listEl.isContentEditable) listEl.innerText = data.new_name;
    if (currentListId === data.list_id) currentViewTitle.innerText = data.new_name;
});

socket.on('reminder_list_deleted', (list_id) => {
    const listEl = document.getElementById(`r-list-${list_id}`);
    if (listEl) listEl.remove();
    if (currentListId === list_id) selectFilter('today'); // Kick user back to Today if they delete their active list
});

// 4. List Element Builder
function selectList(id, name) {
    currentListId = id;
    currentViewTitle.innerText = name;
    document.querySelectorAll('.filter-box').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.custom-list-item').forEach(b => b.classList.remove('active'));
    document.getElementById(`r-list-${id}`)?.classList.add('active');
    socket.emit('request_reminders', id);
    closeDetails();
}

function addReminderListToDOM(list) {
    const div = document.createElement('div');
    div.classList.add('custom-list-item');
    div.id = `r-list-${list.id}`;
    div.innerText = list.name;
    
    // Drag & Drop
    div.addEventListener('dragover', (e) => { e.preventDefault(); div.style.background = 'var(--hover-bg)'; });
    div.addEventListener('dragleave', () => div.style.background = 'transparent');
    div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.style.background = 'transparent';
        if (draggedReminderId) {
            socket.emit('update_reminder', { id: draggedReminderId, list_id: list.id });
            draggedReminderId = null;
            document.getElementById(`reminder-${draggedReminderId}`)?.remove();
        }
    });

    // Single Click: Open
    div.onclick = () => { if (!div.isContentEditable) selectList(list.id, div.innerText); };

    // Double Click: Rename
    div.ondblclick = (e) => {
        e.stopPropagation();
        startInlineRename(div, list.id);
    };

    // Right Click: Context Menu
    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, [
            { label: 'Rename List', action: () => startInlineRename(div, list.id) },
            { label: 'Delete List', class: 'danger', action: () => { if(confirm(`Delete "${div.innerText}" and all its tasks?`)) socket.emit('delete_reminder_list', list.id); } }
        ]);
    };

    customListsContainer.appendChild(div);
}

// 5. Inline Rename Logic
function startInlineRename(element, id) {
    const originalName = element.innerText;
    element.contentEditable = "true";
    element.focus();

    // Auto-highlight all text
    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    function finishRename() {
        element.contentEditable = "false";
        const newName = element.innerText.trim();
        
        if (newName !== '' && newName !== originalName) {
            socket.emit('rename_reminder_list', { list_id: id, new_name: newName });
            if (currentListId === id) currentViewTitle.innerText = newName;
        } else {
            element.innerText = originalName; 
        }
        element.removeEventListener('blur', finishRename);
        element.removeEventListener('keydown', handleKey);
    }

    function handleKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); element.blur(); } 
        else if (e.key === 'Escape') { element.innerText = originalName; element.blur(); }
    }

    element.addEventListener('blur', finishRename);
    element.addEventListener('keydown', handleKey);
}

// 6. Context Menu Logic
function showContextMenu(x, y, options) {
    if (!contextMenu) return;
    contextMenu.innerHTML = '';
    options.forEach(opt => {
        const item = document.createElement('div');
        item.classList.add('context-menu-item');
        if (opt.class) item.classList.add(opt.class);
        item.innerText = opt.label;
        item.onclick = () => { opt.action(); contextMenu.style.display = 'none'; };
        contextMenu.appendChild(item);
    });
    contextMenu.style.display = 'block';
    
    // Prevent menu from clipping off-screen
    const menuWidth = contextMenu.offsetWidth; 
    const menuHeight = contextMenu.offsetHeight;
    contextMenu.style.left = (x + menuWidth > window.innerWidth ? x - menuWidth : x) + 'px';
    contextMenu.style.top = (y + menuHeight > window.innerHeight ? y - menuHeight : y) + 'px';
}

// Close context menu when clicking anywhere else
document.addEventListener('click', () => { if(contextMenu) contextMenu.style.display = 'none'; });

// --- RENDERING REMINDERS ---
socket.on('load_reminders', async (data) => {
    for (let r of data.reminders) {
        r.text = await decryptText(r.text);
        r.notes = await decryptText(r.notes);
    }
    allReminders = data.reminders;
    renderReminders();
});

socket.on('reminder_added', async (r) => {
    r.text = await decryptText(r.text);
    r.notes = await decryptText(r.notes);
    allReminders.push(r);
    renderReminders();
});

socket.on('reminder_updated', async (data) => {
    const r = allReminders.find(x => x.id === data.id);
    if (r) {
        if (data.text) r.text = await decryptText(data.text);
        if (data.notes) r.notes = await decryptText(data.notes);
        if (data.completed !== undefined) r.completed = data.completed;
        if (data.flagged !== undefined) r.flagged = data.flagged;
        if (data.parsed_date !== undefined) r.parsed_date = data.parsed_date;
        renderReminders();
        if (activeReminderId === r.id) loadDetails(r); 
    }
});

socket.on('reminder_deleted', (data) => {
    allReminders = allReminders.filter(x => x.id !== data.id);
    renderReminders();
});

function renderReminders() {
    reminderList.innerHTML = '';
    
    let displayList = allReminders;
    const now = new Date();
    
    if (currentListId === 'today') {
        displayList = displayList.filter(r => r.parsed_date && new Date(r.parsed_date).toDateString() === now.toDateString());
        document.getElementById('badge-today').innerText = displayList.length;
    } else if (currentListId === 'flagged') {
        displayList = displayList.filter(r => r.flagged);
    } else if (currentListId === 'scheduled') {
        displayList = displayList.filter(r => r.parsed_date);
        displayList.sort((a,b) => new Date(a.parsed_date) - new Date(b.parsed_date));
    }

    displayList.forEach(r => {
        if (deleteQueue[r.id]) return; 

        const row = document.createElement('div');
        row.classList.add('reminder-row');
        row.id = `reminder-${r.id}`;
        if (r.completed) row.classList.add('completed');
        
        row.draggable = true;
        row.addEventListener('dragstart', () => { draggedReminderId = r.id; row.style.opacity = '0.5'; });
        row.addEventListener('dragend', () => row.style.opacity = '1');

        const check = document.createElement('div');
        check.classList.add('r-checkbox');
        if (r.completed) check.classList.add('checked');
        check.onclick = (e) => {
            e.stopPropagation();
            socket.emit('update_reminder', { id: r.id, completed: !r.completed });
        };

        const content = document.createElement('div');
        content.classList.add('r-content');
        
        const title = document.createElement('span');
        title.innerText = r.text;
        content.appendChild(title);

        if (r.parsed_date) {
            const tag = document.createElement('span');
            tag.classList.add('r-tag');
            const dDate = new Date(r.parsed_date);
            tag.innerText = dDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (dDate < new Date() && !r.completed) tag.classList.add('overdue');
            content.appendChild(tag);
        }

        const actions = document.createElement('div');
        actions.classList.add('r-actions');
        
        const flagBtn = document.createElement('button');
        flagBtn.innerText = r.flagged ? '🚩' : '⚐';
        flagBtn.style.color = r.flagged ? 'var(--primary)' : 'inherit';
        flagBtn.onclick = (e) => { e.stopPropagation(); socket.emit('update_reminder', { id: r.id, flagged: !r.flagged }); };
        
        const delBtn = document.createElement('button');
        delBtn.innerText = '🗑️';
        delBtn.classList.add('danger');
        delBtn.onclick = (e) => { e.stopPropagation(); triggerUndoDelete(r.id); };

        const dragHandle = document.createElement('button');
        dragHandle.innerText = '☰';
        dragHandle.style.cursor = 'grab';

        actions.appendChild(flagBtn);
        actions.appendChild(delBtn);
        actions.appendChild(dragHandle);

        row.appendChild(check);
        row.appendChild(content);
        row.appendChild(actions);

        // HERE IS WHERE THE THIRD PANE OPENS!
        row.onclick = () => {
            document.querySelectorAll('.reminder-row').forEach(x => x.classList.remove('selected'));
            row.classList.add('selected');
            loadDetails(r); // This function slides open the right pane
        };

        reminderList.appendChild(row);
    });
}

// --- 5-SECOND UNDO DELETION ---
let activeToastTimeout = null;

function triggerUndoDelete(id) {
    deleteQueue[id] = true;
    renderReminders();
    closeDetails();

    undoToast.classList.remove('hidden');
    undoBtn.onclick = () => {
        delete deleteQueue[id];
        clearTimeout(activeToastTimeout);
        undoToast.classList.add('hidden');
        renderReminders(); 
    };

    clearTimeout(activeToastTimeout);
    activeToastTimeout = setTimeout(() => {
        undoToast.classList.add('hidden');
        if (deleteQueue[id]) {
            socket.emit('delete_reminder', { id: id });
            delete deleteQueue[id];
        }
    }, 5000);
}

// --- DETAILS PANE (THIRD PANE UX) ---
function loadDetails(r) {
    activeReminderId = r.id;
    detailPane.classList.remove('closed'); // Slides the pane open!
    detailNotes.value = r.notes || '';
    if (r.parsed_date) {
        const d = new Date(r.parsed_date);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); 
        detailDatePicker.value = d.toISOString().slice(0,16);
    } else {
        detailDatePicker.value = '';
    }
}

function closeDetails() {
    activeReminderId = null;
    detailPane.classList.add('closed'); // Slides the pane shut
}
closeDetailBtn.onclick = closeDetails;

detailNotes.onblur = async () => {
    if (activeReminderId) {
        const encNotes = await encryptText(detailNotes.value.trim());
        socket.emit('update_reminder', { id: activeReminderId, notes: encNotes });
    }
};

detailDatePicker.onchange = () => {
    if (activeReminderId && detailDatePicker.value) {
        socket.emit('update_reminder', { id: activeReminderId, parsed_date: new Date(detailDatePicker.value).toISOString() });
    }
};

document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
        if (!activeReminderId) return;
        const d = new Date();
        d.setDate(d.getDate() + parseInt(chip.dataset.days));
        socket.emit('update_reminder', { id: activeReminderId, parsed_date: d.toISOString() });
    };
});

let calOpen = false;
toggleCalBtn.onclick = () => {
    calOpen = !calOpen;
    if (calOpen) {
        detailContent.style.display = 'none';
        miniCalContent.style.display = 'block';
        buildMiniCal();
    } else {
        detailContent.style.display = 'block';
        miniCalContent.style.display = 'none';
    }
};

function buildMiniCal() {
    miniCalGrid.innerHTML = '';
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        
        const box = document.createElement('div');
        box.classList.add('mini-cal-box');
        box.innerText = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
        
        box.addEventListener('dragover', (e) => { e.preventDefault(); box.style.background = 'var(--primary)'; box.style.color = 'var(--primary-fg)'; });
        box.addEventListener('dragleave', () => { box.style.background = 'var(--nav-bg)'; box.style.color = 'var(--foreground)'; });
        box.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedReminderId) {
                socket.emit('update_reminder', { id: draggedReminderId, parsed_date: d.toISOString() });
                draggedReminderId = null;
            }
            toggleCalBtn.click(); 
        });
        miniCalGrid.appendChild(box);
    }
}

// --- GLOBAL SHORTCUTS ---
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('cmd-palette').style.display = 'flex';
        document.getElementById('cmd-input').focus();
    }
    if (e.altKey && e.key === 'c') {
        e.preventDefault();
        openCheatSheet();
    }
    if (e.key === 'Escape') {
        document.getElementById('cmd-palette').style.display = 'none';
        document.getElementById('cheat-sheet-modal').style.display = 'none';
    }
});

document.getElementById('cmd-palette').onclick = (e) => { if (e.target.id === 'cmd-palette') e.target.style.display = 'none'; };
document.getElementById('cheat-sheet-modal').onclick = (e) => { if (e.target.id === 'cheat-sheet-modal') e.target.style.display = 'none'; };

function openCheatSheet() {
    const modal = document.getElementById('cheat-sheet-modal');
    const content = document.getElementById('cheat-sheet-content');
    content.innerHTML = '';
    
    let sorted = allReminders.filter(r => !r.completed);
    sorted.sort((a,b) => {
        if(!a.parsed_date) return 1;
        if(!b.parsed_date) return -1;
        return new Date(a.parsed_date) - new Date(b.parsed_date);
    });

    sorted.forEach(r => {
        const p = document.createElement('p');
        p.style.margin = "8px 0";
        p.style.fontSize = "1.1rem";
        const dStr = r.parsed_date ? new Date(r.parsed_date).toLocaleDateString() : 'No date';
        p.innerHTML = `<strong style="color:var(--primary)">[${dStr}]</strong> ${r.text}`;
        content.appendChild(p);
    });

    modal.style.display = 'flex';
}