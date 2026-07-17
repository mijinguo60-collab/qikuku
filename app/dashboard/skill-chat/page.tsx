import { redirect } from 'next/navigation';

/** Legacy link compatibility: Skill selection is now part of unified AI chat. */
export default function LegacySkillChatPage({ searchParams }: { searchParams: { skill?: string } }) {
  const query = searchParams.skill ? `?skill=${encodeURIComponent(searchParams.skill)}` : '';
  redirect(`/dashboard/chat${query}`);
}
