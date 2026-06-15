import { EditorLayout } from '@/layout/EditorLayout';
import { SplashScreen } from '@/ui/SplashScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { useProjectStore } from '@/store/projectStore';

export default function App() {
  const view = useProjectStore((s) => s.view);
  return (
    <>
      <SplashScreen durationMs={3000} />
      {view === 'editor' ? <EditorLayout /> : <HomeScreen />}
    </>
  );
}
