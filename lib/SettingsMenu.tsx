'use client';
import * as React from 'react';
import { Track, RoomEvent, createAudioAnalyser } from 'livekit-client';
import {
  useMaybeLayoutContext,
  useRoomContext,
} from '@livekit/components-react';

export interface SettingsMenuProps extends React.HTMLAttributes<HTMLDivElement> {}

export function SettingsMenu(props: SettingsMenuProps) {
  const layoutContext = useMaybeLayoutContext();
  const room = useRoomContext();

  const [micDevices, setMicDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [spkDevices, setSpkDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = React.useState('');
  const [selectedSpk, setSelectedSpk] = React.useState('');
  const [audioLevel, setAudioLevel] = React.useState(0);

  // Enumerate devices
  React.useEffect(() => {
    const enumerate = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMicDevices(devices.filter((d) => d.kind === 'audioinput'));
        setSpkDevices(devices.filter((d) => d.kind === 'audiooutput'));
      } catch {}
    };
    enumerate();
    navigator.mediaDevices.addEventListener('devicechange', enumerate);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate);
  }, []);

  // Track current mic device
  React.useEffect(() => {
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (mic?.track) {
      const settings = mic.track.mediaStreamTrack.getSettings();
      if (settings.deviceId) setSelectedMic(settings.deviceId);
    }
  }, [room]);

  // Audio level meter
  React.useEffect(() => {
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!mic?.track) return;

    let cleanup: (() => void) | undefined;
    try {
      const { analyser, cleanup: c } = createAudioAnalyser(mic.track as any, {
        fftSize: 256,
        smoothingTimeConstant: 0.4,
      });
      cleanup = c;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf: number;
      const update = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(Math.min(avg / 80, 1));
        raf = requestAnimationFrame(update);
      };
      update();
      return () => {
        cancelAnimationFrame(raf);
        cleanup?.();
      };
    } catch {
      return cleanup;
    }
  }, [room, selectedMic]);

  const handleMicChange = async (deviceId: string) => {
    setSelectedMic(deviceId);
    try {
      await room.switchActiveDevice('audioinput', deviceId);
    } catch (e) {
      console.error('Failed to switch mic:', e);
    }
  };

  const handleSpkChange = async (deviceId: string) => {
    setSelectedSpk(deviceId);
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch (e) {
      console.error('Failed to switch speaker:', e);
    }
  };

  const testSpeaker = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close();
      }, 500);
    } catch {}
  };

  const closeSettings = () => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' });

  // Input level bars (12 segments)
  const totalBars = 12;
  const activeBars = Math.round(audioLevel * totalBars);

  return (
    <div className="settings-menu" style={{ width: '100%', position: 'relative' }} {...props}>
      {/* Drag handle */}
      <div className="settings-drag-handle" />

      {/* Header */}
      <div className="settings-header">
        <div>
          <div className="settings-title">Media Devices</div>
          <div className="settings-subtitle">Choose how you listen and speak</div>
        </div>
        <button className="settings-close-btn" onClick={closeSettings} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f5675" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
        </button>
      </div>

      {/* Microphone section */}
      <div className="settings-section">
        <div className="settings-section-label">Microphone</div>
        <div className="settings-device-select">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
          </svg>
          <select
            value={selectedMic}
            onChange={(e) => handleMicChange(e.target.value)}
          >
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7d849f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="settings-chevron">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* Input level */}
      <div className="settings-input-level">
        <div className="settings-input-level-label">Input level</div>
        <div className="settings-level-bars">
          {Array.from({ length: totalBars }).map((_, i) => (
            <div
              key={i}
              className="settings-level-bar-segment"
              style={{
                background: i < activeBars ? (i < 8 ? '#16a34a' : i < 10 ? '#d98a12' : '#e04848') : '#c3c8d4',
              }}
            />
          ))}
        </div>
      </div>

      {/* Speaker section */}
      <div className="settings-section">
        <div className="settings-section-label">Speaker & Headphones</div>
        <div className="settings-device-select">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M11 5 6 9H2v6h4l5 4V5Z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
          </svg>
          <select
            value={selectedSpk}
            onChange={(e) => handleSpkChange(e.target.value)}
          >
            {spkDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Speaker ${d.deviceId.slice(0, 5)}`}
              </option>
            ))}
          </select>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7d849f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="settings-chevron">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {/* Buttons */}
      <div className="settings-buttons">
        <button className="settings-test-btn" onClick={testSpeaker}>
          Test speaker
        </button>
        <button className="settings-done-btn" onClick={closeSettings}>
          Done
        </button>
      </div>
    </div>
  );
}
