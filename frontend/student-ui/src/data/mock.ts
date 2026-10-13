// TODO(api): Everything in this file is placeholder data. The Mirai API is a club-activity
// tracker and has no endpoints for academic subjects, assignments, FAQs, program/semester or
// highlight banners. Replace each export with a real call in src/api/services.ts when the
// backend adds them (see README "Swapping mock data for the real API").
import type {
  AcademicProfile, Assignment, Faq, FaqCategory, HighlightItem, Subject,
} from '../api/types';

// TODO(api): no program/batch/semester on GET /auth/me.
export const mockAcademic: AcademicProfile = { program: 'BTECH', batch: '2026-30', semester: 'Semester 1' };

// TODO(api): no highlights/banners endpoint. Placeholder art lives in src/assets.
export const mockHighlights: HighlightItem[] = [
  { id: 'h1', image: 'poster', alt: 'Poster: Something unbelievable happened at Mirai' },
  { id: 'h2', image: 'speaker', alt: 'A speaker presenting at a podium in front of students' },
];

export const mockSubjects: Subject[] = [
  { id: 'dsa', title: 'DSA', subtitle: 'Nishant Singh', type: 'Core', tone: 'blue', art: 'books' },
  { id: 'web', title: 'WEB DEVELOPMENT', subtitle: 'Deepika Bhansali', type: 'Core', tone: 'purple', art: 'tablet' },
  { id: 'eng', title: 'English & Communication Skills', subtitle: 'Ms Soni Vijayvargiya', type: 'Core', tone: 'mint', art: 'envelope' },
  { id: 'cv', title: 'Constitutional Value Sem 1', subtitle: '0025 · Shivini Rathore', type: 'Core', tone: 'blue', art: 'notepad' },
  { id: 'chem', title: 'Chemistry Lab Sem 1', subtitle: '0024 · Anil Sharma', type: 'Core', tone: 'mint', art: 'pen' },
  { id: 'maths', title: 'Maths Sem 1', subtitle: '0022 · Keshav Gupta', type: 'Core', tone: 'purple', art: 'notepad' },
  { id: 'pd', title: 'Product Development', subtitle: '0026 · Faculty TBA', type: 'Core', tone: 'blue', art: 'check' },
  { id: 'phy', title: 'Physics Sem 1', subtitle: '0023 · Faculty TBA', type: 'Core', tone: 'mint', art: 'books' },
];

// dueInDays < 0 means overdue.
export const mockAssignments: Assignment[] = [
  { id: 'a1', subjectId: 'dsa', subject: 'DSA', title: 'Revision-1', dueInDays: -3 },
  { id: 'a2', subjectId: 'dsa', subject: 'DSA', title: 'Switch Case-1', dueInDays: -1 },
  { id: 'a3', subjectId: 'pd', subject: 'Product Development', title: 'What problem are you solving?', dueInDays: 4 },
];

export const faqCategories: FaqCategory[] = [
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'selection', label: 'Selection Process' },
  { id: 'program', label: 'Program' },
  { id: 'scholarship', label: 'Scholarship & Financing' },
  { id: 'internships', label: 'Internships FAQs' },
  { id: 'placements', label: 'Placements FAQs' },
];

// TODO(api): placeholder answers; replace with the official copy.
export const mockFaqs: Faq[] = [
  { id: 'f1', category: 'program', question: 'What is Mirai, and how is it different from a regular college?', answer: 'Mirai is a school of technology that pairs a university degree with hands-on, industry-style learning. (Placeholder answer.)' },
  { id: 'f2', category: 'program', question: 'Where are Mirai’s programs offered?', answer: 'Programs run at Mirai’s partner college campuses. (Placeholder answer.)' },
  { id: 'f3', category: 'program', question: 'What programs can I pursue through Mirai’s partner colleges?', answer: 'Degree programs offered with partner colleges, such as BTech. (Placeholder answer.)' },
  { id: 'f4', category: 'program', question: 'Is this a full-time program?', answer: 'Yes, it is a full-time, on-campus program. (Placeholder answer.)' },
  { id: 'f5', category: 'eligibility', question: 'What kind of degree and certification will I receive after completing my program?', answer: 'You receive the partner university’s degree plus Mirai certifications. (Placeholder answer.)' },
  { id: 'f6', category: 'eligibility', question: 'Does this program qualify me for higher education and entrance exams in the future?', answer: 'Yes, the degree is recognised for higher studies. (Placeholder answer.)' },
  { id: 'f7', category: 'selection', question: 'What should I do if my query isn’t answered here?', answer: 'Reach out to the Mirai support team and we will get back to you. (Placeholder answer.)' },
  { id: 'f8', category: 'scholarship', question: 'How can I delete my account?', answer: 'Contact support from your registered email to request account deletion. (Placeholder answer.)' },
];
