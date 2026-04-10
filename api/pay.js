import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, updateDoc, increment, addDoc } from "firebase/firestore";

// Aapki Firebase Config (Same wahi jo HTML me use ki hai)
const firebaseConfig = {
  apiKey: "AIzaSyAKMHpSCD1sMUxuBX0OhhwH2P3XFL7nwZ0",
  authDomain: "virtual-pocket-b391f.firebaseapp.com",
  projectId: "virtual-pocket-b391f",
  storageBucket: "virtual-pocket-b391f.firebasestorage.app",
  messagingSenderId: "601505218542",
  appId: "1:601505218542:web:d1d1b00b76d3aac50158ff"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
    // CORS Allow (Taki API har jagah se access ho sake)
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Query parameters catch karna
    const { key, paytm, amount, comment } = req.query;

    if (!key || !paytm || !amount) {
        return res.status(400).json({ status: "error", message: "Missing parameters (key, paytm, amount are required)" });
    }

    const withdrawAmount = Number(amount);
    
    // Amount zero ya minus me nahi hona chahiye
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        return res.status(400).json({ status: "error", message: "Invalid amount!" });
    }

    try {
        // 1. API Key wale Admin/Merchant ko dhundhna
        const usersRef = collection(db, "users");
        const qAdmin = query(usersRef, where("apiKey", "==", key));
        const adminSnap = await getDocs(qAdmin);

        if (adminSnap.empty) {
            return res.json({ status: "error", message: "Invalid API Key!" });
        }

        const adminDoc = adminSnap.docs[0];
        const adminData = adminDoc.data();
        const adminPhone = adminData.phone;

        // 2. Admin ka balance check karna
        if (adminData.balance < withdrawAmount) {
            return res.json({ status: "error", message: "API Owner has insufficient balance!" });
        }

        // 3. Jisko paise bhejne hain (Receiver) uska number format karna
        let receiverPhone = paytm.trim();
        if (receiverPhone.length === 10) {
            receiverPhone = "+91" + receiverPhone; // 10 digit number ke aage +91 lagana zaroori hai
        }

        // 4. Check karna ki receiver app me registered hai ya nahi
        const receiverRef = doc(db, "users", receiverPhone);
        const receiverSnap = await getDoc(receiverRef);

        if (!receiverSnap.exists()) {
            return res.json({ status: "error", message: `User with number ${paytm} is not registered in Virtual Pocket!` });
        }

        // 5. TRANSACTIONS KARNA (Admin se katna, User ko dena)
        const adminRef = doc(db, "users", adminPhone);

        // A) Admin ka balance minus karna
        await updateDoc(adminRef, { balance: increment(-withdrawAmount) });

        // B) User ka balance plus karna
        await updateDoc(receiverRef, { balance: increment(withdrawAmount) });

        const txnId = "API" + Date.now();
        const exactDate = new Date().toLocaleString('en-IN');

        // C) Admin ki History Save karna
        await addDoc(collection(db, "transactions"), {
            id: txnId,
            userPhone: adminPhone,
            receiver: receiverPhone,
            amount: withdrawAmount,
            type: "API SEND",
            status: "SUCCESS",
            comment: comment || "API Payout",
            date: exactDate,
            timestamp: Date.now()
        });

        // D) User ki History Save karna
        await addDoc(collection(db, "transactions"), {
            id: txnId,
            userPhone: receiverPhone,
            sender: "API System",
            amount: withdrawAmount,
            type: "API RECEIVED",
            status: "SUCCESS",
            comment: comment || "Received from Bot",
            date: exactDate,
            timestamp: Date.now()
        });

        // 6. Success Response Return Karna
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
        // YAHAN FIX KIYA HAI [object Object] WALI PROBLEM KO
        console.error("API Error: ", error);
        return res.json({ 
            status: "error", 
            message: error.message || "Internal Server Error" 
        });
    }
}
