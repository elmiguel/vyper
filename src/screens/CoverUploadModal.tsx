import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageUp, Loader2, X } from 'lucide-react';
import { fileToCoverDataUrl } from './coverImage';

/** Modal for choosing a card cover: drop an image or click to browse. Hands the
 *  caller a downscaled data URL; the caller persists it. */
export function CoverUploadModal({
  projectName,
  onPick,
  onClose,
}: {
  projectName: string;
  onPick: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (PNG, JPG or WebP).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onPick(await fileToCoverDataUrl(file));
    } catch (e) {
      setError((e as Error).message || 'Could not process that image.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div className="cover-modal" onClick={(e) => e.stopPropagation()}>
        <header className="cover-modal-head">
          <span>Set cover — {projectName}</span>
          <button className="sc-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <button
          type="button"
          className={`cover-drop ${drag ? 'drag' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files); }}
        >
          {busy ? <Loader2 className="spin" size={26} /> : <ImageUp size={26} />}
          <p>Drop an image here, or click to browse</p>
          <span className="cover-drop-hint">PNG, JPG or WebP — scaled to fit the card</span>
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { void handle(e.target.files); e.target.value = ''; }}
        />
        {error && <div className="cover-err">{error}</div>}
      </div>
    </div>,
    document.body,
  );
}
