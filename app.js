const express = require("express");
const bodyParser = require("body-parser");
const {
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const useMongoDBAuthState = require("./mongoAuthState");
const makeWASocket = require("@whiskeysockets/baileys").default;

// Get environment variables or use defaults
const mongoURL = 
const PORT = 3001;

const { MongoClient } = require("mongodb");

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());

// Store WhatsApp connection globally
let sock;
let isConnected = false;

async function connectionLogic() {
  try {
    console.log("Connecting to WhatsApp...");
    
    const mongoClient = new MongoClient(mongoURL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    await mongoClient.connect();
    console.log("Connected to MongoDB");
    
    const collection = mongoClient
      .db("whatsapp_api")
      .collection("auth_info_baileys");
    
    const { state, saveCreds } = await useMongoDBAuthState(collection);
    
    sock = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update || {};

      if (qr) {
        console.log("QR Code generated - scan with WhatsApp mobile app");
      }

      if (connection === "open") {
        console.log("WhatsApp connection established!");
        isConnected = true;
      }

      if (connection === "close") {
        isConnected = false;
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log("WhatsApp connection closed due to:", lastDisconnect?.error?.output?.payload?.message);

        if (shouldReconnect) {
          console.log("Reconnecting to WhatsApp in 3 seconds...");
          setTimeout(connectionLogic, 3000);
        } else {
          console.log("Logged out from WhatsApp");
        }
      }
    });

    sock.ev.on("messages.update", (messageInfo) => {
      console.log("Message update received:", messageInfo.length);
    });

    sock.ev.on("messages.upsert", (messageInfoUpsert) => {
      const { messages } = messageInfoUpsert;
      if (messages && messages.length > 0) {
        console.log("New message received:", messages[0].key.remoteJid);
      }
    });
    
    sock.ev.on("creds.update", saveCreds);
  } catch (error) {
    console.error("Error in connection logic:", error);
    console.log("Retrying connection in 5 seconds...");
    setTimeout(connectionLogic, 5000);
  }
}

// API Endpoints
app.get('/send', async (req, res) => {
  try {
    const { phoneNumber, message } = req.query;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone number and message are required" 
      });
    }
    
    // Validate phone number format
   
    
    await sock.sendMessage(formattedNumber, { text: message });
    
    return res.status(200).json({ 
      success: true, 
      message: "Message sent successfully" 
    });
  } catch (error) {
    console.error("Error sending message:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Failed to send message", 
      error: error.message 
    });
  }
});

// Status endpoint
app.get('/status', (req, res) => {
  res.status(200).json({
    connected: isConnected,
    status: isConnected ? "Connected to WhatsApp" : "Not connected to WhatsApp"
  });
});

// Initialize WhatsApp connection
connectionLogic();

// Log configuration
console.log(`MongoDB URL: ${mongoURL}`);
console.log(`PORT: ${PORT}`);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});