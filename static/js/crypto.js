// --- 1. CORE CRYPTO SETUP ---
// The active, raw sync key is stored ONLY in sessionStorage.
// It is wiped from memory the second you close the tab.
let activeSyncKey = sessionStorage.getItem('tsync_active_key');

// A static salt used to stretch the password into a stronger wrapping key
const APP_SALT = "tsync-e2ee-secure-salt-v1"; 

// --- 2. KEY WRAPPING ALGORITHMS (For Auth) ---

// Generates a massive, unbreakable 256-bit random key when making a new account
function generateMasterSyncKey() {
    return CryptoJS.lib.WordArray.random(32).toString(); 
}

// Stretches the login password into a heavy Encryption Key, then locks the Sync Key with it
function wrapSyncKey(rawSyncKey, loginPassword) {
    // 10,000 iterations makes it mathematically punishing for hackers to brute-force
    const wrappingKey = CryptoJS.PBKDF2(loginPassword, APP_SALT, { keySize: 256/32, iterations: 10000 });
    const wrappedKey = CryptoJS.AES.encrypt(rawSyncKey, wrappingKey.toString()).toString();
    return wrappedKey;
}

// Unlocks the Sync Key using the login password
function unwrapSyncKey(wrappedSyncKey, loginPassword) {
    try {
        const wrappingKey = CryptoJS.PBKDF2(loginPassword, APP_SALT, { keySize: 256/32, iterations: 10000 });
        const bytes = CryptoJS.AES.decrypt(wrappedSyncKey, wrappingKey.toString());
        const rawKey = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!rawKey) throw new Error("Wrong Password");
        return rawKey;
    } catch (e) {
        console.error("Failed to unwrap key:", e);
        return null; // Return null if the password was wrong
    }
}

// Set the active key in memory after a successful login or registration
function setActiveKey(rawKey) {
    activeSyncKey = rawKey;
    sessionStorage.setItem('tsync_active_key', rawKey);
}

// Clear the key when logging out
function clearCryptoMemory() {
    sessionStorage.removeItem('tsync_active_key');
    activeSyncKey = null;
}

// --- 3. APP ENCRYPTION ALGORITHMS (For Chats, Todos, Reminders) ---

// Encrypt text before sending it to Python
async function encryptText(plainText) {
    if (!plainText || !activeSyncKey) return plainText;
    try {
        return CryptoJS.AES.encrypt(plainText, activeSyncKey).toString();
    } catch (e) {
        console.error("Encryption failed:", e);
        return plainText;
    }
}

// Decrypt text arriving from Python
async function decryptText(cipherText) {
    if (!cipherText || !activeSyncKey) return cipherText; 
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, activeSyncKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decrypted) return "🔒 [Decryption Failed]";
        return decrypted;
    } catch (e) {
        return "🔒 [Decryption Failed]";
    }
}