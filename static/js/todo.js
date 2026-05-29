const socket = io();

// Remove old theme logic from here - it's handled safely in base.html now.

let currentListId = null;
let allTasks = []; 

const todoSidebarList = document.getElementById('todo-sidebar-list');
const newListBtn = document.getElementById('new-todo-list-btn');
const currentListTitle = document.getElementById('current-list-title');
const todoTree = document.getElementById('todo-tree');
const mainAddBox = document.getElementById('main-add-box');
const inputTemplate = document.getElementById('task-input-template');
const progressContainer = document.getElementById('todo-progress-container');
const progressText = document.getElementById('todo-progress-text');
const progressBar = document.getElementById('todo-progress-bar');
const contextMenu = document.getElementById('context-menu');

// --- SIDEBAR LOGIC ---
socket.on('load_todo_sidebar', function(lists) {
    todoSidebarList.innerHTML = '';
    lists.forEach(list => addListToSidebar(list.id, list.name));
});

socket.on('todo_list_created', function(list) {
    addListToSidebar(list.id, list.name);
    selectList(list.id, list.name);
});

socket.on('todo_list_renamed', function(data) {
    const listEl = document.getElementById(`list-${data.list_id}`);
    if (listEl && !listEl.isContentEditable) listEl.innerText = data.new_name;
    if (currentListId === data.list_id) currentListTitle.innerText = data.new_name;
});

socket.on('todo_list_deleted', function(list_id) {
    const listEl = document.getElementById(`list-${list_id}`);
    if (listEl) {
        listEl.classList.add('deleting');
        setTimeout(() => listEl.remove(), 400);
    }
    if (currentListId === list_id) {
        currentListId = null;
        currentListTitle.innerText = 'Select a list';
        todoTree.innerHTML = '';
        mainAddBox.style.display = 'none';
        progressContainer.style.display = 'none';
    }
});

// Double click blank space to create list
todoSidebarList.addEventListener('dblclick', (e) => {
    if (e.target === todoSidebarList) socket.emit('create_todo_list');
});
newListBtn.addEventListener('click', () => socket.emit('create_todo_list'));

function addListToSidebar(id, name) {
    const div = document.createElement('div');
    div.classList.add('chat-list-item');
    div.id = `list-${id}`;
    div.innerText = name;
    
    div.onclick = () => { if (!div.isContentEditable) selectList(id, div.innerText); };
    div.ondblclick = (e) => { e.stopPropagation(); startInlineRename(div, id, 'rename_todo_list'); };
    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, [
            { label: 'Rename', action: () => startInlineRename(div, id, 'rename_todo_list') },
            { label: 'Delete List', class: 'danger', action: () => { if(confirm("Delete list?")) socket.emit('delete_todo_list', id); } }
        ]);
    };
    todoSidebarList.appendChild(div);
}

