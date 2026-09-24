import { SearchStateProvider } from '../features/search/SearchStateProvider';
import { Shell } from '../shell/Shell';

export function App() {
  return (
    <SearchStateProvider>
      <Shell />
    </SearchStateProvider>
  );
}
