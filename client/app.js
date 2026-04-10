const video = document.getElementById("video");
const floating = document.getElementById("floating");

// WebSocket
const socket = new WebSocket("ws://localhost:8081");
let smoothX = 0;
let smoothY = 0; // (recommended for vertical too)

let prevX = 0;
let sliderX = 0;
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "TRANSFER") {
    const img = document.createElement("img");
    img.src = data.src;
    img.style.width = "150px";
    img.style.margin = "10px";
  }
};

// Setup camera
const hands = new Hands({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
  }
});

let isHolding = false;

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

let prevPinch = false;

hands.onResults((results) => {

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

  const landmarks = results.multiHandLandmarks[0];

  const thumb = landmarks[4];
  const index = landmarks[8];

  const dist = Math.hypot(
    thumb.x - index.x,
    thumb.y - index.y
  );

  const x = (1 - index.x) * window.innerWidth;
  const y = index.y * window.innerHeight;

  // Smooth movement
  smoothX = smoothX * 0.85 + x * 0.15;
  smoothY = smoothY * 0.85 + y * 0.15;

  // Stable pinch detection (IMPORTANT)
  const isPinching = dist < 0.07;

  // =========================
  // PICK (ONLY ONCE)
  // =========================
  if (isPinching && !prevPinch && !isHolding) {
    isHolding = true;
    floating.style.display = "block";
  }

  // =========================
  // MOVE
  // =========================
  if (isHolding) {
    floating.style.left = `${smoothX}px`;
    floating.style.top = `${smoothY}px`;
  }

  // =========================
  // RELEASE (ONLY ONCE)
  // =========================
  if (!isPinching && prevPinch && isHolding) {

    isHolding = false;
    floating.style.display = "none";

    //  SEND IMAGE
    const img = new Image();
    img.src = floating.src;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);

      const base64 = canvas.toDataURL("image/png");

      socket.send(JSON.stringify({
        type: "TRANSFER",
        src: base64
      }));
    };
  }

  // update state
  prevPinch = isPinching;
});

const camera = new Camera(video, {
  onFrame: async () => {
    await hands.send({ image: video });
  },
  width: 640,
  height: 480
});

camera.start();