function selectList(id, name) {
    currentListId = id;
    currentListTitle.innerText = name;
    mainAddBox.style.display = 'block';
    progressContainer.style.display = 'flex';
    document.querySelectorAll('.chat-list-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`list-${id}`).classList.add('active');
    socket.emit('request_todos', id);
}

// --- TASK LOGIC ---
socket.on('load_todos', async function(data) {
    if (data.list_id === currentListId) {
        for (let t of data.todos) {
            t.text = await decryptText(t.text);
            t.description = await decryptText(t.description);
        }
        allTasks = data.todos;
        renderTree();
    }
});

socket.on('todo_added', async function(task) {
    if (task.list_id === currentListId) {
        task.text = await decryptText(task.text);
        task.description = await decryptText(task.description);
        allTasks.push(task);
        renderTree();
    }
});

socket.on('todo_updated', async function(data) {
    if (data.list_id === currentListId) {
        const task = allTasks.find(t => t.id === data.id);
        if (task) {
            if (data.text !== undefined) task.text = await decryptText(data.text);
            if (data.description !== undefined) task.description = await decryptText(data.description);
            if (data.completed !== undefined) task.completed = data.completed;
            renderTree(); 
        }
    }
});

socket.on('todos_deleted', function(data) {
    if (data.list_id === currentListId) {
        allTasks = allTasks.filter(t => !data.todo_ids.includes(t.id));
        renderTree();
    }
});

// --- RENDER TREE ---
function renderTree() {
    todoTree.innerHTML = '';
    updateProgress();
    const tree = [];
    const lookup = {};
    allTasks.forEach(t => { t.children = []; lookup[t.id] = t; });
    allTasks.forEach(t => {
        if (t.parent_id && lookup[t.parent_id]) lookup[t.parent_id].children.push(t);
        else tree.push(t);
    });
    tree.forEach(rootTask => todoTree.appendChild(createTaskDOM(rootTask)));
}

function updateProgress() {
    if (allTasks.length === 0) {
        progressText.innerText = '0/0'; progressBar.style.width = '0%'; return;
    }
    const completed = allTasks.filter(t => t.completed).length;
    progressText.innerText = `${completed}/${allTasks.length}`;
    progressBar.style.width = `${(completed / allTasks.length) * 100}%`;
}

function createTaskDOM(task) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('task-wrapper');
    wrapper.id = `wrapper-${task.id}`;

    const row = document.createElement('div');
    row.classList.add('task-row');
    if (task.completed) row.classList.add('completed');

    const checkbox = document.createElement('div');
    checkbox.classList.add('task-checkbox');
    if (task.completed) checkbox.classList.add('checked');
    checkbox.onclick = () => socket.emit('update_todo', { list_id: currentListId, id: task.id, completed: !task.completed });

    const content = document.createElement('div');
    content.classList.add('task-content');
    
    const title = document.createElement('span');
    title.classList.add('task-title');
    title.innerText = task.text;
    content.appendChild(title);

    if (task.description && task.description !== '') {
        const descIcon = document.createElement('span');
        descIcon.classList.add('task-desc-icon');
        descIcon.innerText = '☰';
        const tooltip = document.createElement('div');
        tooltip.classList.add('task-desc-tooltip');
        tooltip.innerText = task.description;
        content.appendChild(descIcon);
        content.appendChild(tooltip);
    }

    const actions = document.createElement('div');
    actions.classList.add('task-actions');
    
    if (task.level < 2) { 
        const addSubBtn = document.createElement('button');
        addSubBtn.classList.add('task-icon-btn');
        addSubBtn.innerText = '+';
        addSubBtn.onclick = () => showInputForm(wrapper, task.id, task.level + 1);
        actions.appendChild(addSubBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.classList.add('task-icon-btn');
    editBtn.innerText = '✏️';
    editBtn.onclick = () => showInputForm(wrapper, task.parent_id, task.level, task);
    actions.appendChild(editBtn);
    
    const delBtn = document.createElement('button');
    delBtn.classList.add('task-icon-btn', 'danger');
    delBtn.innerText = '🗑️';
    delBtn.onclick = () => { if(confirm("Delete task?")) socket.emit('delete_todo', { list_id: currentListId, todo_id: task.id }); };
    actions.appendChild(delBtn);

    row.appendChild(checkbox);
    row.appendChild(content);
    row.appendChild(actions);
    wrapper.appendChild(row);

    if (task.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.classList.add('task-children');
        task.children.forEach(child => childrenContainer.appendChild(createTaskDOM(child)));
        wrapper.appendChild(childrenContainer);
    }

    return wrapper;
}

// --- DYNAMIC INPUT FORM LOGIC ---
let activeForm = null;

mainAddBox.onclick = () => {
    mainAddBox.style.display = 'none';
    showInputForm(todoTree, null, 0, null, true);
};

function showInputForm(parentContainer, parentId, level, editingTask = null, isMain = false) {
    if (activeForm) activeForm.remove(); 

    const clone = inputTemplate.content.cloneNode(true);
    const formContainer = clone.querySelector('.task-input-form');
    const titleInput = clone.querySelector('.task-title-input');
    const descInput = clone.querySelector('.task-desc-input');
    const saveBtn = clone.querySelector('.save-task-btn');
    const cancelBtn = clone.querySelector('.cancel-task-btn');

    if (editingTask) {
        titleInput.value = editingTask.text;
        descInput.value = editingTask.description || '';
    }

    parentContainer.appendChild(formContainer);
    titleInput.focus();
    activeForm = formContainer;

    const closeForm = () => {
        formContainer.remove();
        activeForm = null;
        if (isMain) mainAddBox.style.display = 'block';
    };

    cancelBtn.onclick = closeForm;

    const submitTask = async () => {
        const text = titleInput.value.trim();
        const desc = descInput.value.trim();
        if (text === '') { titleInput.focus(); return; }

        const encText = await encryptText(text);
        const encDesc = await encryptText(desc);

        if (editingTask) {
            socket.emit('update_todo', { list_id: currentListId, id: editingTask.id, text: encText, description: encDesc });
        } else {
            socket.emit('add_todo', { list_id: currentListId, parent_id: parentId, level: level, text: encText, description: encDesc });
        }
        closeForm();
    };

    saveBtn.onclick = submitTask;
    titleInput.onkeydown = (e) => { if (e.key === 'Enter') submitTask(); if (e.key === 'Escape') closeForm(); };
    descInput.onkeydown = (e) => { if (e.key === 'Enter') submitTask(); if (e.key === 'Escape') closeForm(); };
}

// --- UTILITIES (Inline Rename & Context Menu) ---
function startInlineRename(element, id, emit_event) {
    const originalName = element.innerText;
    element.contentEditable = "true"; element.focus();
    const range = document.createRange(); range.selectNodeContents(element);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    
    function finishRename() {
        element.contentEditable = "false";
        const newName = element.innerText.trim();
        if (newName !== '' && newName !== originalName) socket.emit(emit_event, { list_id: id, new_name: newName });
        else element.innerText = originalName;
        element.removeEventListener('blur', finishRename); element.removeEventListener('keydown', handleKey);
    }
    function handleKey(e) { if (e.key === 'Enter') { e.preventDefault(); element.blur(); } else if (e.key === 'Escape') { element.innerText = originalName; element.blur(); } }
    element.addEventListener('blur', finishRename); element.addEventListener('keydown', handleKey);
}

function showContextMenu(x, y, options) {
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
    const menuWidth = contextMenu.offsetWidth; const menuHeight = contextMenu.offsetHeight;
    contextMenu.style.left = (x + menuWidth > window.innerWidth ? x - menuWidth : x) + 'px';
    contextMenu.style.top = (y + menuHeight > window.innerHeight ? y - menuHeight : y) + 'px';
}
document.addEventListener('click', () => contextMenu.style.display = 'none');