================================================================================
DRIVER DROWSINESS DETECTION SYSTEM: Real-Time AI Driver Safety System
================================================================================

1. PROJECT OVERVIEW
-------------------
The Driver Drowsiness Detection System is a browser-based safety application 
designed to prevent road accidents caused by driver fatigue and distraction. 
Unlike traditional hardware systems that require expensive sensors, this system 
uses the device's built-in webcam and advanced Computer Vision (Google MediaPipe) 
to monitor the driver's state in real-time.

It runs entirely on the client-side (in the browser), ensuring that video data 
never leaves the user's device, preserving privacy and reducing latency.

2. KEY FEATURES
---------------
- Drowsiness Detection: Monitors eye closure (blinking duration) using EAR (Eye Aspect Ratio).
- Yawn Detection: Detects fatigue via mouth opening using MAR (Mouth Aspect Ratio).
- Distraction Detection: Detects if the driver turns their head left/right (Yaw).
- Sleep Posture Detection: Detects if the driver's head drops (Pitch).
- Seatbelt Simulation: A toggle to simulate seatbelt sensor integration.
- Emergency SOS: Automatically generates a WhatsApp location message if the driver is unresponsive.
- Real-time Analytics: Visualizes stress levels and event history (charts).
- Audio Alarm: Generates a siren sound using the Web Audio API (no external files needed).

3. PREREQUISITES
----------------
Before running the project, ensure you have the following installed:
- Node.js (Version 18 or higher recommended)
- npm (Node Package Manager - comes installed with Node.js)

4. INSTALLATION & SETUP COMMANDS
--------------------------------
Follow these steps to set up the project locally:

Step 1: Navigate to the project directory
   (Open your terminal/command prompt in the project folder)

Step 2: Install Dependencies
   Run the following command to install all required packages listed in package.json:
   
   npm install

   *Note: This installs React, MediaPipe, TailwindCSS, Recharts, and Lucide Icons.*

Step 3: Run the Application
   Start the local development server:
   
   npm run dev

Step 4: Open in Browser
   Once the server starts, the terminal will show a URL (usually http://localhost:5173).
   Ctrl + Click the link or type it into your browser (Chrome/Edge recommended).

5. HOW TO USE
-------------
1. Allow Permissions: When the app loads, click "Allow" when the browser asks to access the camera.
2. Calibration: Sit in front of the camera so your face is clearly visible and the green mesh appears.
3. Testing Alerts:
   - Close your eyes for 2 seconds -> "WAKE UP" Alarm.
   - Yawn widely -> "YAWNING" Alert.
   - Look away from the screen -> "DISTRACTED" Alert.
   - Drop your head -> "HEAD DOWN" Alert.
4. Configuration: Use the panel on the right to adjust sensitivity (Thresholds) or enable the SOS feature.
5. History: Scroll down (or look at the bottom panel) to see a graph of safety violations over time.

6. PROJECT STRUCTURE & LOGIC
----------------------------
- /src/App.tsx: 
  The main controller. Handles the webcam feed, loads the AI model, and runs the main loop.

- /src/utils/geometry.ts:
  Contains the math formulas. 
  - Calculates 3D Euclidean distance between facial landmarks.
  - Converts 4x4 Transformation Matrices into Euler Angles (Pitch/Yaw/Roll).

- /src/hooks/useSound.ts:
  Manages the audio alarm using the browser's AudioContext. It creates an oscillator that ramps frequency to mimic a siren.

- /src/components/:
  Contains the UI elements (ControlPanel, StatsPanel, HistoryPanel).

7. TECH STACK PACKAGES
----------------------
- @mediapipe/tasks-vision: The AI engine for Face Landmarking (478 points).
- react & react-dom: Frontend UI framework.
- vite: Build tool for fast performance.
- tailwindcss: Utility-first CSS for styling the dark-mode dashboard.
- recharts: For rendering the statistical graphs.
- lucide-react: For the iconography.

================================================================================
Developed for Driver Safety & Accident Prevention
================================================================================