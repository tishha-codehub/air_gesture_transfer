// Receiver-side WebSocket only (NO gesture logic)

const socket = new WebSocket("ws://192.168.29.189:8081");

const box = document.getElementById("box");

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "TRANSFER") {

    // Glow effect
    box.classList.add("active");

    // Clear previous content
    box.innerHTML = "";

    // Create image
    const img = document.createElement("img");
    img.src = data.src;

    box.appendChild(img);

    // Remove glow after animation
    setTimeout(() => {
      box.classList.remove("active");
    }, 800);
  }
};