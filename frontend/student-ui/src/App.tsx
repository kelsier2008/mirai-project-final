import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import Home from './pages/Home';
import Help from './pages/Help';
import Login from './pages/Login';
import Subjects from './pages/Subjects';
import { CourseStub, Stub } from './pages/Stub';
import Attendance from './pages/Attendance';
import Calendar from './pages/Calendar';
import Certificates from './pages/Certificates';
import Community from './pages/Community';
import Notifications from './pages/Notifications';
import Records from './pages/Records';
import Submit from './pages/Submit';

export default function App() {
  const { status } = useAuth();
  if (status === 'loading') return <div className="flex h-full items-center justify-center text-muted" role="status">Loading…</div>;
  if (status === 'anonymous') return <Login />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="community" element={<Community />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="submit" element={<Submit />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="records" element={<Records />} />
        <Route path="notifications" element={<Notifications />} />
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
