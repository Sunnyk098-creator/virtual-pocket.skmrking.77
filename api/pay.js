import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc, increment, addDoc } from "firebase/firestore";

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
    // CORS aur Response Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    try {
        const { key, paytm, amount, comment } = req.query;

        // Basic Validation
        if (!key || !paytm || !amount) {
            return res.status(400).json({ status: "error", message: "Missing parameters" });
        }

        const withdrawAmount = Number(amount);
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ status: "error", message: "Invalid amount!" });
        }

        // 1. Admin Find Karein
        const usersRef = collection(db, "users");
        const qAdmin = query(usersRef, where("apiKey", "==", key));
        const adminSnap = await getDocs(qAdmin);

        if (adminSnap.empty) {
            return res.status(401).json({ status: "error", message: "Invalid API Key!" });
        }

        const adminDoc = adminSnap.docs[0];
        const adminData = adminDoc.data();
        
        // IMPORTANT: Yahan hum adminDoc.id use karenge bajaye adminData.phone ke
        const adminDocId = adminDoc.id; 

        // 2. Balance Check
        if (adminData.balance < withdrawAmount) {
            return res.status(400).json({ status: "error", message: "Insufficient balance!" });
        }

        // 3. Receiver Formatting
        let receiverPhone = paytm.trim();
        if (receiverPhone.length === 10) {
            receiverPhone = "+91" + receiverPhone;
        }

        // 4. Receiver Check (Make sure document ID is the phone number)
        const receiverRef = doc(db, "users", receiverPhone);
        const receiverSnap = await getDoc(receiverRef);

        if (!receiverSnap.exists()) {
            return res.status(404).json({ status: "error", message: "Receiver not registered!" });
        }

        // 5. Atomic Updates (Transaction avoid karne ke liye sequential update)
        const adminRef = doc(db, "users", adminDocId);
        
        await updateDoc(adminRef, { balance: increment(-withdrawAmount) });
        await updateDoc(receiverRef, { balance: increment(withdrawAmount) });

        const txnId = "API" + Date.now();
        const exactDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // History Logging
        const historyData = {
            id: txnId,
            amount: withdrawAmount,
            status: "SUCCESS",
            date: exactDate,
            timestamp: Date.now()
        };

        await addDoc(collection(db, "transactions"), {
            ...historyData,
            userPhone: adminData.phone || adminDocId,
            receiver: receiverPhone,
            type: "API SEND",
            comment: comment || "API Payout"
        });

        await addDoc(collection(db, "transactions"), {
            ...historyData,
            userPhone: receiverPhone,
            sender: adminData.phone || adminDocId,
            type: "API RECEIVED",
            comment: comment || "Received from Bot"
        });

        return res.status(200).json({
            status: "success",
            message: "Payment successful",
            transaction_id: txnId
        });

    } catch (error) {
        console.error("CRASH ERROR:", error);
        // Hamesha valid JSON return karein crash ke waqt bhi
        return res.status(500).json({ 
            status: "error", 
            message: "Internal Server Error",
            debug: error.message 
        });
    }
}
