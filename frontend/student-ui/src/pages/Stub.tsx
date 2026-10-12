import { Link, useParams } from 'react-router-dom';
import { Card } from '../components/Card';

export function Stub({ title }: { title: string }) {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-[38px]">
      <h1 className="text-[28px] font-medium text-ink">{title}</h1>
      <Card className="mt-6 p-8 text-muted">{/* TODO: build this screen */}{title} is coming soon.</Card>
    </div>
  );
}

export function CourseStub() {
  const { id } = useParams();
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-[38px]">
      <Link to="/courses" className="text-sm font-medium text-primary hover:underline">← My Subjects</Link>
      <h1 className="mt-3 text-[28px] font-medium text-ink">Course: {id}</h1>
      <Card className="mt-6 p-8 text-muted">{/* TODO: course detail screen */}Course details are coming soon.</Card>
    </div>
  );
}
