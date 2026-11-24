import { useWindowFullScreen } from './useWindowFullScreen';
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from './window';

const LIGHTS = [
  { label: 'Close', color: 'bg-[#ff5f57]', run: closeWindow },
  { label: 'Minimize', color: 'bg-[#febc2e]', run: minimizeWindow },
  { label: 'Zoom', color: 'bg-[#28c840]', run: toggleMaximizeWindow },
] as const;

/**
 * Dev only: stand-ins for macOS's traffic lights while lut previews macOS on another OS (`VITE_LUT_PLATFORM`), at
 * about where macOS draws them over the window's top-left corner, so the room lut keeps for them can be judged.
 * Hidden in full screen, as macOS hides them.
 */
export function DevTrafficLights() {
  const fullScreen = useWindowFullScreen();
  if (fullScreen) return null;
  return (
    <div data-dev-traffic-lights className="fixed top-2 left-3.5 z-[9999] flex gap-2">
      {LIGHTS.map(({ label, color, run }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          tabIndex={-1}
          className={`size-3 rounded-full ${color}`}
          onClick={() => void run()}
        />
      ))}
    </div>
  );
}
