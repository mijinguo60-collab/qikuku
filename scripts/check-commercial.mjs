import { existsSync } from 'fs';

const pages = [
  'app/page.tsx', 'app/pricing/page.tsx', 'app/contact/page.tsx',
  'app/security/page.tsx', 'app/faq/page.tsx', 'app/onboarding/page.tsx',
];
const apis = ['app/api/leads/route.ts'];
pages.forEach(p => console.log(p, 'exists:', existsSync(p)));
apis.forEach(a => console.log(a, 'exists:', existsSync(a)));
console.log('commercial ready:', pages.every(p => existsSync(p)) && apis.every(a => existsSync(a)));
