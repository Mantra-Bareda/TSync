# TSync

![Status](https://img.shields.io/badge/Status-Live-success)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Flask](https://img.shields.io/badge/Flask-WebSockets-lightgrey)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-green)

**Live Demo:** [TSync is currently live and deployed on Render!](https://tsync-app.onrender.com)

## Overview
TSync is a full-stack, real-time productivity suite designed to seamlessly manage notes, daily diary entries, and smart reminders. Built with a heavy emphasis on data privacy, TSync utilizes custom client-side encryption to ensure that all personal journal entries are encrypted in the browser before they ever reach the cloud database. 

With a beautiful, glassmorphic UI, Light/Dark themes, and instant WebSockets syncing, TSync provides a premium app-like experience across both desktop and mobile devices.

##  Major Features

###  Privacy-First Client-Side Encryption
* **Zero-Knowledge Architecture:** Diary entries and secure notes are encrypted and decrypted locally in the browser using a custom session-based `crypto.js` engine. 
* **Secure Sync Key:** The encryption key is dynamically unlocked via the user's password during login and held safely in `sessionStorage`. The backend only stores the encrypted ciphertext.

###  Real-Time WebSockets
* Powered by **Flask-SocketIO** and **gevent**.
* Actions taken on one device instantly reflect across all active sessions without needing to refresh the page.

###  Calendar-Driven Diary
* A dedicated journaling workspace featuring a dynamic, interactive calendar.
* **Mobile-Optimized:** Features a smart, collapsible calendar widget on mobile devices to maximize writing space.
* Seamlessly edit, save, and browse past entries with instant cloud syncing.

###  Smart NLP Reminders
* A powerful three-pane task management system.
* Create custom lists, use smart filters (e.g., Command-K style search), and organize tasks.
* Real-time checkbox syncing and task editing.

###  Premium Responsive UI
* **Glassmorphism Design:** Beautiful translucent navbars, soft shadows, and modern typography.
* **Theme Support:** Fully supports both Earth-Drawn (Light) and Premium Tech (Dark) themes.
* **Mobile-First:** Sidebars intelligently convert into scrollable pill-tabs, and detail panels transform into slide-over modals on smaller screens.

##  Technology Stack

**Frontend:**
* HTML5, CSS3 (Custom Variables, Flexbox/Grid)
* Vanilla JavaScript (DOM manipulation, Socket.io client, local encryption)

**Backend:**
* Python 3.11
* Flask & Flask-SocketIO
* `gevent` & `gevent-websocket` (Production WebSocket Workers)
* PyMongo (MongoDB Driver)

**Database & Cloud:**
* **MongoDB Atlas:** Hosted cloud NoSQL database.
* **Cloudinary:** Media and file attachment management.
* **Render:** Live production hosting environment.

##  Local Development Setup

Want to run TSync on your own machine? Follow these steps:

### 1. Clone the Repository
```bash
git clone [https://github.com/YOUR_GITHUB_USERNAME/TSync.git](https://github.com/YOUR_GITHUB_USERNAME/TSync.git)
cd TSync
```

### 2. Install Dependencies
Make sure you have Python 3 installed.
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your secure keys:
```ini
MONGO_URI=mongodb+srv://<username>:<password>@cluster...
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```
*(Never upload your `.env` file to GitHub!)*

### 4. Run the Application
Start the Flask-SocketIO server:
```bash
python app.py
```
Open your browser and navigate to `http://localhost:5000` (or the port specified in your terminal).

---
*Designed and built with ❤️*
