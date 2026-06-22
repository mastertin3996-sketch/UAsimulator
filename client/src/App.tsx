import { Dashboard } from './components/Dashboard';
import { initialDashboardState } from './data/mockData';
import './index.css';

export default function App() {
  return <Dashboard initialState={initialDashboardState} />;
}
