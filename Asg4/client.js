const io = require("socket.io-client");
const crypto = require("crypto");
const readline = require("readline");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

// Generate RSA key pair (2048-bit) untuk klien ini
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

let targetUsername = "";
let username = "";
let isReady = false;
const users = new Map();

function encryptMessage(plainText, recipientPublicKey) {
  const encryptedBuffer = crypto.publicEncrypt(
    recipientPublicKey,
    Buffer.from(plainText, "utf8")
  );
  return encryptedBuffer.toString("base64");
}

function decryptMessage(cipherTextBase64, myPrivateKey) {
  const decryptedBuffer = crypto.privateDecrypt(
    myPrivateKey,
    Buffer.from(cipherTextBase64, "base64")
  );
  return decryptedBuffer.toString("utf8");
}

function askUsername() {
  rl.question("Enter your username: ", (input) => {
    const cleanName = input.trim();
    if (!cleanName) {
      return askUsername();
    }

    username = cleanName;
    isReady = true;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });
    rl.prompt();
  });
}

rl.on("line", (line) => {
  if (!isReady) return;

  const message = line.trim();
  if (message) {
    const match = message.match(/^!secret (\w+)$/);
    if (match) {
      targetUsername = match[1];
      if (!users.has(targetUsername)) {
        console.log(
          `Warning: "${targetUsername}" belum terdaftar di daftar public key.`
        );
      }
      console.log(`Now secretly chatting with ${targetUsername}`);
    } else if (message.match(/^!exit$/)) {
      console.log(`No more secretly chatting with ${targetUsername}`);
      targetUsername = "";
    } else {
      if (targetUsername) {
        const recipientPubKey = users.get(targetUsername);
        if (!recipientPubKey) {
          console.log(
            `Gagal mengirim: public key untuk "${targetUsername}" tidak ditemukan.`
          );
        } else {
          const encryptedPayload = encryptMessage(message, recipientPubKey);
          socket.emit("message", {
            username,
            targetUsername,
            message: encryptedPayload,
            encrypted: true,
          });
        }
      } else {
        socket.emit("message", {
          username,
          message,
          encrypted: false,
        });
      }
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

  const { username: senderUsername, message: senderMessage } = data;

  if (senderUsername !== username) {
    try {
      const decrypted = decryptMessage(senderMessage, privateKey);
      console.log(`\n${senderUsername}: ${decrypted}`);
    } catch (err) {
      // Kalau gagal didekripsi dengan privateKey kita (berarti bukan untuk kita / plaintext biasa)
      console.log(`\n${senderUsername}: ${senderMessage}`);
    }
    rl.prompt();
  }
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