const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8081 });

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", (message) => {

    // Broadcast to all clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });

  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

console.log("Server running on ws://localhost:8081");