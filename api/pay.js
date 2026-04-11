import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc, increment, addDoc } from "firebase/firestore";

// Aapki Virtual Pocket Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyAKMHpSCD1sMUxuBX0OhhwH2P3XFL7nwZ0",
  authDomain: "virtual-pocket-b391f.firebaseapp.com",
  projectId: "virtual-pocket-b391f",
  storageBucket: "virtual-pocket-b391f.firebasestorage.app",
  messagingSenderId: "601505218542",
  appId: "1:601505218542:web:d1d1b00b76d3aac50158ff"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
    // CORS Allow - Taki Telegram bot aur API block na ho
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Agar OPTIONS request aati hai (Preflight), toh yahi se success bhej do
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { key, paytm, amount, comment } = req.query;

        // 1. Basic Validation
        if (!key || !paytm || !amount) {
            return res.status(400).json({ status: "error", message: "Missing parameters! Need key, paytm, and amount." });
        }

        const withdrawAmount = Number(amount);
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ status: "error", message: "Invalid amount!" });
        }

        // 2. VP- Key validation
        if (!key.startsWith("VP-")) {
            return res.status(401).json({ status: "error", message: "Invalid API Key format!" });
        }

        // 3. Find Admin/Bot Owner via API Key
        const usersRef = collection(db, "users");
        const qAdmin = query(usersRef, where("apiKey", "==", key));
        const adminSnap = await getDocs(qAdmin);

        if (adminSnap.empty) {
            return res.status(401).json({ status: "error", message: "Invalid or Expired API Key!" });
        }

        const adminDoc = adminSnap.docs[0];
        const adminData = adminDoc.data();
        const adminDocId = adminDoc.id; // Usually the +91 phone number

        // 4. Admin Balance Check
        if (adminData.balance < withdrawAmount) {
            return res.status(400).json({ status: "error", message: "API Owner has insufficient balance!" });
        }

        // 5. Receiver Number Format Check
        let receiverPhone = paytm.trim();
        if (receiverPhone.length === 10) {
            receiverPhone = "+91" + receiverPhone; // Automatically adding +91
        } else if (!receiverPhone.startsWith("+91") && receiverPhone.length === 12) {
             receiverPhone = "+" + receiverPhone;
        }

        // 6. Check if Receiver Exists
        const receiverRef = doc(db, "users", receiverPhone);
        const receiverSnap = await getDoc(receiverRef);

        if (!receiverSnap.exists()) {
            return res.status(404).json({ status: "error", message: `User ${paytm} is not registered in Virtual Pocket!` });
        }

        // 7. Process Transactions (Atomic Updates)
        const adminRef = doc(db, "users", adminDocId);
        
        // A) Deduct from Admin
        await updateDoc(adminRef, { balance: increment(-withdrawAmount) });
        
        // B) Add to Receiver
        await updateDoc(receiverRef, { balance: increment(withdrawAmount) });

        // 8. Save History Logs
        const txnId = "API" + Date.now();
        const exactDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const historyData = {
            id: txnId,
            amount: withdrawAmount,
            status: "SUCCESS",
            date: exactDate,
            timestamp: Date.now()
        };

        // Admin Log (Paisa Gaya)
        await addDoc(collection(db, "transactions"), {
            ...historyData,
            userPhone: adminDocId,
            receiver: receiverPhone,
            type: "API SEND",
            comment: comment || "Bot Payout"
        });

        // Receiver Log (Paisa Aaya)
        await addDoc(collection(db, "transactions"), {
            ...historyData,
            userPhone: receiverPhone,
            sender: "API System",
            type: "API RECEIVED",
            comment: comment || "Received from Bot"
        });

        // 9. Send Success Response back to Bot
        return res.status(200).json({
            status: "success",
            message: "Payment successful",
            data: {
                transaction_id: txnId,
                amount: withdrawAmount,
                receiver: receiverPhone,
                timestamp: exactDate
            }
        });

    } catch (error) {
        console.error("API Crash: ", error);
        // Hamesha JSON return karega, server crash nahi hoga
        return res.status(500).json({ 
            status: "error", 
            message: "Internal Server Error", 
            details: error.message 
        });
    }
}
