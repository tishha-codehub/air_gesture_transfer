const video = document.getElementById("video");
const floating = document.getElementById("floating");

let pinchFrames = 0;
let releaseFrames = 0;

const PINCH_THRESHOLD = 4;     // frames to confirm grab
const RELEASE_THRESHOLD = 6;   // frames to confirm release

const PINCH_DISTANCE = 0.07;   // grab
const RELEASE_DISTANCE = 0.09; // release (IMPORTANT: bigger than pinch)

let openFrames = 0;
const OPEN_THRESHOLD = 5;

let isAnimating = false;

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

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    if (isHolding) {
      isHolding = false;
      floating.style.display = "none";
    }
    return;
  }
  const landmarks = results.multiHandLandmarks[0];

  const thumb = landmarks[4];
  const index = landmarks[8];

  const z = index.z; // depth (negative = closer)
  const dist = Math.hypot(
    thumb.x - index.x,
    thumb.y - index.y
  );

  const x = (1 - index.x) * window.innerWidth;
  const y = index.y * window.innerHeight;

  // Smooth movement
  smoothX = smoothX * 0.85 + x * 0.15;
  smoothY = smoothY * 0.85 + y * 0.15;

  // Normalize Z (IMPORTANT)
  let depth = Math.min(Math.max(-z, 0.05), 0.3);

  // Convert to scale
  let scale = 1 + (depth * 2.5);
  // Stable pinch detection (IMPORTANT)
  let isPinching = false;

  function isHandOpen(landmarks) {
    return (
      landmarks[8].y < landmarks[6].y &&   // index
      landmarks[12].y < landmarks[10].y && // middle
      landmarks[16].y < landmarks[14].y && // ring
      landmarks[20].y < landmarks[18].y    // pinky
    );
  }
  const openHand = isHandOpen(landmarks);
  // Hysteresis logic (very important)
  if (dist < PINCH_DISTANCE) {
    pinchFrames++;
    releaseFrames = 0;
  } else if (dist > RELEASE_DISTANCE) {
    releaseFrames++;
    pinchFrames = 0;
  }

  // Confirm pinch
  if (pinchFrames > PINCH_THRESHOLD) {
    isPinching = true;
  }

  // Confirm release
  if (releaseFrames > RELEASE_THRESHOLD) {
    isPinching = false;
  }

  // =========================
  // PICK (ONLY ONCE)
  // =========================
  if (isPinching && !isHolding) {
    isHolding = true;
    floating.style.display = "block";
    floating.style.transform += " scale(1.2)";
  }

  // =========================
  // MOVE
  // =========================
  if (isHolding && !isAnimating) {

    let rotateX = (0.5 - index.y) * 15;
    let rotateY = (index.x - 0.5) * 15;

    let finalScale = scale + 0.2;

    floating.style.transform =
      `translate(-50%, -50%) 
     scale(${finalScale}) 
     rotateX(${rotateX}deg) 
     rotateY(${rotateY}deg)`;

    floating.style.left = `${smoothX}px`;
    floating.style.top = `${smoothY}px`;

    floating.style.boxShadow =
      `0 ${10 + depth * 60}px ${20 + depth * 80}px rgba(0,0,0,0.4)`;
  }

  // =========================
  // RELEASE (ONLY ONCE)
  // =========================
  // Detect stable open hand
  if (openHand) {
    openFrames++;
  } else {
    openFrames = 0;
  }

  // RELEASE with animation
  if (openFrames > OPEN_THRESHOLD && isHolding && !isAnimating) {

    isHolding = false;
    isAnimating = true;
    openFrames = 0;

    // Freeze position BEFORE animation
    const rect = floating.getBoundingClientRect();

    floating.style.left = `${rect.left + rect.width / 2}px`;
    floating.style.top = `${rect.top + rect.height / 2}px`;

    floating.style.transition = "all 0.5s cubic-bezier(0.22, 1, 0.36, 1)";

    // 🎬 Smooth drop animation
    floating.style.transform =
      "translate(-50%, -50%) scale(0.4) translateY(120px)";
    floating.style.opacity = "0";

    setTimeout(() => {

      // SEND IMAGE (same as your code)
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

      // Reset
      floating.style.display = "none";
      floating.style.opacity = "1";
      floating.style.transform = "translate(-50%, -50%) scale(1)";
      floating.style.transition = "none";

      isAnimating = false;

    }, 500);
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