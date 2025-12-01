export interface DetectionConfig {
  earThreshold: number; // Eye Aspect Ratio (Drowsiness)
  marThreshold: number; // Mouth Aspect Ratio (Yawning)
  yawThreshold: number; // Head Turn (Distraction) in degrees
  pitchThreshold: number; // Head Down (Sleep) in degrees
  timeToTrigger: number; // Seconds to wait before alarm
}

export interface EmergencyConfig {
  enabled: boolean;
  contactName: string;
  contactNumber: string;
  cooldown: number; // Seconds to wait before sending another SMS
}

export interface DetectionState {
  isDrowsy: boolean;
  isYawning: boolean;
  isDistracted: boolean; // Side looking
  isAsleepPosture: boolean; // Head down
  isSeatbeltOff: boolean; // New Seatbelt State
  ear: number;
  mar: number;
  yaw: number;
  pitch: number;
  // New Analytics
  blinkRate: number; // EAR per minute
  yawnRate: number;  // Yawns per minute
  stressLevel: number; // Calculated 0-100%
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type EventType = 'drowsy' | 'yawn' | 'distraction' | 'posture' | 'seatbelt' | 'sos';

export interface HistoryEvent {
  id: string;
  type: EventType;
  timestamp: number;
}