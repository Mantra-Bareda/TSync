import os
import cloudinary
import cloudinary.uploader
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, send, emit, join_room
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
from functools import wraps
from datetime import datetime, timedelta  # <-- Add timedelta here  
import encrypter as enc 

load_dotenv()

app = Flask(__name__)

# 1. Random key on boot guarantees everyone is logged out when the server restarts
app.config['SECRET_KEY'] = os.urandom(32) 

# 2. Enforce a strict 10-minute expiration on the server side
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=10)

socketio = SocketIO(app, cors_allowed_origins="*")

cloudinary.config(
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key = os.getenv('CLOUDINARY_API_KEY'),
    api_secret = os.getenv('CLOUDINARY_API_SECRET')
)

client = MongoClient(os.getenv('MONGO_URI'))
db = client['tsync_database']

# --- DATABASE COLLECTIONS ---
chats_collection = db['chats']       
messages_collection = db['messages'] 
users_collection = db['users']       
todo_lists_collection = db['todo_lists'] 
todos_collection = db['todos']           
diary_collection = db['diary']           # NEW: Diary Metadata
reminder_lists_collection = db['reminder_lists'] # NEW
reminders_collection = db['reminders']           # NEW

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session: return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        encrypted_sync_key = request.form.get('encrypted_sync_key') # NEW: Grab the locked key

        if users_collection.find_one({'username': username}):
            return render_template('register.html', error="Username already exists")

        # Save the wrapped key alongside the user credentials
        users_collection.insert_one({
            'username': username,
            'password': enc.encrypt(password), 
            'encrypted_sync_key': encrypted_sync_key # NEW: Store it in the database
        })
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    # NEW: Handle silent AJAX login requests from our Javascript interceptor
    if request.is_json:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        user = users_collection.find_one({'username': username})
        
        if user and enc.decrypt(user['password']) == password:
            session.permanent = True  
            session['user_id'] = str(user['_id'])
            session['username'] = user['username']
            
            # Send the locked key back to the browser so the user's password can unlock it
            return jsonify({
                'success': True, 
                'encrypted_sync_key': user.get('encrypted_sync_key', '') 
            })
            
        return jsonify({'success': False, 'error': 'Invalid username or password'})

    # If it's a normal GET request, just show the login page
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# --- APP ROUTES ---
@app.route('/')
@login_required
def index(): return render_template('home.html')




@app.route('/chat')
@login_required
def chat(): return render_template('chat.html')

@app.route('/todo')
@login_required
def todo(): return render_template('todo.html') 

@app.route('/diary')
@login_required
def diary(): return render_template('diary.html') # NEW: Route added

@app.route('/reminders')
@login_required
def reminders(): 
    return render_template('reminders.html')

