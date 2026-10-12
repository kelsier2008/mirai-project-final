import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import Home from './pages/Home';
import Help from './pages/Help';
import Login from './pages/Login';
import Subjects from './pages/Subjects';
import { CourseStub, Stub } from './pages/Stub';

export default function App() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="flex h-full items-center justify-center text-muted" role="status">Loading…</div>;
  if (status === 'anonymous') return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="calendar" element={<Stub title="Calendar" />} />
        <Route path="community" element={<Stub title="Community" />} />
        <Route path="attendance" element={<Stub title="My Attendance" />} />
        <Route path="fees" element={<Stub title="Fee Payment" />} />
        <Route path="courses" element={<Subjects />} />
        <Route path="courses/:id" element={<CourseStub />} />
        <Route path="academy" element={<Stub title="Mirai Academy" />} />
        <Route path="help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
