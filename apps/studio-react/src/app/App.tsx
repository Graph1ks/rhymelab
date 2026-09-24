import { DocumentWorkspaceProvider } from '../features/library/DocumentWorkspaceProvider';
import { SearchStateProvider } from '../features/search/SearchStateProvider';
import { Shell } from '../shell/Shell';

export function App() {
  return (
    <DocumentWorkspaceProvider>
      <SearchStateProvider>
        <Shell />
      </SearchStateProvider>
    </DocumentWorkspaceProvider>
  );
}
