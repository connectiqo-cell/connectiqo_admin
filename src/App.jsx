import { AppRouter } from "./app/router/AppRouter.jsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary.jsx";

function App() {
  return (
    <ErrorBoundary fullPage>
      <AppRouter />
    </ErrorBoundary>
  );
}

export default App;
