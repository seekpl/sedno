import { redirect } from 'next/navigation';
import { AFTER_LOGIN_PATH } from '@/lib/auth/next-path';

export default function AccountHome() {
  redirect(AFTER_LOGIN_PATH);
}
