const socket = io();

// --- CUSTOM LOCAL ENCRYPTION LOGIC ---
function customEncrypt(text) {
    if (!text) return { encrypted: "", encCode: 1 };
    const encCode = Math.floor(Math.random() * 9) + 1; 
    let encrypted = "";
    for (let i = 0; i < text.length; i++) {
        encrypted += String.fromCharCode(text.charCodeAt(i) + encCode);
    }
    return { encrypted, encCode };
}

function customDecrypt(text, encCode) {
    if (!text) return "";
    let decrypted = "";
    for (let i = 0; i < text.length; i++) {
        decrypted += String.fromCharCode(text.charCodeAt(i) - encCode);
    }
    return decrypted;
}

// --- WAIT FOR PAGE TO FULLY LOAD ---
window.onload = function() {
    try {
        if (typeof io === 'undefined') return;

        // --- STATE & DOM ---
        const realToday = new Date(); 
        let currentViewDate = new Date(); 
        let selectedDateStr = null; 
        let currentEntryContent = "";
        let isEditing = false;
        let fallbackTimer = null; 

        const calMonthYear = document.getElementById('cal-month-year');
        const calGrid = document.getElementById('calendar-grid');
        const calPrevBtn = document.getElementById('cal-prev-btn');
        const calNextBtn = document.getElementById('cal-next-btn');

        const displayDate = document.getElementById('diary-display-date');
        const metaContainer = document.getElementById('diary-metadata');
        const metaStatus = document.getElementById('meta-status');

        const controlsContainer = document.getElementById('diary-controls');
        const editBtn = document.getElementById('edit-diary-btn');
        const saveBtn = document.getElementById('save-diary-btn');
        const cancelBtn = document.getElementById('cancel-diary-btn');
        const createBtn = document.getElementById('create-diary-btn');

        const emptyState = document.getElementById('diary-empty-state');
        const readMode = document.getElementById('diary-read-mode');
        const editMode = document.getElementById('diary-edit-mode');

        if (!calGrid) return;

        // --- CALENDAR LOGIC ---
        function renderCalendar() {
            calGrid.innerHTML = '';
            const year = currentViewDate.getFullYear();
            const month = currentViewDate.getMonth();
            
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            if (calMonthYear) calMonthYear.innerText = `${monthNames[month]} ${year}`;
            
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            
            const todayStr = `${realToday.getFullYear()}-${String(realToday.getMonth() + 1).padStart(2, '0')}-${String(realToday.getDate()).padStart(2, '0')}`;
            
            for (let i = 0; i < firstDay; i++) {
                const emptyDiv = document.createElement('div');
                emptyDiv.classList.add('cal-day', 'empty');
                calGrid.appendChild(emptyDiv);
            }
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dayDiv = document.createElement('div');
                dayDiv.classList.add('cal-day');
                dayDiv.innerText = i;
                
                const loopDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                dayDiv.dataset.date = loopDateStr;
                
                if (loopDateStr === todayStr) dayDiv.classList.add('today');
                if (loopDateStr === selectedDateStr) dayDiv.classList.add('active');
                
                dayDiv.addEventListener('click', () => {
                    if (isEditing) {
                        if(!confirm("You have unsaved changes. Discard them?")) return;
                        setEditMode(false);
                    }
                    selectDate(loopDateStr);
                });
                
                calGrid.appendChild(dayDiv);
            }
        }

        if (calPrevBtn) calPrevBtn.addEventListener('click', () => { currentViewDate.setMonth(currentViewDate.getMonth() - 1); renderCalendar(); });
        if (calNextBtn) calNextBtn.addEventListener('click', () => { currentViewDate.setMonth(currentViewDate.getMonth() + 1); renderCalendar(); });

        // --- UI & SELECTION LOGIC ---
        function selectDate(dateStr) {
            selectedDateStr = dateStr;
            renderCalendar(); 
            
            const [y, m, d] = dateStr.split('-');
            const displayObj = new Date(y, m - 1, d);
            
            if (displayDate) displayDate.innerText = displayObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            
            if (emptyState) emptyState.style.display = 'none';
            if (readMode) readMode.style.display = 'none';
            if (editMode) editMode.style.display = 'none';
            if (controlsContainer) controlsContainer.style.display = 'none';
            if (metaContainer) metaContainer.style.display = 'block';
            if (metaStatus) metaStatus.innerText = "Loading securely...";
            
            socket.emit('request_diary_entry', dateStr);

            clearTimeout(fallbackTimer);
            fallbackTimer = setTimeout(() => {
                if (metaStatus && metaStatus.innerText === "Loading securely...") {
                    metaStatus.innerText = "Connection taking longer than usual...";
                }
            }, 4000);
        }

        // --- BUTTON LISTENERS ---
        if (createBtn) createBtn.addEventListener('click', () => {
            if (emptyState) emptyState.style.display = 'none';
            if (controlsContainer) controlsContainer.style.display = 'flex';
            setEditMode(true);
        });

        if (editBtn) editBtn.addEventListener('click', () => setEditMode(true));

        if (cancelBtn) cancelBtn.addEventListener('click', () => {
            setEditMode(false);
            if (currentEntryContent === "") {
                if (emptyState) emptyState.style.display = 'flex';
                if (controlsContainer) controlsContainer.style.display = 'none';
                if (readMode) readMode.style.display = 'none';
                if (metaStatus) metaStatus.innerText = "No entry exists for this date. Click below to start writing.";
            }
        });

        if (saveBtn) saveBtn.addEventListener('click', () => {
            const newContent = editMode ? editMode.value.trim() : "";
            if (newContent === "") { alert("Cannot save an empty diary entry."); return; }
            
            const { encrypted, encCode } = customEncrypt(newContent);
            if (metaStatus) metaStatus.innerText = "Saving securely...";
            
            socket.emit('save_diary_entry', { date: selectedDateStr, content: encrypted, enc_code: encCode });
            setEditMode(false);
        });

        function setEditMode(active) {
            isEditing = active;
            if (active) {
                if (readMode) readMode.style.display = 'none';
                if (editMode) {
                    editMode.style.display = 'block';
                    editMode.value = currentEntryContent;
                    editMode.focus();
                }
                if (editBtn) editBtn.style.display = 'none';
                if (saveBtn) saveBtn.style.display = 'block';
                if (cancelBtn) cancelBtn.style.display = 'block';
                if (metaStatus) metaStatus.innerText = "Editing in progress... (Unsaved)";
            } else {
                if (editMode) editMode.style.display = 'none';
                if (readMode) readMode.style.display = 'block';
                if (editBtn) editBtn.style.display = 'block';
                if (saveBtn) saveBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            }
        }

        // --- SOCKET EVENT LISTENERS ---
        socket.on('load_diary_entry', function(data) {
            clearTimeout(fallbackTimer);
            if (data.date !== selectedDateStr) return; 
            
            if (data.content === null) {
                currentEntryContent = "";
                if (emptyState) emptyState.style.display = 'flex';
                if (controlsContainer) controlsContainer.style.display = 'none';
                if (metaStatus) metaStatus.innerText = "No entry exists for this date. Click below to start writing.";
            } else {
                currentEntryContent = customDecrypt(data.content, data.enc_code);
                if (emptyState) emptyState.style.display = 'none';
                if (readMode) { readMode.style.display = 'block'; readMode.innerText = currentEntryContent; }
                if (metaStatus) metaStatus.innerText = `Last Modified: ${data.updated_at}`;
                if (controlsContainer) controlsContainer.style.display = 'flex';
                if (editBtn) editBtn.style.display = 'block';
                if (saveBtn) saveBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            }
        });

        socket.on('diary_entry_saved', function(data) {
            if (data.date === selectedDateStr) {
                currentEntryContent = customDecrypt(data.content, data.enc_code);
                if (readMode) readMode.innerText = currentEntryContent;
                if (metaStatus) metaStatus.innerText = `Last Modified: ${data.updated_at}`;
                
                if (!isEditing) {
                    if (emptyState) emptyState.style.display = 'none';
                    if (readMode) readMode.style.display = 'block';
                    if (controlsContainer) controlsContainer.style.display = 'flex';
                }
            }
        });

        // --- BOOT PROCESS ---
        renderCalendar();
        
        const todayStr = `${realToday.getFullYear()}-${String(realToday.getMonth() + 1).padStart(2, '0')}-${String(realToday.getDate()).padStart(2, '0')}`;
        
        if (socket.connected) {
            selectDate(todayStr);
        } else {
            socket.on('connect', () => {
                selectDate(todayStr);
            });
        }

    } catch (e) {
        console.error("Diary init failed:", e);
    }
};
// Mobile UI Fix: Automatically close the calendar popup when a date is clicked
document.addEventListener('click', function(e) {
    if (window.innerWidth <= 768) {
        if (e.target.classList.contains('calendar-day') || e.target.closest('.calendar-day')) {
            // FIX: Look for 'sidebar' instead of 'diary-sidebar'
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('mobile-active');
            }
        }
    }
});