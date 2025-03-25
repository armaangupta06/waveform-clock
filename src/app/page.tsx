"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import * as Tone from "tone";

// Dynamically import the P5 wrapper to avoid SSR issues
const ReactP5Wrapper = dynamic(
  () => import("react-p5-wrapper").then((mod) => mod.ReactP5Wrapper),
  { ssr: false }
);

type FrequencyUnit = {
  id: string;
  label: string;
  frequency: number; // This is now only used as a fallback for custom units
  amplitude: number;
  color: string;
  phase: number;
};

export default function Home() {
  // DOM ref for the canvas container
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // Fixed zoom level and pan offset for the canvas
  const zoomLevel = 2.5;
  const panOffset = { x: 0, y: 0 };

  // Sound state and volume control
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [volume, setVolume] = useState(-12);
  
  // Define all available frequency units
  const allFrequencyUnits: FrequencyUnit[] = [
    { id: "seconds", label: "Seconds", frequency: 1, amplitude: 25, color: "#B8C0FF", phase: 0 },
    { id: "minutes", label: "Minutes", frequency: 1/60, amplitude: 80, color: "#FFB8D9", phase: 0 },
    { id: "hours", label: "Hours", frequency: 1/3600, amplitude: 100, color: "#FFD8B8", phase: 0 },
    { id: "days", label: "Days", frequency: 1/86400, amplitude: 200, color: "#D8B8FF", phase: 0 },
  ];
  
  // State for active frequency units
  const [frequencies, setFrequencies] = useState<FrequencyUnit[]>([...allFrequencyUnits]);
  
  // State for removed frequency units that can be added back
  const [removedFrequencies, setRemovedFrequencies] = useState<FrequencyUnit[]>([]);
  
  // State for dropdown visibility
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // Ref to hold the latest frequencies array for use in the sketch
  const frequenciesRef = useRef(frequencies);
  useEffect(() => {
    frequenciesRef.current = frequencies;
  }, [frequencies]);
  
  // Ref to hold the latest sound state for use inside the sketch
  const isSoundOnRef = useRef(isSoundOn);
  useEffect(() => {
    isSoundOnRef.current = isSoundOn;
  }, [isSoundOn]);
  
  // Tone.js audio references
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const delayRef = useRef<Tone.FeedbackDelay | null>(null);
  const limiterRef = useRef<Tone.Limiter | null>(null);
  
  // Voice tracking
  const activeNotesRef = useRef<Map<string, number>>(new Map());
  
  // Transition state tracking
  const transitionsRef = useRef<{
    fadeTime: number;
    transitionDuration: number;
    fadingIn: string[];
    fadingOut: string[];
    lastFrequencyChange: number;
  }>({ 
    fadeTime: 0,
    transitionDuration: 1.2, // seconds
    fadingIn: [],
    fadingOut: [], 
    lastFrequencyChange: 0
  });
  
  // Refs for time synchronization
  const p5TimeRef = useRef<number>(0); // Tracks p5's time
  const toneTimeOffsetRef = useRef<number>(0); // Offset between p5 and Tone.js time
  
  // Initialize Tone.js audio chain once
  useEffect(() => {
    // Create effects - subtle chorus for richness, reverb for space, and delay for depth
    chorusRef.current = new Tone.Chorus({
      frequency: 1.5,
      delayTime: 3.5,
      depth: 0.5,  // Slightly reduced depth for subtlety
      type: "sine",
      wet: 0.25    // Slightly reduced for a more natural sound
    }).start();
    
    reverbRef.current = new Tone.Reverb({
      decay: 3,    // Shorter decay for clarity
      wet: 0.18,   // Subtle reverb
      preDelay: 0.05 // Quicker pre-delay for tighter sound
    });
    
    delayRef.current = new Tone.FeedbackDelay({
      delayTime: "16n", // Shorter delay time for a tighter sound
      feedback: 0.15,   // Less feedback to avoid muddiness
      wet: 0.15         // Subtle delay
    });
    
    limiterRef.current = new Tone.Limiter(-3);
    
    // Create a sophisticated polyphonic synthesizer with options
    synthRef.current = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: "sine8" // More harmonics than a basic sine for a richer timbre
      },
      envelope: {
        attack: 0.05,
        decay: 0.3,
        sustain: 0.6,
        release: 1.2
      }
    }).chain(
      chorusRef.current,
      delayRef.current,
      reverbRef.current,
      limiterRef.current,
      Tone.Destination
    );
    
    // Set initial volume
    if (synthRef.current) {
      synthRef.current.volume.value = volume;
    }
    
    return () => {
      // Clean up audio resources
      synthRef.current?.dispose();
      chorusRef.current?.dispose();
      reverbRef.current?.dispose();
      delayRef.current?.dispose();
      limiterRef.current?.dispose();
    };
  }, []);
  
  // Update synth volume when volume state changes
  useEffect(() => {
    if (synthRef.current) {
      synthRef.current.volume.value = volume;
    }
  }, [volume]);
  
  // Handler to add a specific frequency back from the removed list
  const handleAddFrequency = (frequencyToAdd: FrequencyUnit) => {
    // Mark this frequency as transitioning in for sound effect
    transitionsRef.current.lastFrequencyChange = Tone.now() as number;
    transitionsRef.current.fadingIn.push(frequencyToAdd.id);
    
    // Add the frequency back to active frequencies
    setFrequencies(prev => [...prev, frequencyToAdd]);
    
    // Remove it from the removed frequencies list
    setRemovedFrequencies(prev => prev.filter(f => f.id !== frequencyToAdd.id));
    
    // Close the dropdown
    setIsDropdownOpen(false);
    
    // Clear transition tracking after the full duration
    setTimeout(() => {
      transitionsRef.current.fadingIn = transitionsRef.current.fadingIn.filter(
        fid => fid !== frequencyToAdd.id
      );
    }, transitionsRef.current.transitionDuration * 1000);
  };
  
  // Handler to remove a frequency by id
  const handleRemoveFrequency = (id: string) => {
    // Find the frequency being removed
    const frequencyToRemove = frequencies.find(f => f.id === id);
    
    if (frequencyToRemove) {
      // Mark this frequency as transitioning out for sound effect
      transitionsRef.current.lastFrequencyChange = Tone.now() as number;
      transitionsRef.current.fadingOut.push(id);
      
      // Add to removed frequencies list with slight delay for transition to start
      setTimeout(() => {
        setRemovedFrequencies(prev => [...prev, frequencyToRemove]);
        
        // Remove from active frequencies
        setFrequencies(prev => prev.filter(unit => unit.id !== id));
        
        // Clear transition tracking after the full duration
        setTimeout(() => {
          transitionsRef.current.fadingOut = transitionsRef.current.fadingOut.filter(
            fid => fid !== id
          );
        }, transitionsRef.current.transitionDuration * 800); // Most of the transition time in ms
      }, 50); // Short delay to allow the transition effect to begin before the visual change
    }
  };
  
  // Toggle dropdown visibility
  const toggleDropdown = () => {
    setIsDropdownOpen(prev => !prev);
  };

  // Memoize the sketch function so it isn’t redefined on each re-render.
  const sketch = useCallback((p5: any) => {
    // Local variables that persist across frames
    let prevTime = 0;
    let animationOffset = 0;
    
    p5.setup = () => {
      p5.createCanvas(p5.windowWidth, p5.windowHeight);
      p5.frameRate(60);
      p5.noFill();
      p5.strokeWeight(3);
      p5.strokeJoin(p5.ROUND);
      p5.strokeCap(p5.ROUND);
    };
    
    p5.windowResized = () => {
      p5.resizeCanvas(p5.windowWidth, p5.windowHeight);
    };
    
    p5.draw = () => {
      // Use p5's time base for visual consistency (used as fallback)
      const t = p5.millis() / 1000;
      p5TimeRef.current = t;
      
      // Calculate time delta for smooth animation (fallback use)
      const currentTime = t;
      const deltaTime = currentTime - prevTime;
      prevTime = currentTime;
      
      // Increment animation offset (if needed for other effects)
      animationOffset += deltaTime * 0.5;
      
      // Get current system time for synchronization
      const now = new Date();
      const ms = now.getMilliseconds();
      const secFraction = ms / 1000; // fraction of the current second
      const secInMinute = now.getSeconds() + secFraction;
      const minuteFraction = secInMinute / 60; // fraction of the current minute
      const minInHour = now.getMinutes() + minuteFraction;
      const hourFraction = minInHour / 60; // fraction of the current hour
      const hourInDay = now.getHours() + hourFraction;
      const dayFraction = hourInDay / 24; // fraction of the current day
      
      // Update each frequency's phase based on its ID.
      // They will now complete one cycle per their time unit.
      const currentFrequencies = frequenciesRef.current;
      currentFrequencies.forEach((unit) => {
        switch (unit.id) {
          case "seconds":
            // Cycle over 1 second
            unit.phase = secFraction * 2 * Math.PI + Math.PI/2;
            break;
          case "minutes":
            // Cycle over 60 seconds (one minute)
            unit.phase = minuteFraction * 2 * Math.PI + Math.PI/2;
            break;
          case "hours":
            // Cycle over 60 minutes (one hour)
            unit.phase = hourFraction * 2 * Math.PI + Math.PI/2;
            break;
          case "days":
            // Cycle over 24 hours (one day)
            unit.phase = dayFraction * 2 * Math.PI + Math.PI/2;
            break;
          default:
            // Fallback for any custom unit
            unit.phase = t * unit.frequency * 2 * Math.PI + Math.PI/2;
        }
      });
      
      // Update sound if enabled - map the composite wave to musical notes
      if (isSoundOnRef.current && synthRef.current) {
        // Calculate composite wave value
        let waveValue = 0;
        currentFrequencies.forEach((unit) => {
          waveValue += unit.amplitude * Math.sin(unit.phase);
        });
        
        // Scale to reasonable range
        const normalizedValue = (waveValue + 375) / 750; // Normalize to [0, 1]
        
        // Map to musical scale (pentatonic and minor scales for pleasant sound)
        // Using a dynamic scale selection based on the wave characteristics
        let musicScale = [];
        const scaleSelector = Math.sin(currentTime * 0.05); // Slowly change scale over time
        
        if (scaleSelector > 0.3) {
          // C major pentatonic: C, D, E, G, A (bright, happy)
          musicScale = ['C', 'D', 'E', 'G', 'A'];
        } else if (scaleSelector > -0.3) {
          // A minor pentatonic: A, C, D, E, G (bluesy, soulful)
          musicScale = ['A', 'C', 'D', 'E', 'G'];
        } else {
          // D minor pentatonic: D, F, G, A, C (melancholic, mysterious)
          musicScale = ['D', 'F', 'G', 'A', 'C'];
        }
        
        const octaves = [3, 4, 5];
        
        // Select base note from our musical scale
        const scaleIndex = Math.floor(normalizedValue * musicScale.length);
        const clampedScaleIndex = Math.min(Math.max(0, scaleIndex), musicScale.length - 1);
        const note = musicScale[clampedScaleIndex];
        
        // Select octave based on days and hours components
        const daysComponent = currentFrequencies.find(f => f.id === 'days');
        const hoursComponent = currentFrequencies.find(f => f.id === 'hours');
        let octaveSelector = 0;
        if (daysComponent) octaveSelector += Math.sin(daysComponent.phase) * 0.5;
        if (hoursComponent) octaveSelector += Math.sin(hoursComponent.phase) * 0.5;
        
        const octaveIndex = Math.floor((octaveSelector + 1) / 2 * octaves.length);
        const clampedOctaveIndex = Math.min(Math.max(0, octaveIndex), octaves.length - 1);
        const octave = octaves[clampedOctaveIndex];
        
        // Combine note and octave
        const fullNote = `${note}${octave}`;
        
        // Add chord notes for richness based on seconds and minutes components
        const secondsComponent = currentFrequencies.find(f => f.id === 'seconds');
        const minutesComponent = currentFrequencies.find(f => f.id === 'minutes');
        
        // Create chord array starting with the main note
        const chord = [fullNote];
        
        // Add a fifth above (pleasing harmony) if seconds wave is in the right phase
        if (secondsComponent && Math.sin(secondsComponent.phase) > 0.3) {
          const fifthIndex = (clampedScaleIndex + 2) % musicScale.length;
          chord.push(`${musicScale[fifthIndex]}${octave}`);
        }
        
        // Add another chord note based on minutes component
        if (minutesComponent && Math.sin(minutesComponent.phase) > 0.5) {
          const thirdIndex = (clampedScaleIndex + 1) % musicScale.length;
          chord.push(`${musicScale[thirdIndex]}${octave}`);
        }
        
        // Handle note transitions - release notes no longer in chord
        const currentNoteSet = new Set(chord);
        const currentNotesString = Array.from(currentNoteSet).sort().join(',');
        
        // Update active notes
        const notesToRelease: string[] = [];
        activeNotesRef.current.forEach((time, note) => {
          if (!currentNoteSet.has(note)) {
            notesToRelease.push(note);
          }
        });
        
        // Release notes no longer in the chord
        if (notesToRelease.length > 0) {
          synthRef.current.triggerRelease(notesToRelease, Tone.now());
          notesToRelease.forEach(note => activeNotesRef.current.delete(note));
        }
        
        // Calculate transition state
        const now = Tone.now();
        // Calculate time since last frequency change
        const timeSinceChange = (now as number) - transitionsRef.current.lastFrequencyChange;
        const transitionProgress = Math.min(1, timeSinceChange / transitionsRef.current.transitionDuration);
        const isTransitioning = timeSinceChange < transitionsRef.current.transitionDuration;
        
        // Find frequencies that are transitioning in or out
        const transitioningIn = transitionsRef.current.fadingIn.length > 0;
        const transitioningOut = transitionsRef.current.fadingOut.length > 0;
        
        // Identify any notes associated with transitioning frequencies
        const isNoteTransitioning = (note: string): boolean => {
          // Get frequency affecting this note from chord
          const chordIndex = chord.indexOf(note);
          if (chordIndex === -1) return false;
          
          // Check if any frequency components affecting this note are transitioning
          if (transitioningIn || transitioningOut) {
            // Check if this note is primarily affected by days/hours (which affect octave selection)
            if (note.includes('3') || note.includes('5')) {
              return transitionsRef.current.fadingIn.includes('days') || 
                     transitionsRef.current.fadingOut.includes('days') ||
                     transitionsRef.current.fadingIn.includes('hours') || 
                     transitionsRef.current.fadingOut.includes('hours');
            }
            // Check if this note is primarily affected by seconds/minutes (which affect chord construction)
            else if (chordIndex > 0) {
              return transitionsRef.current.fadingIn.includes('seconds') || 
                     transitionsRef.current.fadingOut.includes('seconds') ||
                     transitionsRef.current.fadingIn.includes('minutes') || 
                     transitionsRef.current.fadingOut.includes('minutes');
            }
          }
          
          return false;
        };
        
        // Modify velocity and envelope based on transition state
        let velocityMultiplier = 1;
        let attackModifier = 0;
        let releaseModifier = 0;
        
        if (isTransitioning) {
          // Check if we have transitioning frequencies
          if (transitioningIn || transitioningOut) {
            // Adjust velocity for smoother transitions
            velocityMultiplier = 0.4 + (0.6 * transitionProgress);
            attackModifier = 0.1 * (1 - transitionProgress);
            releaseModifier = 0.3 * (1 - transitionProgress);
          }
        }
        
        // Trigger new notes in the chord with transition-aware parameters
        chord.forEach(note => {
          if (!activeNotesRef.current.has(note)) {
            // Base duration calculation
            let duration = 0.3 + Math.abs(normalizedValue) * 0.7;
            if (secondsComponent) duration += Math.abs(Math.sin(secondsComponent.phase)) * 0.2;
            
            // Apply transition modifications to note trigger
            if (synthRef.current) {
              // During transitions, we modify the synth's envelope temporarily
              if (isTransitioning && (transitioningIn || transitioningOut || isNoteTransitioning(note))) {
                const voice = synthRef.current.get();
                
                // Store original values to restore later
                const origAttack = voice.envelope.attack as number;
                const origRelease = voice.envelope.release as number;
                
                // Apply smoother attack and release during transitions
                voice.envelope.attack = Math.max(0.01, origAttack + attackModifier); 
                voice.envelope.release = Math.max(0.1, origRelease + releaseModifier);
                
                // Trigger with modified velocity
                synthRef.current.triggerAttack(note, Tone.now(), velocityMultiplier);
                
                // Restore original envelope settings
                setTimeout(() => {
                  if (synthRef.current) {
                    const voice = synthRef.current.get();
                    voice.envelope.attack = origAttack;
                    voice.envelope.release = origRelease;
                  }
                }, 50);
              } else {
                // Normal trigger when not transitioning
                synthRef.current.triggerAttack(note, Tone.now());
              }
            }
            
            // Track the active note
            activeNotesRef.current.set(note, Tone.now());
          }
        });
      }
      
      // Draw the composite waveform
      p5.background(10, 10, 15);
      p5.push();
      p5.translate(panOffset.x, panOffset.y);
      p5.scale(zoomLevel);
      const centerY = p5.height / 2 / zoomLevel;
      p5.push();
      p5.translate(0, centerY);
      p5.stroke(255, 255, 255, 200);
      p5.beginShape();
      
      // Use a constant spatial frequency to control the number of cycles drawn on screen
      const spatialFrequency = (2 * Math.PI) / (p5.width / zoomLevel);
      const pointsPerPixel = 1;
      const totalPoints = (p5.width * pointsPerPixel) / zoomLevel;
      
      for (let i = 0; i <= totalPoints; i++) {
        const x = i / pointsPerPixel;
        let y = 0;
        currentFrequencies.forEach((unit) => {
          y += unit.amplitude * Math.sin(spatialFrequency * x + unit.phase);
        });
        p5.vertex(x, y);
      }
      
      p5.endShape();
      p5.pop();
      p5.pop();
    };
  }, []);
  
  // Start/stop the Tone.js audio context on user interaction while maintaining visual continuity
  const handleStartAudio = async () => {
    if (!isSoundOn) {
      await Tone.start();
      toneTimeOffsetRef.current = Tone.now() - p5TimeRef.current;
      // No need to start synth - it will be triggered by notes
    } else {
      // Release all active notes
      if (synthRef.current && activeNotesRef.current.size > 0) {
        const allNotes = Array.from(activeNotesRef.current.keys());
        synthRef.current.triggerRelease(allNotes, Tone.now());
        activeNotesRef.current.clear();
      }
    }
    setIsSoundOn((prev) => !prev);
  };
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0f] overflow-hidden">
      {/* Add CSS animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-in-out;
        }
        
        .animate-pulse {
          animation: pulse 2s infinite;
        }
      `}</style>
      <div ref={canvasContainerRef} className="absolute inset-0">
        <ReactP5Wrapper sketch={sketch} />
      </div>
      
      {/* Sound Controls - Minimalist Design */}
      <div className="absolute top-6 right-6 flex flex-col gap-3 z-10">
        <button 
          onClick={handleStartAudio}
          className={`w-12 h-12 rounded-full backdrop-blur-lg ${isSoundOn ? 'bg-white/15 shadow-lg shadow-white/5' : 'bg-white/10'} flex items-center justify-center text-white/90 hover:bg-white/20 transition-all duration-300 border-none`}
          aria-label={isSoundOn ? "Turn sound off" : "Turn sound on"}
        >
          {isSoundOn ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          )}
        </button>
        
        {isSoundOn && (
          <div className="flex flex-col items-center gap-3 mt-1 p-3 backdrop-blur-lg bg-white/10 rounded-2xl transition-all duration-300 ease-in-out">
            <input 
              type="range" 
              min="-40" 
              max="0" 
              value={volume} 
              onChange={(e) => setVolume(parseInt(e.target.value))} 
              className="w-28 h-1 accent-white/90 bg-white/20 rounded-full appearance-none cursor-pointer"
            />
            <span className="text-white/80 text-xs font-light tracking-wide">{volume} dB</span>
          </div>
        )}
      </div>
      
      {/* Frequency Selection Bar - Minimalist Design */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-wrap items-center justify-center gap-3 p-4 backdrop-blur-lg bg-white/10 rounded-2xl z-10">
        {/* Active frequencies */}
        {frequencies.map((unit) => (
          <div 
            key={unit.id} 
            className="flex items-center gap-2 px-3 py-1.5 bg-black/30 rounded-full text-white/90 text-xs backdrop-blur-sm animate-fadeIn"
            style={{ 
              borderLeft: `2px solid ${unit.color}`,
              animation: 'fadeIn 0.3s ease-in-out'
            }}
          >
            <span className="font-light tracking-wide">{unit.label}</span>
            <button
              onClick={() => handleRemoveFrequency(unit.id)}
              className="w-4 h-4 flex items-center justify-center rounded-full bg-black/20 text-white/80 hover:bg-black/40 transition-colors"
              title="Remove frequency"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        ))}
        
        {/* Add Frequency button and dropdown - shown when any frequency is removed */}
        {removedFrequencies.length > 0 && (
          <div className="relative">
            <button 
              onClick={toggleDropdown}
              className="px-3 py-1.5 bg-black/30 rounded-full text-white/90 text-xs hover:bg-black/40 transition-all duration-300 flex items-center gap-1.5 backdrop-blur-sm animate-pulse"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span className="font-light tracking-wide">Add Frequency</span>
            </button>
            
            {/* Dropdown menu with animation */}
            {isDropdownOpen && (
              <div 
                className="absolute bottom-full mb-2 w-48 bg-black/50 backdrop-blur-lg rounded-lg overflow-hidden shadow-lg"
                style={{
                  animation: 'slideDown 0.3s ease-out forwards',
                  transformOrigin: 'bottom center'
                }}
              >
                {removedFrequencies.map((unit) => (
                  <button
                    key={unit.id}
                    onClick={() => handleAddFrequency(unit)}
                    className="w-full px-3 py-2 text-left text-white/90 text-xs hover:bg-white/10 transition-colors flex items-center gap-2"
                    style={{
                      animation: 'fadeIn 0.3s ease-in-out',
                      borderLeft: `2px solid ${unit.color}`
                    }}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: unit.color }}></span>
                    <span className="font-light tracking-wide">{unit.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="absolute bottom-3 left-3 text-white/40 text-xs font-light tracking-wide">
        Time Waveforms
      </div>
    </div>
  );
}
