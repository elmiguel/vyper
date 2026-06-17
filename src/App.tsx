import { useEffect } from 'react';
import { EditorLayout } from '@/layout/EditorLayout';
import { ModelerLayout } from '@/modeler/ModelerLayout';
import { SplashScreen } from '@/ui/SplashScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { useProjectStore } from '@/store/projectStore';
import { useEditorStore } from '@/store/editorStore';

export default function App() {
  const view = useProjectStore((s) => s.view);
  const loadAssetManifest = useEditorStore((s) => s.loadAssetManifest);
  // Populate the built-in asset library once on startup.
  useEffect(() => {
    void loadAssetManifest();
  }, [loadAssetManifest]);
  return (
    <>
      <SplashScreen durationMs={3000} />
      {view === 'editor' && <EditorLayout />}
      {view === 'modeler' && <ModelerLayout />}
      {(view === 'home' || view === 'loading') && <HomeScreen />}
    </>
  );
}
