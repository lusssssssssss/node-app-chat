const io = require("socket.io-client");
const crypto = require("crypto");
const readline = require("readline");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function generateHash(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

let username = "";
let targetUser = ""; // kosong = semua orang, atau isi "budi" untuk ke budi saja

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);

  rl.question("Enter your username: ", (name) => {
    username = name.trim() || "Anonymous";
    rl.question(
      "Send to specific user (leave blank for everyone, e.g. budi): ",
      (target) => {
        targetUser = target.trim();
        console.log(
          `Welcome, ${username}! Target: ${targetUser || "ALL"}. Type message and press Enter.`
        );
        promptMessage();
      }
    );
  });
});

function promptMessage() {
  rl.question("> ", (input) => {
    const message = input.trim();
    if (message.length > 0) {
      const hash = generateHash(message);

      socket.emit("message", {
        username,
        to: targetUser,
        message,
        hash,
      });
    }
    promptMessage();
  });
}

socket.on("message", (data) => {
  const { username: sender, to, message, hash } = data;

  // Jika pesan ditujukan ke user tertentu, hanya penerima tersebut (dan pengirim jika mau) yang menampilkan
  if (to && to !== username && sender !== username) {
    return;
  }

  // Pengirim tidak perlu melihat warning atas pesannya sendiri
  if (sender === username) {
    promptMessage();
    return;
  }

  if (!hash) {
    console.log(`\n[WARNING] ${sender}: ${message}`);
    console.log("  -> Hash missing! Message integrity cannot be verified.");
    promptMessage();
    return;
  }

  const computedHash = generateHash(message);

  if (computedHash !== hash) {
    console.log(`\n[WARNING] ${sender}: ${message}`);
    console.log(
      "  -> Warning: The message may have been changed during transmission!"
    );
  } else {
    console.log(`\n${sender}: ${message} [Verified]`);
  }

  promptMessage();
});

socket.on("disconnect", () => {
  console.log("\nDisconnected from server.");
});