import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import ControlPanel from './components/ControlPanel';
import StatsPanel from './components/StatsPanel';
import HistoryPanel from './components/HistoryPanel';
import { DetectionConfig, DetectionState, HistoryEvent, EventType, EmergencyConfig } from './types';
import { calculateEAR, calculateMAR, extractEulerAngles, LEFT_EYE_INDICES, RIGHT_EYE_INDICES } from './utils/geometry';
import { useSound } from './hooks/useSound';
import { MessageSquareWarning, Send, MessageCircle } from 'lucide-react';

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { playAlarm, stopAlarm } = useSound();
  
  // Timers to track duration of events for ALARMS
  const drowsyTimerRef = useRef<number>(0);
  const yawnTimerRef = useRef<number>(0);
  const distractTimerRef = useRef<number>(0);
  const postureTimerRef = useRef<number>(0);
  
  // Critical Timer for SOS
  const criticalSosTimerRef = useRef<number>(0);
  const lastSmsTimeRef = useRef<number>(0);

  const lastTimeRef = useRef<number>(0);

  // Analytics State (Rolling 1 minute window)
  const blinkTimestampsRef = useRef<number[]>([]);
  const yawnTimestampsRef = useRef<number[]>([]);
  const wasClosedRef = useRef<boolean>(false);
  const wasYawningRef = useRef<boolean>(false);
  
  // Track previous state for "Rising Edge" detection of alarms
  const prevAlarmState = useRef({
    isDrowsy: false,
    isYawning: false,
    isDistracted: false,
    isAsleepPosture: false,
    isSeatbeltOff: false
  });

  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  
  const [config, setConfig] = useState<DetectionConfig>({
    earThreshold: 0.22,
    marThreshold: 0.60,
    yawThreshold: 45, // Degrees for turning head side to side
    pitchThreshold: 25, // Degrees for looking down
    timeToTrigger: 1.5,
  });

  const [emergencyConfig, setEmergencyConfig] = useState<EmergencyConfig>({
    enabled: false,
    contactName: 'Emergency Contact',
    contactNumber: '',
    cooldown: 30 // Seconds
  });

  // Seatbelt Simulation State
  const [simulateSeatbeltOff, setSimulateSeatbeltOff] = useState(false);
  const [sosNotification, setSosNotification] = useState<{show: boolean, step: 'sending' | 'sent'}>({ show: false, step: 'sending' });

  const [detectionState, setDetectionState] = useState<DetectionState>({
    isDrowsy: false,
    isYawning: false,
    isDistracted: false,
    isAsleepPosture: false,
    isSeatbeltOff: false,
    ear: 0,
    mar: 0,
    yaw: 0,
    pitch: 0,
    blinkRate: 0,
    yawnRate: 0,
    stressLevel: 0
  });

  // History State
  const [history, setHistory] = useState<HistoryEvent[]>([]);

  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Load history from local storage on mount and seed if empty
  useEffect(() => {
    const saved = localStorage.getItem('sentinel_history');
    if (saved) {
      setHistory(JSON.parse(saved));
    } else {
        // Seed dummy data for demonstration if empty
        const dummyEvents: HistoryEvent[] = [];
        const now = Date.now();
        const types: EventType[] = ['drowsy', 'yawn', 'distraction', 'posture', 'seatbelt'];
        
        // Generate random events over the last 7 days
        for(let i=0; i<50; i++) {
            const randomTime = now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);
            const randomType = types[Math.floor(Math.random() * types.length)];
            dummyEvents.push({
                id: Math.random().toString(36).substr(2, 9),
                type: randomType,
                timestamp: randomTime
            });
        }
        setHistory(dummyEvents);
        localStorage.setItem('sentinel_history', JSON.stringify(dummyEvents));
    }
  }, []);

  const addHistoryEvent = (type: EventType) => {
    const newEvent: HistoryEvent = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        timestamp: Date.now()
    };
    
    setHistory(prev => {
        const updated = [...prev, newEvent];
        // Keep only last 1000 events to save space
        if(updated.length > 1000) updated.shift();
        localStorage.setItem('sentinel_history', JSON.stringify(updated));
        return updated;
    });
  };

  const clearHistory = () => {
      setHistory([]);
      localStorage.removeItem('sentinel_history');
  };

  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    let faceLandmarker: FaceLandmarker | null = null;
    let animationFrameId: number;

    const setupVision = async () => {
      try {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        setLoading(false);
        startWebcam(faceLandmarker);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    setupVision();

    return () => {
      if (faceLandmarker) faceLandmarker.close();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once (ignoring config dependencies for setup)

  const startWebcam = async (landmarker: FaceLandmarker) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', () => {
          predictWebcam(landmarker);
        });
      }
    } catch (err) {
      console.error("Camera permission denied", err);
      setPermissionError(true);
    }
  };

  // Use refs for items accessed inside requestAnimationFrame
  const simulateSeatbeltRef = useRef(simulateSeatbeltOff);
  useEffect(() => { simulateSeatbeltRef.current = simulateSeatbeltOff; }, [simulateSeatbeltOff]);
  
  const emergencyConfigRef = useRef(emergencyConfig);
  useEffect(() => { emergencyConfigRef.current = emergencyConfig; }, [emergencyConfig]);

  // Helper to get clean links for SMS
  const getSOSLinks = () => {
    // WhatsApp requires pure digits (including country code), no '+' or spaces
    const waNumber = emergencyConfigRef.current.contactNumber.replace(/[^0-9]/g, '');
    
    const message = `EMERGENCY: Driver is unresponsive/drowsy. Current Location: https://maps.google.com/?q=40.7128,-74.0060`;
    const encodedMessage = encodeURIComponent(message);
    
    return {
      whatsapp: `https://wa.me/${waNumber}?text=${encodedMessage}`
    };
  };

  const triggerSOS = () => {
    const now = Date.now();
    // Cooldown check
    if (now - lastSmsTimeRef.current < emergencyConfigRef.current.cooldown * 1000) return;
    
    lastSmsTimeRef.current = now;
    addHistoryEvent('sos');

    // Get Links
    const { whatsapp } = getSOSLinks();
    
    // Direct Trigger: Open WhatsApp Web in new tab
    // Note: Popup blockers might catch this since it's inside an async timer, 
    // but the UI overlay provides a backup click.
    window.open(whatsapp, '_blank');

    // Update UI to show state
    setSosNotification({ show: true, step: 'sent' });
    
    // Auto hide after 8 seconds
    setTimeout(() => {
        setSosNotification({ show: false, step: 'sending' });
    }, 8000);
  };

  const predictWebcam = (landmarker: FaceLandmarker) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if(!ctx) return;

    const drawingUtils = new DrawingUtils(ctx);

    const processFrame = (time: number) => {
      // Delta time for timers
      const deltaTime = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      const now = Date.now(); // Use real time for analytics window

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        // Resize canvas to match video
        if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        const results = landmarker.detectForVideo(video, time);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          const matrix = results.facialTransformationMatrixes?.[0];

          // 1. Draw Mesh
          drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: '#C0C0C070', lineWidth: 1 });
          drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: '#FF3030', lineWidth: 2 });
          drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: '#30FF30', lineWidth: 2 });

          // 2. Calculations
          // EAR
          const leftEAR = calculateEAR(landmarks, LEFT_EYE_INDICES);
          const rightEAR = calculateEAR(landmarks, RIGHT_EYE_INDICES);
          const avgEAR = (leftEAR + rightEAR) / 2;

          // MAR
          const mar = calculateMAR(landmarks);

          // Head Pose
          let pitch = 0, yaw = 0;
          if (matrix) {
             const angles = extractEulerAngles(matrix.data);
             pitch = angles.pitch;
             yaw = angles.yaw;
          }

          // 3. Analytics (Rolling Window Logic)
          
          // Blink Counter (EAR/m)
          const isClosed = avgEAR < config.earThreshold;
          if (isClosed && !wasClosedRef.current) {
            blinkTimestampsRef.current.push(now);
          }
          wasClosedRef.current = isClosed;

          // Yawn Counter (YAWN/m)
          const isYawningCurrent = mar > config.marThreshold;
          if (isYawningCurrent && !wasYawningRef.current) {
            yawnTimestampsRef.current.push(now);
          }
          wasYawningRef.current = isYawningCurrent;

          const oneMinuteAgo = now - 60000;
          blinkTimestampsRef.current = blinkTimestampsRef.current.filter(t => t > oneMinuteAgo);
          yawnTimestampsRef.current = yawnTimestampsRef.current.filter(t => t > oneMinuteAgo);

          const blinkRate = blinkTimestampsRef.current.length;
          const yawnRate = yawnTimestampsRef.current.length;

          const calculatedStress = Math.min(100, Math.round((blinkRate * 1.5) + (yawnRate * 15)));


          // 4. Logic & State Updates (Instantaneous Alarms)
          
          if (avgEAR < config.earThreshold) {
             drowsyTimerRef.current += deltaTime;
          } else {
             drowsyTimerRef.current = 0;
          }

          if (mar > config.marThreshold) {
            yawnTimerRef.current += deltaTime;
          } else {
            yawnTimerRef.current = 0;
          }

          if (Math.abs(yaw) > config.yawThreshold) {
            distractTimerRef.current += deltaTime;
          } else {
            distractTimerRef.current = 0;
          }

          if (Math.abs(pitch) > config.pitchThreshold) {
            postureTimerRef.current += deltaTime;
          } else {
            postureTimerRef.current = 0;
          }

          // Determine Trigger Status
          const isDrowsy = drowsyTimerRef.current > config.timeToTrigger;
          const isYawning = yawnTimerRef.current > config.timeToTrigger;
          const isDistracted = distractTimerRef.current > config.timeToTrigger;
          const isAsleepPosture = postureTimerRef.current > config.timeToTrigger;
          
          // Seatbelt Logic (Using Simulation Ref)
          const isSeatbeltOff = simulateSeatbeltRef.current;

          // ---------------- SOS LOGIC ----------------
          // If already alarmed for drowsy/asleep, increment Critical Timer
          // We wait 5 seconds AFTER the initial alarm (Total ~6.5s unresponsive)
          if ((isDrowsy || isAsleepPosture) && emergencyConfigRef.current.enabled) {
              criticalSosTimerRef.current += deltaTime;
              if (criticalSosTimerRef.current > 5.0) {
                  triggerSOS();
                  criticalSosTimerRef.current = 0; // Reset so we don't spam endlessly, relies on cooldown
              }
          } else {
              criticalSosTimerRef.current = 0;
          }
          // -------------------------------------------

          // LOG HISTORY
          if (isDrowsy && !prevAlarmState.current.isDrowsy) addHistoryEvent('drowsy');
          if (isYawning && !prevAlarmState.current.isYawning) addHistoryEvent('yawn');
          if (isDistracted && !prevAlarmState.current.isDistracted) addHistoryEvent('distraction');
          if (isAsleepPosture && !prevAlarmState.current.isAsleepPosture) addHistoryEvent('posture');
          if (isSeatbeltOff && !prevAlarmState.current.isSeatbeltOff) addHistoryEvent('seatbelt');

          prevAlarmState.current = { isDrowsy, isYawning, isDistracted, isAsleepPosture, isSeatbeltOff };


          // Update React State
          setDetectionState({
            isDrowsy,
            isYawning,
            isDistracted,
            isAsleepPosture,
            isSeatbeltOff,
            ear: avgEAR,
            mar: mar,
            yaw: yaw,
            pitch: pitch,
            blinkRate,
            yawnRate,
            stressLevel: calculatedStress
          });

          // 5. Alert Logic
          if (isDrowsy || isDistracted || isAsleepPosture || isYawning || isSeatbeltOff) {
             playAlarm();
             let msg = "";
             if (isSeatbeltOff) msg = "SEATBELT NOT DETECTED!";
             else if (isDrowsy) msg = "WAKE UP! EYES CLOSED";
             else if (isAsleepPosture) msg = "HEAD DOWN DETECTED";
             else if (isDistracted) msg = "DISTRACTED! LOOK AHEAD";
             else if (isYawning) msg = "YAWNING DETECTED";
             setAlertMessage(msg);
          } else {
             stopAlarm();
             setAlertMessage(null);
          }

        }
      }
      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  };

  return (
    <div className={`min-h-screen bg-slate-900 text-white font-sans selection:bg-blue-500 selection:text-white ${alertMessage ? 'animate-pulse bg-red-900/20' : ''}`}>
      
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700 h-16 flex items-center px-6 justify-between">
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
           <h1 className="text-xl font-bold tracking-widest uppercase">DRIVER <span className="text-blue-500">DROWSINESS</span></h1>
        </div>
        <div className="text-sm font-mono text-slate-400">
          v2.5.0 | Client-Side AI
        </div>
      </header>

      {/* SOS NOTIFICATION OVERLAY */}
      {sosNotification.show && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-md px-4">
            <div className={`bg-slate-900 border-2 ${sosNotification.step === 'sending' ? 'border-yellow-500' : 'border-green-500'} rounded-lg shadow-2xl overflow-hidden`}>
                <div className={`${sosNotification.step === 'sending' ? 'bg-yellow-500/20' : 'bg-green-500/20'} p-4 flex items-center gap-4`}>
                    {sosNotification.step === 'sending' ? (
                        <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                    ) : (
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                            <Send size={16} className="text-white" />
                        </div>
                    )}
                    <div>
                        <h4 className="font-bold text-lg text-white">
                            {sosNotification.step === 'sending' ? 'Initiating SOS Protocol...' : 'SOS TRIGGERED'}
                        </h4>
                        <p className="text-sm text-slate-300">
                            {sosNotification.step === 'sending' 
                                ? `Preparing emergency packet...` 
                                : `Opening WhatsApp for ${emergencyConfig.contactName}...`}
                        </p>
                    </div>
                </div>
                {sosNotification.step === 'sent' && (
                    <div className="bg-slate-800 p-4 border-t border-slate-700 flex flex-col gap-3">
                        <div className="text-xs text-slate-400 mb-1">If WhatsApp didn't open, click below:</div>
                        {/* Only WhatsApp Button */}
                        <a 
                            href={getSOSLinks().whatsapp}
                            target="_blank" 
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3 rounded font-bold transition-colors text-sm w-full"
                        >
                            <MessageCircle size={18} /> Open WhatsApp
                        </a>
                    </div>
                )}
            </div>
        </div>
      )}

      <main className="pt-20 px-4 pb-8 max-w-7xl mx-auto h-screen flex flex-col">
        
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow h-full overflow-y-auto pb-10">
            
            {/* Video Feed Section (Left 2/3) */}
            <div className="lg:col-span-2 flex flex-col gap-4 relative">
                <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700 bg-black shadow-2xl aspect-video shrink-0">
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-900">
                            <div className="flex flex-col items-center">
                                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="text-blue-400 font-mono animate-pulse">Initializing Vision Engine...</p>
                            </div>
                        </div>
                    )}
                    {permissionError && (
                         <div className="absolute inset-0 flex items-center justify-center z-20 bg-slate-900">
                            <p className="text-red-500 font-bold text-xl">Camera Permission Denied</p>
                         </div>
                    )}
                    
                    {/* Alarm Overlay */}
                    {alertMessage && (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-red-600/30 backdrop-blur-sm border-4 border-red-500 animate-pulse">
                            <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] text-center">
                                {alertMessage}
                            </h2>
                        </div>
                    )}

                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" // Mirror effect
                    />
                    <canvas 
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" // Mirror effect
                    />
                    
                    {/* Overlay Info */}
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur px-3 py-1 rounded text-xs font-mono text-slate-300">
                        {detectionState.isDrowsy ? <span className="text-red-500 font-bold">DROWSY</span> : <span className="text-green-500">ACTIVE</span>}
                        <span className="mx-2">|</span>
                        FPS: {Math.round(1000 / (performance.now() - lastTimeRef.current))}
                    </div>
                </div>

                {/* Real-time Stats */}
                <StatsPanel state={detectionState} config={config} />

                {/* Historical Charts */}
                <HistoryPanel events={history} onClearHistory={clearHistory} />
            </div>

            {/* Sidebar Controls (Right 1/3) */}
            <div className="lg:col-span-1 h-full">
                <ControlPanel 
                  config={config} 
                  setConfig={setConfig} 
                  emergencyConfig={emergencyConfig}
                  setEmergencyConfig={setEmergencyConfig}
                  simulateSeatbelt={simulateSeatbeltOff} 
                  setSimulateSeatbelt={setSimulateSeatbeltOff} 
                />
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;