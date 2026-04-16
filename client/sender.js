// =========================
// DOM ELEMENTS
// =========================

// Video input from webcam
const video = document.getElementById("video");

// Floating draggable image (controlled by gestures)
const floating = document.getElementById("floating");


// =========================
// GESTURE STABILITY VARIABLES
// =========================

// Frame counters to stabilize pinch detection
let pinchFrames = 0;
let releaseFrames = 0;

// Thresholds to confirm gesture (avoid flicker)
const PINCH_THRESHOLD = 4;     // frames required to confirm grab
const RELEASE_THRESHOLD = 6;   // frames required to confirm release

// Distance thresholds (hysteresis to prevent rapid toggling)
const PINCH_DISTANCE = 0.07;   // distance to detect pinch
const RELEASE_DISTANCE = 0.09; // distance to detect release (must be larger)


// =========================
// OPEN HAND (RELEASE) DETECTION
// =========================

let openFrames = 0;
const OPEN_THRESHOLD = 5; // frames required to confirm open hand


// =========================
// ANIMATION CONTROL
// =========================

// Prevents movement updates during drop animation
let isAnimating = false;


// =========================
// WEBSOCKET (TRANSFER SYSTEM)
// =========================

const socket = new WebSocket("ws://localhost:8081");

// Smooth cursor movement variables
let smoothX = 0;
let smoothY = 0;

// (Unused currently - can be used later for sliders or gestures)
let prevX = 0;
let sliderX = 0;

// Handle incoming data (receiver side logic placeholder)
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "TRANSFER") {
    const img = document.createElement("img");
    img.src = data.src;
    img.style.width = "150px";
    img.style.margin = "10px";
  }
};


// =========================
// MEDIAPIPE HAND SETUP
// =========================

const hands = new Hands({
  locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
  }
});

// Whether user is currently holding the object
let isHolding = false;

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});


// =========================
// MAIN HAND TRACKING LOOP
// =========================

hands.onResults((results) => {

  // If no hand detected → reset state safely
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    if (isHolding) {
      isHolding = false;
      floating.style.display = "none";
    }
    return;
  }

  const landmarks = results.multiHandLandmarks[0];

  // Key points: thumb tip & index tip
  const thumb = landmarks[4];
  const index = landmarks[8];

  // Z-axis (depth) → used for 3D effect
  const z = index.z;

  // Distance between thumb & index → pinch detection
  const dist = Math.hypot(
    thumb.x - index.x,
    thumb.y - index.y
  );

  // Convert normalized coordinates → screen coordinates
  const x = (1 - index.x) * window.innerWidth;
  const y = index.y * window.innerHeight;

  // =========================
  // SMOOTH MOVEMENT (LERP)
  // =========================

  smoothX = smoothX * 0.85 + x * 0.15;
  smoothY = smoothY * 0.85 + y * 0.15;


  // =========================
  // DEPTH → SCALE CONVERSION
  // =========================

  // Clamp depth for stability
  let depth = Math.min(Math.max(-z, 0.05), 0.3);

  // Convert depth into scale
  let scale = 1 + (depth * 2.5);


  // =========================
  // HAND OPEN DETECTION
  // =========================

  function isHandOpen(landmarks) {
    return (
      landmarks[8].y < landmarks[6].y &&   // index finger
      landmarks[12].y < landmarks[10].y && // middle
      landmarks[16].y < landmarks[14].y && // ring
      landmarks[20].y < landmarks[18].y    // pinky
    );
  }

  const openHand = isHandOpen(landmarks);


  // =========================
  // PINCH DETECTION (HYSTERESIS)
  // =========================

  let isPinching = false;

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
  // PICK OBJECT
  // =========================

  if (isPinching && !isHolding) {
    isHolding = true;

    // Show object
    floating.style.display = "block";

    // Small pop effect when picked
    floating.style.transform += " scale(1.2)";
  }


  // =========================
  // MOVE OBJECT (ONLY WHEN HOLDING)
  // =========================

  if (isHolding && !isAnimating) {

    // Slight tilt based on hand position (3D feel)
    let rotateX = (0.5 - index.y) * 15;
    let rotateY = (index.x - 0.5) * 15;

    let finalScale = scale + 0.2;

    // Apply transform (position handled separately)
    floating.style.transform =
      `translate(-50%, -50%) 
       scale(${finalScale}) 
       rotateX(${rotateX}deg) 
       rotateY(${rotateY}deg)`;

    // Move object
    floating.style.left = `${smoothX}px`;
    floating.style.top = `${smoothY}px`;

    // Dynamic shadow (depth-based realism)
    floating.style.boxShadow =
      `0 ${10 + depth * 60}px ${20 + depth * 80}px rgba(0,0,0,0.4)`;
  }


  // =========================
  // OPEN HAND → RELEASE DETECTION
  // =========================

  if (openHand) {
    openFrames++;
  } else {
    openFrames = 0;
  }


  // =========================
  // RELEASE WITH ANIMATION
  // =========================

  if (openFrames > OPEN_THRESHOLD && isHolding && !isAnimating) {

    isHolding = false;
    isAnimating = true;
    openFrames = 0;

    // Freeze position before animation
    const rect = floating.getBoundingClientRect();

    floating.style.left = `${rect.left + rect.width / 2}px`;
    floating.style.top = `${rect.top + rect.height / 2}px`;

    // Smooth easing animation
    floating.style.transition = "all 0.5s cubic-bezier(0.22, 1, 0.36, 1)";

    // Drop + shrink + fade effect
    floating.style.transform =
      "translate(-50%, -50%) scale(0.4) translateY(120px)";
    floating.style.opacity = "0";

    setTimeout(() => {

      // =========================
      // SEND IMAGE TO OTHER DEVICE
      // =========================

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

      // Reset UI state
      floating.style.display = "none";
      floating.style.opacity = "1";
      floating.style.transform = "translate(-50%, -50%) scale(1)";
      floating.style.transition = "none";

      isAnimating = false;

    }, 500);
  }

});


// =========================
// CAMERA INITIALIZATION
// =========================

const camera = new Camera(video, {
  onFrame: async () => {
    // Send video frame to MediaPipe
    await hands.send({ image: video });
  },
  width: 640,
  height: 480
});

// Start camera
camera.start();