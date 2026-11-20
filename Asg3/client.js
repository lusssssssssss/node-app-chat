const io = require("socket.io-client");
const crypto = require("crypto");
const readline = require("readline");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate RSA key pair (2048-bit) untuk identitas asli klien ini
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "pem",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

let registeredUsername = "";
let username = "";
let isReady = false;
const users = new Map();

function signMessage(text, privKey) {
  return crypto
    .createSign("sha256")
    .update(text)
    .end()
    .sign(privKey, "base64");
}

function verifyMessage(text, signature, pubKey) {
  if (!pubKey || !signature) return false;
  try {
    return crypto
      .createVerify("sha256")
      .update(text)
      .end()
      .verify(pubKey, signature, "base64");
  } catch (err) {
    return false;
  }
}

function askUsername() {
  rl.question("Enter your username: ", (input) => {
    const cleanName = input.trim();
    if (!cleanName) {
      return askUsername();
    }

    registeredUsername = cleanName;
    username = cleanName;
    isReady = true;

    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", {
      username: registeredUsername,
      publicKey,
    });

    rl.prompt();
  });
}

rl.on("line", (line) => {
  if (!isReady) return;

  const message = line.trim();
  if (message) {
    const impersonateMatch = message.match(/^!impersonate (\w+)$/);
    if (impersonateMatch) {
      username = impersonateMatch[1];
      console.log(`Now impersonating as ${username}`);
    } else if (message.match(/^!exit$/)) {
      username = registeredUsername;
      console.log(`Now you are ${username}`);
    } else {
      const signature = signMessage(message, privateKey);
      socket.emit("message", {
        senderId: socket.id,
        username,
        message,
        signature,
      });
    }
  }
  rl.prompt();
});

socket.on("connect", () => {
  console.log("Connected to the server");
  if (!isReady) {
    askUsername();
  }
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  if (isReady) {
    console.log(`\nThere are currently ${users.size} users in the chat`);
    rl.prompt();
  }
});

socket.on("newUser", (data) => {
  const { username: newUser, publicKey: newPubKey } = data;
  users.set(newUser, newPubKey);
  if (isReady) {
    console.log(`\n${newUser} join the chat`);
    rl.prompt();
  }
});

socket.on("message", (data) => {
  if (!isReady) return;

  const { senderId, username: senderUsername, message: senderMessage, signature } = data;

  // Abaikan pesan yang dikirim oleh socket klien ini sendiri
  if (senderId && senderId === socket.id) {
    return;
  }

  const senderPublicKey = users.get(senderUsername);
  const isValid = verifyMessage(senderMessage, signature, senderPublicKey);

  if (isValid) {
    console.log(`\n${senderUsername}: ${senderMessage}`);
  } else {
    console.log(
      `\n[WARNING] This user is fake! Impersonation detected for "${senderUsername}".`
    );
    console.log(`Fake "${senderUsername}": ${senderMessage}`);
  }
  rl.prompt();
});

socket.on("disconnect", () => {
  console.log("\nServer disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});