@app.route('/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files: return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    file_type = request.form.get('file_type', 'other')
    try:
        upload_options = {"resource_type": "auto"}
        if file_type == 'image': upload_options["transformation"] = [{"width": 1280, "crop": "limit"}, {"quality": "auto:good"}]
        upload_result = cloudinary.uploader.upload(file, **upload_options)
        return jsonify({'url': upload_result['secure_url'], 'name': file.filename, 'type': file_type, 'public_id': upload_result['public_id'], 'resource_type': upload_result['resource_type'], 'size': upload_result['bytes']})
    except Exception as e: return jsonify({'error': str(e)}), 500

# --- SETTINGS & PROFILE ROUTES ---
@app.route('/settings')
@login_required
def settings():
    # Pass any success/error messages from redirect
    success = request.args.get('success')
    error = request.args.get('error')
    return render_template('settings.html', success=success, error=error)

@app.route('/update_password', methods=['POST'])
@login_required
def update_password():
    new_password = request.form.get('new_password')
    new_encrypted_sync_key = request.form.get('new_encrypted_sync_key')

    if new_password and new_encrypted_sync_key:
        users_collection.update_one(
            {'_id': ObjectId(session['user_id'])}, 
            {'$set': {
                'password': enc.encrypt(new_password),
                'encrypted_sync_key': new_encrypted_sync_key
            }}
        )
        return redirect(url_for('settings', success="Account password and Sync Key updated successfully!"))
    return redirect(url_for('settings', error="Invalid request."))

# --- WEBSOCKETS (CORE SETUP) ---
@socketio.on('connect')
def handle_connect():
    if 'user_id' not in session: return False 
    user_id = session['user_id']
    join_room(user_id) 
    
    chats = [{'id': str(c['_id']), 'name': c.get('name', 'New Chat')} for c in chats_collection.find({'user_id': user_id})]
    emit('load_sidebar', chats)
    
    todo_lists = [{'id': str(t['_id']), 'name': t.get('name', 'New List')} for t in todo_lists_collection.find({'user_id': user_id})]
    emit('load_todo_sidebar', todo_lists)

# --- DIARY SOCKETS (CLOUD SAFE) ---
@socketio.on('request_diary_entry')
def request_diary_entry(date_str):
    user_id = session.get('user_id')
    if not user_id: return
    
    entry = diary_collection.find_one({'user_id': user_id, 'date': date_str})
    if entry:
        # Pull text directly from MongoDB, no file needed!
        content = entry.get('content', '')
        emit('load_diary_entry', {
            'date': date_str,
            'content': content,
            'enc_code': entry['enc_code'],
            'created_at': entry['created_at'],
            'updated_at': entry['updated_at']
        }, to=user_id)
    else:
        # Entry doesn't exist yet for this date
        emit('load_diary_entry', {'date': date_str, 'content': None}, to=user_id)

@socketio.on('save_diary_entry')
def save_diary_entry(data):
    user_id = session.get('user_id')
    if not user_id: return
    
    date_str = data['date']
    content = data['content']     
    enc_code = data['enc_code']   
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = diary_collection.find_one({'user_id': user_id, 'date': date_str})
    
    if not entry:
        diary_collection.insert_one({
            'user_id': user_id,
            'date': date_str,
            'content': content,  # Save the encrypted text directly to the database
            'enc_code': enc_code,
            'created_at': now_str,
            'updated_at': now_str
        })
    else:
        diary_collection.update_one({'_id': entry['_id']}, {
            '$set': { 'content': content, 'enc_code': enc_code, 'updated_at': now_str }
        })
        
    emit('diary_entry_saved', {
        'date': date_str, 'content': content, 'enc_code': enc_code, 'updated_at': now_str
    }, to=user_id)


# (KEEP ALL YOUR EXISTING CHAT AND TODO SOCKET EVENTS EXACTLY AS THEY WERE HERE)
def check_chat_owner(chat_id, user_id): return chats_collection.find_one({'_id': ObjectId(chat_id), 'user_id': user_id}) is not None
def destroy_cloudinary_file(msg):
    public_id = msg.get('public_id')
    res_type = msg.get('cloudinary_resource_type', 'image')
    if not public_id and 'file_url' in msg:
        try:
            path = msg['file_url'].split('/upload/')[1]
            if path.startswith('v') and '/' in path: path = path.split('/', 1)[1] 
            if res_type != 'raw' and '.' in path: public_id = path.rsplit('.', 1)[0]
            else: public_id = path 
        except Exception: pass
    if public_id:
        try: cloudinary.uploader.destroy(public_id, resource_type=res_type, invalidate=True)
        except Exception as e: print(f"Cloudinary Error: {e}")

@socketio.on('create_chat')
def create_chat():
    user_id = session.get('user_id')
    if not user_id: return
    chat_id = str(chats_collection.insert_one({'name': 'New Chat', 'user_id': user_id}).inserted_id)
    emit('chat_created', {'id': chat_id, 'name': 'New Chat'}, to=user_id)

@socketio.on('request_chat_history')
def load_chat_history(chat_id):
    user_id = session.get('user_id')
    if not user_id or not check_chat_owner(chat_id, user_id): return
    history = []
    for msg in messages_collection.find({'chat_id': chat_id}):
        msg_obj = {'id': str(msg['_id'])}
        if 'text' in msg: msg_obj['text'] = msg['text']
        if 'file_url' in msg:
            msg_obj.update({'file_url': msg['file_url'], 'file_name': msg['file_name'], 'file_type': msg['file_type'], 'file_size': msg.get('file_size')})
        history.append(msg_obj)
    emit('load_history', {'chat_id': chat_id, 'history': history})

@socketio.on('send_message')
def handle_message(data):
    user_id = session.get('user_id')
    chat_id = data['chat_id']
    if not user_id or not check_chat_owner(chat_id, user_id): return
    msg_doc = {'chat_id': chat_id}
    if 'text' in data: msg_doc['text'] = data['text']
    if 'file_url' in data:
        msg_doc.update({'file_url': data['file_url'], 'file_name': data['file_name'], 'file_type': data['file_type'], 'public_id': data['public_id'], 'cloudinary_resource_type': data['cloudinary_resource_type']})
        if 'file_size' in data: msg_doc['file_size'] = data['file_size']
    result = messages_collection.insert_one(msg_doc)
    emit_data = {'id': str(result.inserted_id), 'chat_id': chat_id}
    emit_data.update(msg_doc)
    emit_data.pop('_id', None)
    emit('receive_message', emit_data, to=user_id)

@socketio.on('delete_messages')
def delete_messages(data):
    user_id = session.get('user_id')
    chat_id = data['chat_id']
    if not user_id or not check_chat_owner(chat_id, user_id): return
    msg_ids = data['msg_ids']
    object_ids = [ObjectId(mid) for mid in msg_ids]
    for msg in messages_collection.find({'_id': {'$in': object_ids}, 'chat_id': chat_id}): destroy_cloudinary_file(msg)
    messages_collection.delete_many({'_id': {'$in': object_ids}, 'chat_id': chat_id})
    emit('messages_deleted', {'msg_ids': msg_ids, 'chat_id': chat_id}, to=user_id)

@socketio.on('rename_chat')
def rename_chat(data):
    user_id = session.get('user_id')
    chat_id = data['chat_id']
    if not user_id or not check_chat_owner(chat_id, user_id): return
    chats_collection.update_one({'_id': ObjectId(chat_id)}, {'$set': {'name': data['new_name']}})
    emit('chat_renamed', {'chat_id': chat_id, 'new_name': data['new_name']}, to=user_id)

@socketio.on('delete_chat')
def delete_chat(chat_id):
    user_id = session.get('user_id')
    if not user_id or not check_chat_owner(chat_id, user_id): return
    for msg in messages_collection.find({'chat_id': chat_id}): destroy_cloudinary_file(msg)
    chats_collection.delete_one({'_id': ObjectId(chat_id)})
    messages_collection.delete_many({'chat_id': chat_id})
    emit('chat_deleted', chat_id, to=user_id)

def check_todo_owner(list_id, user_id): return todo_lists_collection.find_one({'_id': ObjectId(list_id), 'user_id': user_id}) is not None

@socketio.on('create_todo_list')
def create_todo_list():
    user_id = session.get('user_id')
    if not user_id: return
    list_id = str(todo_lists_collection.insert_one({'name': 'New Todo List', 'user_id': user_id}).inserted_id)
    emit('todo_list_created', {'id': list_id, 'name': 'New Todo List'}, to=user_id)

@socketio.on('rename_todo_list')
def rename_todo_list(data):
    user_id = session.get('user_id')
    list_id = data['list_id']
    if not user_id or not check_todo_owner(list_id, user_id): return
    todo_lists_collection.update_one({'_id': ObjectId(list_id)}, {'$set': {'name': data['new_name']}})
    emit('todo_list_renamed', {'list_id': list_id, 'new_name': data['new_name']}, to=user_id)

@socketio.on('delete_todo_list')
def delete_todo_list(list_id):
    user_id = session.get('user_id')
    if not user_id or not check_todo_owner(list_id, user_id): return
    todo_lists_collection.delete_one({'_id': ObjectId(list_id)})
    todos_collection.delete_many({'list_id': list_id})
    emit('todo_list_deleted', list_id, to=user_id)

@socketio.on('request_todos')
def load_todos(list_id):
    user_id = session.get('user_id')
    if not user_id or not check_todo_owner(list_id, user_id): return
    todos = []
    for t in todos_collection.find({'list_id': list_id}):
        todos.append({
            'id': str(t['_id']), 'list_id': t['list_id'], 'parent_id': t.get('parent_id'),
            'text': t['text'], 'description': t.get('description', ''),
            'completed': t.get('completed', False), 'level': t.get('level', 0)
        })
    emit('load_todos', {'list_id': list_id, 'todos': todos}, to=user_id)

@socketio.on('add_todo')
def add_todo(data):
    user_id = session.get('user_id')
    list_id = data['list_id']
    if not user_id or not check_todo_owner(list_id, user_id): return
    
    new_todo = {
        'list_id': list_id, 'user_id': user_id,
        'parent_id': data.get('parent_id'), 'text': data['text'],
        'description': data.get('description', ''),
        'completed': False, 'level': data.get('level', 0)
    }
    todo_id = str(todos_collection.insert_one(new_todo).inserted_id)
    new_todo['id'] = todo_id
    new_todo.pop('_id', None)
    new_todo.pop('user_id', None)
    emit('todo_added', new_todo, to=user_id)

@socketio.on('update_todo')
def update_todo(data):
    user_id = session.get('user_id')
    list_id = data['list_id']
    if not user_id or not check_todo_owner(list_id, user_id): return
    
    update_fields = {}
    if 'text' in data: update_fields['text'] = data['text']
    if 'description' in data: update_fields['description'] = data['description']
    if 'completed' in data: update_fields['completed'] = data['completed']
    
    todos_collection.update_one({'_id': ObjectId(data['id'])}, {'$set': update_fields})
    emit('todo_updated', data, to=user_id)

@socketio.on('delete_todo')
def delete_todo(data):
    user_id = session.get('user_id')
    list_id = data['list_id']
    todo_id = data['todo_id']
    if not user_id or not check_todo_owner(list_id, user_id): return
    
    all_todos = list(todos_collection.find({'list_id': list_id}))
    def get_descendants(tid):
        desc = []
        for t in all_todos:
            if t.get('parent_id') == tid:
                desc.append(str(t['_id']))
                desc.extend(get_descendants(str(t['_id'])))
        return desc
        
    to_delete = [todo_id] + get_descendants(todo_id)
    object_ids = [ObjectId(tid) for tid in to_delete]
    todos_collection.delete_many({'_id': {'$in': object_ids}})
    emit('todos_deleted', {'list_id': list_id, 'todo_ids': to_delete}, to=user_id)

# --- REMINDERS SOCKETS ---
def check_reminder_list_owner(list_id, user_id): 
    return reminder_lists_collection.find_one({'_id': ObjectId(list_id), 'user_id': user_id}) is not None

@socketio.on('request_reminder_lists')
def load_reminder_lists():
    user_id = session.get('user_id')
    if not user_id: return
    lists = [{'id': str(l['_id']), 'name': l.get('name', 'New List')} for l in reminder_lists_collection.find({'user_id': user_id})]
    emit('load_reminder_lists', lists, to=user_id)

@socketio.on('create_reminder_list')
def create_reminder_list(data):
    user_id = session.get('user_id')
    if not user_id: return
    list_id = str(reminder_lists_collection.insert_one({'name': data.get('name', 'New List'), 'user_id': user_id}).inserted_id)
    emit('reminder_list_created', {'id': list_id, 'name': data.get('name', 'New List')}, to=user_id)

@socketio.on('request_reminders')
def load_reminders(list_id):
    user_id = session.get('user_id')
    # Use 'all' 'today' or 'scheduled' for smart filters, otherwise check ownership
    if list_id not in ['all', 'today', 'scheduled', 'flagged']:
        if not user_id or not check_reminder_list_owner(list_id, user_id): return
        query = {'list_id': list_id}
    else:
        query = {'user_id': user_id} # Frontend filters smart views

    reminders = []
    for r in reminders_collection.find(query):
        reminders.append({
            'id': str(r['_id']), 'list_id': r['list_id'], 
            'text': r['text'], 'notes': r.get('notes', ''),
            'completed': r.get('completed', False), 'flagged': r.get('flagged', False),
            'parsed_date': r.get('parsed_date', None) # ISO string
        })
    emit('load_reminders', {'list_id': list_id, 'reminders': reminders}, to=user_id)

@socketio.on('add_reminder')
def add_reminder(data):
    user_id = session.get('user_id')
    if not user_id: return
    
    new_reminder = {
        'list_id': data['list_id'], 'user_id': user_id,
        'text': data['text'], 'notes': data.get('notes', ''),
        'completed': False, 'flagged': data.get('flagged', False),
        'parsed_date': data.get('parsed_date', None)
    }
    r_id = str(reminders_collection.insert_one(new_reminder).inserted_id)
    new_reminder['id'] = r_id
    new_reminder.pop('_id', None)
    new_reminder.pop('user_id', None)
    emit('reminder_added', new_reminder, to=user_id)

@socketio.on('update_reminder')
def update_reminder(data):
    user_id = session.get('user_id')
    if not user_id: return
    update_fields = {}
    for key in ['text', 'notes', 'completed', 'flagged', 'parsed_date', 'list_id']:
        if key in data: update_fields[key] = data[key]
    
    reminders_collection.update_one({'_id': ObjectId(data['id'])}, {'$set': update_fields})
    emit('reminder_updated', data, to=user_id)

@socketio.on('delete_reminder')
def delete_reminder(data):
    user_id = session.get('user_id')
    r_id = data['id']
    if not user_id: return
    reminders_collection.delete_one({'_id': ObjectId(r_id)})
    emit('reminder_deleted', {'id': r_id}, to=user_id)

@socketio.on('rename_reminder_list')
def rename_reminder_list(data):
    user_id = session.get('user_id')
    list_id = data['list_id']
    if not user_id or not check_reminder_list_owner(list_id, user_id): return
    reminder_lists_collection.update_one({'_id': ObjectId(list_id)}, {'$set': {'name': data['new_name']}})
    emit('reminder_list_renamed', {'list_id': list_id, 'new_name': data['new_name']}, to=user_id)

@socketio.on('delete_reminder_list')
def delete_reminder_list(list_id):
    user_id = session.get('user_id')
    if not user_id or not check_reminder_list_owner(list_id, user_id): return
    reminder_lists_collection.delete_one({'_id': ObjectId(list_id)})
    reminders_collection.delete_many({'list_id': list_id}) # Deletes all tasks inside it too!
    emit('reminder_list_deleted', list_id, to=user_id)


if __name__ == '__main__':
    # Grab the port Render gives us, or default to 5000 for local testing
    port = int(os.environ.get("PORT", 10000))
    # debug=False is mandatory for production to prevent security leaks!
    socketio.run(app, host='0.0.0.0', port=port, debug=False)